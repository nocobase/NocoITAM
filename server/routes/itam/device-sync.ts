import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  deviceConnectionsServiceToken,
  deviceReviewServiceToken,
  deviceServiceToken,
  deviceSyncServiceToken,
} from '../../providers/index.js';
import {
  DEVICE_SOURCES,
  SourceError,
} from '../../providers/itam/device-sources.js';
import { compileAuthzScope } from '../../providers/itam/authz-filter.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { BusinessRuleError } from '../../providers/itam/errors.js';
import {
  decideFor,
  errorResponse,
  principalId,
  readJsonObject,
  requireGrant,
  type ItamContext,
} from './http.js';

const VIEWS = ['checks', 'unregistered', 'unmanaged', 'ignored'] as const;
const CHECK_KINDS = ['stale', 'userMismatch', 'statusMismatch'] as const;

/**
 * `/api/itam/device-sync`: where each device management platform stands
 * and a pull started by hand (2026-10-14, both on 设置 → 设备同步 and so
 * under the settings grant), and — step 2, 2026-10-15 — where the platforms
 * and the register disagree and what a person decides about it. Those are
 * the devices' business: a list takes devices `read`, a link or 以台账为准
 * the device's `update`, and keeping a platform record off the register
 * (or taking it back) devices `create`, the act it stands in for.
 */
export const deviceSyncRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const sync = app.container.resolve(deviceSyncServiceToken);
    const review = app.container.resolve(deviceReviewServiceToken);
    const devices = app.container.resolve(deviceServiceToken);
    const database = app.container.resolve(databaseManagerToken);
    const connections = app.container.resolve(deviceConnectionsServiceToken);

    routes.use('*', auth.required(), authorization.middleware());
    const settingsGrant = requireGrant(ITAM_SETTINGS_RESOURCE, 'update');

    routes.get('/', settingsGrant, async (context) => {
      try {
        return context.json({ data: await sync.status() });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // Answers with the runs as soon as they are open; the pulls carry on,
    // and the page asks `GET /` again until none is running.
    routes.post('/run', settingsGrant, async (context) => {
      try {
        const runs = await sync.start('manual', principalId(context));
        if (runs.length === 0)
          throw new BusinessRuleError(
            'No device management platform is configured',
            'deviceSync.notConfigured',
          );
        return context.json({ data: runs }, 202);
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // A platform's connection entered here rather than in `config.yml`
    // (2026-10-15), under the same settings grant. The client secret goes
    // in and never comes back out.
    const sourceParam = z.enum(DEVICE_SOURCES);
    const connectionInput = z.object({
      tenantId: z.string().max(255).optional(),
      url: z.string().max(1024).optional(),
      clientId: z.string().max(255).optional(),
      clientSecret: z.string().max(4096).optional(),
    });

    routes.get('/connections', settingsGrant, async (context) => {
      try {
        return context.json({
          data: {
            secretsReady: connections.secretsReady(),
            connections: await connections.describe(),
          },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.put('/connections/:source', settingsGrant, async (context) => {
      try {
        const source = sourceParam.parse(context.req.param('source'));
        const input = connectionInput.parse(await readJsonObject(context));
        return context.json({
          data: await connections.save(source, input, principalId(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.delete('/connections/:source', settingsGrant, async (context) => {
      try {
        const source = sourceParam.parse(context.req.param('source'));
        await connections.remove(source, principalId(context));
        return context.json({ data: { source } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // Signs in and reads one page, storing nothing. A refused sign-in or a
    // missing permission is the answer the person asked for, not an error.
    routes.post('/connections/:source/test', settingsGrant, async (context) => {
      try {
        const source = sourceParam.parse(context.req.param('source'));
        const input = connectionInput.parse(await readJsonObject(context));
        try {
          const result = await connections.test(source, input);
          return context.json({ data: { ok: true, ...result } });
        } catch (error) {
          if (!(error instanceof SourceError)) throw error;
          return context.json({
            data: {
              ok: false,
              failureCode: error.code,
              failure: error.message,
            },
          });
        }
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    /** The ids among `ids` the caller may act on with `action`. */
    const devicesInScope = async (
      context: ItamContext,
      action: string,
      ids: readonly string[],
    ): Promise<Set<string>> => {
      const conditions = await decideFor(context, 'devices', action);
      if (ids.length === 0) return new Set();
      const rows = await database
        .query()
        .selectFrom('devices')
        .select('id')
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .where('id', 'in', [...ids])
        .execute<{ id: string }>();
      return new Set(rows.map((row) => row.id));
    };

    /** Refuses unless the caller may `action` this device. */
    const requireDevice = async (
      context: ItamContext,
      action: string,
      deviceId: string,
    ) => {
      const conditions = await decideFor(context, 'devices', action);
      if (!(await devices.get(deviceId, conditions)))
        throw new BusinessRuleError('Device not found', 'deviceSync.noDevice');
    };

    // 管理平台核对: one view at a time. Everything here concerns devices, so
    // it is listed to whoever may read them.
    routes.get('/review', async (context) => {
      try {
        const view = z
          .enum(VIEWS)
          .parse(new URL(context.req.url).searchParams.get('view') ?? 'checks');
        if (view === 'checks') {
          const checks = await review.checks();
          const visible = await devicesInScope(
            context,
            'read',
            checks.map((check) => check.deviceId),
          );
          return context.json({
            data: checks.filter((check) => visible.has(check.deviceId)),
          });
        }
        if (view === 'unmanaged') {
          const rows = await review.unmanaged();
          const visible = await devicesInScope(
            context,
            'read',
            rows.map((row) => row.id),
          );
          return context.json({
            data: rows.filter((row) => visible.has(row.id)),
          });
        }
        await decideFor(context, 'devices', 'read');
        return context.json({
          data:
            view === 'unregistered'
              ? await review.unregistered()
              : await review.ignored(),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    const managedId = (context: ItamContext) => context.req.param('id') ?? '';

    routes.post('/devices/:id/link', async (context) => {
      try {
        const { deviceId } = z
          .object({ deviceId: z.string().min(1).max(64) })
          .parse(await readJsonObject(context));
        await requireDevice(context, 'update', deviceId);
        return context.json({
          data: await review.link(
            managedId(context),
            deviceId,
            principalId(context),
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/devices/:id/unlink', async (context) => {
      try {
        const row = await database
          .query()
          .selectFrom('managedDevices')
          .select('deviceId')
          .where('id', '=', managedId(context))
          .executeTakeFirst<{ deviceId: string | null }>();
        if (row?.deviceId) await requireDevice(context, 'update', row.deviceId);
        return context.json({
          data: await review.unlink(managedId(context), principalId(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/devices/:id/ignore', async (context) => {
      try {
        const { reason } = z
          .object({ reason: z.string().trim().min(1).max(500) })
          .parse(await readJsonObject(context));
        await decideFor(context, 'devices', 'create');
        return context.json({
          data: await review.ignore(
            managedId(context),
            reason,
            principalId(context),
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/devices/:id/restore', async (context) => {
      try {
        await decideFor(context, 'devices', 'create');
        return context.json({
          data: await review.restore(managedId(context), principalId(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // 以台账为准: this difference, with what was seen, is not raised again.
    routes.post('/checks/:deviceId/dismiss', async (context) => {
      try {
        const deviceId = context.req.param('deviceId') ?? '';
        const { kind } = z
          .object({ kind: z.enum(CHECK_KINDS) })
          .parse(await readJsonObject(context));
        await requireDevice(context, 'update', deviceId);
        await review.dismiss(deviceId, kind, principalId(context));
        return context.json({ data: { deviceId, kind } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // A leaver's devices still online after they left (2026-10-15): what
    // their 归属 tab warns of. The person under people `read`, the devices
    // under devices `read`.
    routes.get('/people/:personId/online', async (context) => {
      try {
        const personId = context.req.param('personId') ?? '';
        const people = await decideFor(context, 'people', 'read');
        await decideFor(context, 'devices', 'read');
        const person = await database
          .query()
          .selectFrom('people')
          .select(['id', 'leaveDate', 'employmentStatus'])
          .where((eb) => compileAuthzScope(eb, people.scope))
          .where('id', '=', personId)
          .executeTakeFirst<{
            id: string;
            leaveDate: string | null;
            employmentStatus: string | null;
          }>();
        if (!person)
          return context.json(
            { code: 'NOT_FOUND', message: 'Person not found' },
            404,
          );
        const leaveDate =
          person.employmentStatus === 'left' ? person.leaveDate : null;
        return context.json({
          data: leaveDate
            ? await review.onlineAfterLeavingOf(personId, leaveDate)
            : [],
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/device-sync', routes);
    return router;
  });
