import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';
import { Hono } from 'hono';
import { z } from 'zod';

type Row = Record<string, unknown>;

import {
  approvalServiceToken,
  disposalServiceToken,
  historyServiceToken,
} from '../../providers/index.js';
import {
  DATA_WIPE_OPTIONS,
  DISPOSAL_METHODS,
  DISPOSAL_REASONS,
  WIPE_METHODS,
} from '../../providers/itam/disposals.js';
import { DISPOSAL_LIFECYCLE } from '../../lifecycles/disposals.js';
import { approverDirectoryToken } from '../../providers/itam/approvers.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { lifecycleRuntimeToken } from '../../providers/itam/lifecycles.js';
import { createCrudRoutes } from './crud-routes.js';
import { listWithMine } from './mine-view.js';
import {
  errorResponse,
  principalId,
  readJsonObject,
  requireGrant,
} from './http.js';

/** `/api/itam/disposals`: device list, approval steps and execution. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const disposalSchema = z.object({
  method: z.enum(DISPOSAL_METHODS),
  reason: z.enum(DISPOSAL_REASONS),
  // Required from 2026-10-20: why the devices go, in words.
  description: z.string().trim().min(1).max(20000),
  ownerId: id.optional(),
  requestedAt: date.nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  // How it is to be carried out: stated with the request, corrected while
  // it is still open, confirmed by the execution.
  recipientVendorId: id.nullable().optional(),
  recipientName: z.string().trim().max(255).nullable().optional(),
  dataWipe: z.enum(DATA_WIPE_OPTIONS).nullable().optional(),
  wipeMethod: z.enum(WIPE_METHODS).nullable().optional(),
  deviceIds: z.array(id).max(1000).optional(),
});

export const disposalRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const disposals = app.container.resolve(disposalServiceToken);
    const approvals = app.container.resolve(approvalServiceToken);
    const database = app.container.resolve(databaseManagerToken);
    const history = app.container.resolve(historyServiceToken);
    const lifecycles = app.container.resolve(lifecycleRuntimeToken);
    const approverDirectory = app.container.resolve(approverDirectoryToken);
    const approverRangeSchema = z.object({
      anyone: z.boolean(),
      roles: z.array(z.string().min(1).max(128)).max(50),
      users: z.array(id).max(100),
      revision: z.number().int().nonnegative(),
      requestId: z.string().min(1).max(128),
    });

    const routes = createCrudRoutes({
      collection: 'disposals',
      service: disposals,
      history,
      // 我的 and 待我审批, and whether each row waits on this reader
      // (2026-10-20): what waits on whom lives in the approval, not the
      // record (`mine-view.ts`).
      list: listWithMine({
        database,
        approvals,
        collection: 'disposals',
        subjectType: 'disposal',
        list: (options, conditions) => disposals.list(options, conditions),
      }),
      createSchema: disposalSchema,
      relationInputs: ['deviceIds'],
      // 负责人 stays editable while the request is open, the way the rest
      // of it does; `update` already refuses anything past
      // draft / rejected, and the approval settles it.
      updateSchema: disposalSchema.omit({ deviceIds: true }).partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        // The lifecycle as its flowchart draws it (2026-10-18): states and
        // transitions, from source; nothing about any one disposal.
        routes.get('/lifecycle', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: lifecycleDescriptionView(lifecycles, DISPOSAL_LIFECYCLE),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // 设置 → 报废流程 (2026-10-18): whom a submitter may ask to approve.
        // Anybody who may read disposals may see it, as the picker shows
        // the people anyway; changing it is the settings' own grant.
        routes.get('/lifecycle/approvers', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: await approverDirectory.approverRangeView('disposal'),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.put(
          '/lifecycle/approvers',
          requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
          async (context) => {
            try {
              const input = approverRangeSchema.parse(
                await readJsonObject(context),
              );
              return context.json({
                data: await approverDirectory.saveApproverRange(
                  'disposal',
                  input,
                  principalId(context),
                ),
              });
            } catch (error) {
              return errorResponse(context, error);
            }
          },
        );
        // Where one disposal stands on it: its state, what the reader may
        // do next and why not, the moves it made, and the notifications
        // they owe — never the record itself, whose fields the reader's
        // field rules shape on the record's own route.
        routes.get('/:id/lifecycle', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            const disposalId = context.req.param('id');
            if (!(await disposals.get(disposalId, conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            const view = await lifecycles.view(DISPOSAL_LIFECYCLE, disposalId, {
              id: principalId(context),
            });
            return context.json({
              data: {
                state: view.state,
                version: view.version,
                available: view.available.map((transition) => ({
                  name: transition.name,
                  allowed: transition.allowed,
                  blockers: transition.blockers.map((blocker) => ({
                    code: blocker.code,
                    kind: blocker.kind,
                  })),
                })),
                history: view.history.transitions.map((entry) => ({
                  transition: entry.transition,
                  from: entry.from,
                  to: entry.to,
                  actorId: entry.actorId,
                  at: entry.at,
                })),
                effects: view.history.effectRuns.map((run) => ({
                  effect: run.effect,
                  status: run.status,
                  attempts: run.attempts,
                })),
              },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // The disposals a device is or was listed on, for its detail page.
        routes.get('/for-device/:deviceId', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            const rows = await disposals.forDevice(
              context.req.param('deviceId'),
            );
            // Row and field rules apply as on the disposal itself: a
            // disposal the caller may not read is left out.
            const data: Row[] = [];
            for (const row of rows) {
              const visible = await disposals.get(String(row.id), conditions);
              if (visible) data.push(visible);
            }
            return context.json({ data });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/devices', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await disposals.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            const canSeeCost =
              (conditions.fieldAccess?.output ?? '*') === '*' ||
              (conditions.fieldAccess?.output ?? '*').includes(
                'bookValueTotal',
              );
            const rows = await disposals.devices(context.req.param('id'));
            return context.json({
              data: canSeeCost
                ? rows
                : rows.map(
                    ({ bookValue: _b, currentBookValue: _c, ...rest }) => rest,
                  ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/approvals', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await disposals.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: await approvals.forSubject(
                'disposal',
                context.req.param('id'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation(
          'devices',
          'update',
          (context, disposalId, body, conditions) =>
            disposals.setDevices(
              disposalId,
              z
                .object({ deviceIds: z.array(id).max(1000) })
                .strict()
                .parse(body).deviceIds,
              operationContext(context),
              conditions,
            ),
        );
        operation('submit', 'submit', (context, disposalId, body, conditions) =>
          disposals.submit(
            disposalId,
            z.object({ approverId: id.optional() }).strict().parse(body)
              .approverId,
            operationContext(context),
            conditions,
          ),
        );
        operation(
          'withdraw',
          'submit',
          (context, disposalId, _body, conditions) =>
            disposals.withdraw(
              disposalId,
              operationContext(context),
              conditions,
            ),
        );
        operation(
          'decide',
          'approve',
          (context, disposalId, body, conditions) => {
            const input = z
              .object({
                decision: z.enum(['approved', 'rejected']),
                comment: z.string().max(2000).optional(),
              })
              .strict()
              .parse(body);
            return disposals.decide(
              disposalId,
              input.decision,
              input.comment,
              operationContext(context),
              conditions,
            );
          },
        );
        operation(
          'execute',
          'execute',
          (context, disposalId, body, conditions) =>
            disposals.execute(
              disposalId,
              z
                .object({
                  disposedAt: date.optional(),
                  proceeds: z.number().min(0).nullable().optional(),
                  expenses: z.number().min(0).nullable().optional(),
                  currency: z.string().trim().max(8).nullable().optional(),
                  recipientVendorId: id.nullable().optional(),
                  recipientName: z
                    .string()
                    .trim()
                    .max(255)
                    .nullable()
                    .optional(),
                  dataWipe: z.enum(DATA_WIPE_OPTIONS),
                  wipeMethod: z.enum(WIPE_METHODS).nullable().optional(),
                  executedById: id.nullable().optional(),
                })
                .strict()
                .parse(body),
              operationContext(context),
              conditions,
            ),
        );
      },
    });

    router.route('/itam/disposals', routes);
    return router;
  });
