import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  DEVICE_STATUSES,
  RESERVATION_TYPES,
  RETURN_TARGETS,
} from '../../providers/itam/device-status.js';
import {
  deviceServiceToken,
  deviceReviewServiceToken,
  deviceSyncServiceToken,
  historyServiceToken,
} from '../../providers/index.js';
import { DEVICE_LIFECYCLE } from '../../lifecycles/devices.js';
import { narrowBySyncState } from '../../providers/itam/device-review.js';
import { lifecycleRuntimeToken } from '../../providers/itam/lifecycles.js';
import {
  COUNT_FIELDS,
  type CountField,
  type OperationContext,
} from '../../providers/itam/devices.js';
import {
  errorResponse,
  parseListOptions,
  principalId,
  historyKind,
  operationContextOf,
  readJsonObject,
  decideFor,
  type ItamContext,
} from './http.js';
import { ValidationError } from '../../providers/itam/errors.js';
import { assignSchema, deviceSchema } from './device-schemas.js';

/** `/api/itam/devices`: CRUD, statistics, and the lifecycle operations. */

const id = z.string().min(1).max(64);

const loanSchema = assignSchema.extend({
  expectedReturnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const deviceRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const devices = app.container.resolve(deviceServiceToken);
    const history = app.container.resolve(historyServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    // The shared decision: the Collection's own actions are asked for
    // directly, a business operation on the resource declared for it.
    const decide = async (
      context: ItamContext,
      action: string,
      params?: DatabaseAuthorizationParams,
    ) => decideFor(context, 'devices', action, params);

    const operationContext = (context: ItamContext): OperationContext =>
      operationContextOf(context);

    routes.get('/', async (context) => {
      try {
        const conditions = await decide(context, 'read');
        const review = app.container.resolve(deviceReviewServiceToken);
        // 同步状态 is no column: it narrows to the devices in that state.
        const result = await devices.list(
          await narrowBySyncState(review, parseListOptions(context)),
          conditions,
        );
        // While a platform is connected, each row says when a platform
        // last heard from it (the list's 最后同步 column).
        if (!(await review.active()))
          return context.json({ ...result, syncConnected: false });
        const synced = await review.lastSync(
          result.data.map((row) => String(row.id)),
        );
        return context.json({
          ...result,
          data: result.data.map((row) => ({
            ...row,
            lastSyncAt: synced.get(String(row.id)) ?? null,
          })),
          syncConnected: true,
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/stats', async (context) => {
      try {
        const conditions = await decide(context, 'read');
        return context.json({ data: await devices.stats(conditions) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // 设置 → 流程 → 设备 (2026-10-19): the lifecycle as its flowchart draws
    // it, from source; nothing about any one device.
    routes.get('/lifecycle', async (context) => {
      try {
        await decide(context, 'read');
        return context.json({
          data: lifecycleDescriptionView(
            app.container.resolve(lifecycleRuntimeToken),
            DEVICE_LIFECYCLE,
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/counts', async (context) => {
      try {
        const by = new URL(context.req.url).searchParams.get('by') ?? '';
        if (!(COUNT_FIELDS as readonly string[]).includes(by)) {
          return context.json(
            { code: 'VALIDATION', message: 'Unknown count field', field: 'by' },
            400,
          );
        }
        const conditions = await decide(context, 'read');
        return context.json({
          data: await devices.countsBy(by as CountField, conditions),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:id', async (context) => {
      try {
        const conditions = await decide(context, 'read');
        const device = await devices.get(context.req.param('id'), conditions);
        return device
          ? context.json({ data: device })
          : context.json(
              { code: 'NOT_FOUND', message: 'Device not found' },
              404,
            );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:id/history', async (context) => {
      try {
        const conditions = await decide(context, 'read');
        const deviceId = context.req.param('id');
        if (!(await devices.get(deviceId, conditions))) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Device not found' },
            404,
          );
        }
        const options = parseListOptions(context);
        const limit = options.pageSize ?? 30;
        const offset = ((options.page ?? 1) - 1) * limit;
        const subject = { subjectType: 'devices', subjectId: deviceId };
        return context.json(
          await history.timeline(subject, {
            limit,
            offset,
            kind: historyKind(context),
          }),
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // What each device management platform reports about this device
    // (device sync, 2026-10-14): whoever may read the device may read it.
    routes.get('/:id/managed', async (context) => {
      try {
        const conditions = await decide(context, 'read');
        const deviceId = context.req.param('id');
        if (!(await devices.get(deviceId, conditions)))
          return context.json(
            { code: 'NOT_FOUND', message: 'Device not found' },
            404,
          );
        const sync = app.container.resolve(deviceSyncServiceToken);
        const review = app.container.resolve(deviceReviewServiceToken);
        return context.json({
          data: await sync.forDevice(deviceId),
          connected: await sync.connected(),
          // Where the platforms and the register disagree on it (step 2).
          checks: await review.checks({ deviceIds: [deviceId] }),
          // 不需要纳管, with the reason (2026-10-15).
          exemption: await review.exemptionOf(deviceId),
          // Whether its category should be on a platform at all (2026-10-16).
          managedCategory: await review.inManagedCategory(deviceId),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:id/delete-impact', async (context) => {
      try {
        await decide(context, 'delete');
        return context.json({
          data: await devices.deleteImpact(context.req.param('id')),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/', async (context) => {
      try {
        // The create dialog shows the category and manufacturer the model
        // brings, and sends them back; they always follow the model, so
        // they are accepted here and dropped.
        // `assignTo` / `loanTo` (2026-10-16): created 使用中 or 借出, assigned
        // or loaned in the same step, which also takes that action.
        const {
          categoryId: _category,
          manufacturerId: _manufacturer,
          assignTo,
          loanTo,
          ...input
        } = deviceSchema
          .extend({
            categoryId: id.nullable().optional(),
            manufacturerId: id.nullable().optional(),
            assignTo: assignSchema.strict().optional(),
            loanTo: loanSchema.strict().optional(),
          })
          .strict()
          .parse(await readJsonObject(context));
        if (assignTo && loanTo)
          throw new ValidationError(
            'A new device is either assigned or loaned',
            'loanTo',
          );
        const conditions = await decide(context, 'create', {
          fields: { input: Object.keys(input) },
        });
        const start = assignTo
          ? {
              action: 'assign' as const,
              input: assignTo,
              conditions: await decide(context, 'assign'),
            }
          : loanTo
            ? {
                action: 'loan' as const,
                input: loanTo,
                conditions: await decide(context, 'loan'),
              }
            : undefined;
        const created = await devices.create(
          input,
          operationContext(context),
          conditions,
          start,
        );
        // A device a platform already reports is linked at once (device
        // sync, step 2); a failure there never undoes the create.
        await app.container
          .resolve(deviceSyncServiceToken)
          .matchDevice(String(created.id), principalId(context))
          .catch(() => undefined);
        return context.json({ data: created }, 201);
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/batch', async (context) => {
      try {
        const input = z
          .object({
            modelId: id,
            locationId: id,
            quantity: z.number().int().min(1).max(500),
            serialNos: z.array(z.string().max(128)).optional(),
            common: deviceSchema
              .omit({
                modelId: true,
                locationId: true,
                serialNo: true,
                deviceNo: true,
              })
              .strict()
              .optional(),
          })
          .strict()
          .parse(await readJsonObject(context));
        const conditions = await decide(context, 'create', {
          fields: {
            input: [
              'modelId',
              'locationId',
              ...Object.keys(input.common ?? {}),
            ],
          },
        });
        return context.json(
          {
            data: await devices.batchCreate(
              input,
              operationContext(context),
              conditions,
            ),
          },
          201,
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.patch('/:id', async (context) => {
      try {
        const input = deviceSchema
          .strict()
          .partial()
          .parse(await readJsonObject(context));
        if (Object.keys(input).length === 0) {
          return context.json(
            { code: 'VALIDATION', message: 'Nothing to update' },
            400,
          );
        }
        const conditions = await decide(context, 'update', {
          fields: { input: Object.keys(input) },
        });
        return context.json({
          data: await devices.update(
            context.req.param('id'),
            input,
            operationContext(context),
            conditions,
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.delete('/:id', async (context) => {
      try {
        const conditions = await decide(context, 'delete');
        await devices.delete(
          context.req.param('id'),
          operationContext(context),
          conditions,
        );
        return context.json({ data: { deleted: 1 } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    type Conditions = Awaited<ReturnType<typeof decide>>;
    const operation = (
      path: string,
      action: string,
      run: (
        context: ItamContext,
        deviceId: string,
        body: Record<string, unknown>,
        conditions: Conditions,
      ) => Promise<unknown>,
    ) => {
      routes.post(`/:id/${path}`, async (context) => {
        try {
          const body =
            context.req.header('content-length') === '0' ||
            !context.req.header('content-type')
              ? {}
              : await readJsonObject(context);
          const conditions = await decide(context, action);
          return context.json({
            data: await run(context, context.req.param('id'), body, conditions),
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      });
    };

    operation('assign', 'assign', async (context, deviceId, body, conditions) =>
      devices.assign(
        deviceId,
        assignSchema.strict().parse(body),
        operationContext(context),
        conditions,
      ),
    );
    operation('loan', 'loan', async (context, deviceId, body, conditions) =>
      devices.loan(
        deviceId,
        loanSchema.strict().parse(body),
        operationContext(context),
        conditions,
      ),
    );
    operation('return', 'return', async (context, deviceId, body, conditions) =>
      devices.return(
        deviceId,
        z
          .object({
            nextStatus: z
              .enum(RETURN_TARGETS as [string, ...string[]])
              .optional(),
            locationId: id.optional(),
            // A conclusion, kept in the history entry: room for a few
            // lines rather than one (2026-10-16).
            condition: z.string().trim().max(2000).nullable().optional(),
          })
          .strict()
          .parse(body) as never,
        operationContext(context),
        conditions,
      ),
    );
    operation(
      'transfer',
      'transfer',
      async (context, deviceId, body, conditions) =>
        devices.transfer(
          deviceId,
          assignSchema.strict().parse(body),
          operationContext(context),
          conditions,
        ),
    );
    operation(
      'reserve',
      'reserve',
      async (context, deviceId, body, conditions) =>
        devices.reserve(
          deviceId,
          z
            .object({
              reservedForType: z.enum(RESERVATION_TYPES),
              reservedForId: id,
              reservedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            })
            .strict()
            .parse(body),
          operationContext(context),
          conditions,
        ),
    );
    operation(
      'unreserve',
      'reserve',
      async (context, deviceId, _body, conditions) =>
        devices.unreserve(deviceId, operationContext(context), conditions),
    );
    operation(
      'mark-lost',
      'update',
      async (context, deviceId, body, conditions) =>
        devices.markLost(
          deviceId,
          z
            .object({ notes: z.string().trim().min(1).max(2000) })
            .strict()
            .parse(body).notes,
          operationContext(context),
          conditions,
        ),
    );
    operation(
      'restore',
      'update',
      async (context, deviceId, _body, conditions) =>
        devices.restore(deviceId, operationContext(context), conditions),
    );
    operation(
      'retire',
      'update',
      async (context, deviceId, _body, conditions) =>
        devices.retire(deviceId, operationContext(context), conditions),
    );
    operation(
      'reactivate',
      'update',
      async (context, deviceId, _body, conditions) =>
        devices.reactivate(deviceId, operationContext(context), conditions),
    );
    operation(
      'correct-status',
      'correctStatus',
      async (context, deviceId, body, conditions) =>
        devices.correctStatus(
          deviceId,
          z
            .object({
              status: z.enum(DEVICE_STATUSES),
              reason: z.string().trim().min(1).max(2000),
            })
            .strict()
            .parse(body),
          operationContext(context),
          conditions,
        ),
    );

    router.route('/itam/devices', routes);
    return router;
  });
