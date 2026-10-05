import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
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
import { createCrudRoutes } from './crud-routes.js';
import { decideCollection, errorResponse, principalId } from './http.js';

/** `/api/itam/disposals`: device list, approval steps and execution. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const disposalSchema = z.object({
  method: z.enum(DISPOSAL_METHODS),
  reason: z.enum(DISPOSAL_REASONS),
  description: z.string().max(20000).nullable().optional(),
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
    const history = app.container.resolve(historyServiceToken);

    const routes = createCrudRoutes({
      collection: 'disposals',
      service: disposals,
      history,
      // `view=myApproval` is the one view the service cannot express on its
      // own: which disposals are waiting on *this* reader lives in the
      // approval, so the route resolves it to the ids and lists those.
      list: async (context, options, conditions) => {
        if (options.filter?.view !== 'myApproval')
          return disposals.list(options, conditions);
        const { view: _view, ...filter } = options.filter;
        const waiting = await approvals.pendingFor(
          principalId(context),
          await decideCollection(context, 'approvals', 'read'),
        );
        const ids = waiting
          .filter((entry) => entry.subjectType === 'disposal')
          .map((entry) => String(entry.subjectId));
        if (ids.length === 0)
          return {
            data: [],
            total: 0,
            page: options.page ?? 1,
            pageSize: options.pageSize ?? 20,
          };
        return disposals.list(
          { ...options, filter: { ...filter, id: ids } },
          conditions,
        );
      },
      createSchema: disposalSchema,
      relationInputs: ['deviceIds'],
      // 负责人 stays editable while the request is open, the way the rest
      // of it does; `update` already refuses anything past
      // draft / rejected, and the approval settles it.
      updateSchema: disposalSchema.omit({ deviceIds: true }).partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
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
