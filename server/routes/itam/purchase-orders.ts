import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  approvalServiceToken,
  historyServiceToken,
  procurementServiceToken,
} from '../../providers/index.js';
import { outputFields, pickFields } from '../../providers/itam/authz-filter.js';
import {
  LINE_ITEM_TYPES,
  PO_REASONS,
} from '../../providers/itam/procurement.js';
import { createCrudRoutes } from './crud-routes.js';
import { decideCollection, errorResponse, principalId } from './http.js';

/** `/api/itam/purchase-orders`: lines, the approval steps, ordering and receiving. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// The vendor it goes to is stated when the request is written, and so is
// the department it is for, when it is for one. The update schema is this one partial, so an order made
// before the vendor was required keeps what it has until it is edited.
const orderSchema = z.object({
  reason: z.enum(PO_REASONS),
  description: z.string().max(20000).nullable().optional(),
  ownerId: id.optional(),
  departmentId: id.nullable().optional(),
  neededBy: date.nullable().optional(),
  vendorId: id,
  currency: z.string().trim().max(8).nullable().optional(),
  expectedAt: date.nullable().optional(),
});

const lineSchema = z.object({
  id: id.optional(),
  itemType: z.enum(LINE_ITEM_TYPES),
  modelId: id.nullable().optional(),
  softwareProductId: id.nullable().optional(),
  quantity: z.number().int().min(1).max(10000),
  unitPrice: z.number().min(0).nullable().optional(),
});

/**
 * A line as the caller may read it. Lines are a collection of their own, so
 * reading the order does not open them: a role without cost access reads
 * every line field but the unit price. The id stays, since editing and
 * receiving a line name it.
 */
function readableLines(
  lines: readonly Readonly<Record<string, unknown>>[],
  conditions: DatabaseAuthorizationConditions,
): Readonly<Record<string, unknown>>[] {
  return lines.map((line) => ({
    ...pickFields(line, outputFields(Object.keys(line), conditions)),
    id: line.id,
  }));
}

export const purchaseOrderRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const procurement = app.container.resolve(procurementServiceToken);
    const approvals = app.container.resolve(approvalServiceToken);
    const history = app.container.resolve(historyServiceToken);

    const routes = createCrudRoutes({
      collection: 'purchaseOrders',
      service: procurement,
      history,
      // `view=myApproval` is the one view the service cannot express on its
      // own: which orders are waiting on *this* reader lives in the approval,
      // so the route resolves it to the ids and lists those.
      list: async (context, options, conditions) => {
        if (options.filter?.view !== 'myApproval')
          return procurement.list(options, conditions);
        const { view: _view, ...filter } = options.filter;
        const waiting = await approvals.pendingFor(
          principalId(context),
          await decideCollection(context, 'approvals', 'read'),
        );
        const ids = waiting
          .filter((entry) => entry.subjectType === 'purchaseOrder')
          .map((entry) => String(entry.subjectId));
        if (ids.length === 0)
          return {
            data: [],
            total: 0,
            page: options.page ?? 1,
            pageSize: options.pageSize ?? 20,
          };
        return procurement.list(
          { ...options, filter: { ...filter, id: ids } },
          conditions,
        );
      },
      createSchema: orderSchema,
      // 负责人 is editable like the rest of what the order asks for: the
      // service freezes it with them once the order is approved
      // (`SETTLED_EDITABLE`), and until then a request may be handed over
      // rather than cancelled and asked again.
      updateSchema: orderSchema.partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        routes.get('/:id/lines', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: readableLines(
                await procurement.lines(context.req.param('id')),
                await decideCollection(context, 'purchaseOrderLines', 'read'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.put('/:id/lines', async (context) => {
          try {
            const body = z
              .object({ lines: z.array(lineSchema.strict()).max(200) })
              .strict()
              .parse(await context.req.json());
            const conditions = await decide(context, 'update');
            // Lines are a collection of their own: what the caller may read
            // there decides what they may state here (a role without cost
            // access sees no unit price, so it neither writes nor clears one).
            const lineConditions = await decideCollection(
              context,
              'purchaseOrderLines',
              'read',
            );
            return context.json({
              data: readableLines(
                await procurement.setLines(
                  context.req.param('id'),
                  body.lines,
                  operationContext(context),
                  conditions,
                  lineConditions,
                ),
                lineConditions,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/approvals', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: await approvals.forSubject(
                'purchaseOrder',
                context.req.param('id'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/receipts', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: {
                receipts: await procurement.receipts(context.req.param('id')),
                generated: await procurement.generated(context.req.param('id')),
              },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation('submit', 'submit', (context, orderId, body, conditions) =>
          procurement.submit(
            orderId,
            z.object({ approverId: id.optional() }).strict().parse(body)
              .approverId,
            operationContext(context),
            conditions,
          ),
        );
        operation('withdraw', 'submit', (context, orderId, _body, conditions) =>
          procurement.withdraw(orderId, operationContext(context), conditions),
        );
        operation('decide', 'approve', (context, orderId, body, conditions) => {
          const input = z
            .object({
              decision: z.enum(['approved', 'rejected']),
              comment: z.string().max(2000).optional(),
            })
            .strict()
            .parse(body);
          return procurement.decide(
            orderId,
            input.decision,
            input.comment,
            operationContext(context),
            conditions,
          );
        });
        operation('order', 'order', (context, orderId, body, conditions) =>
          procurement.markOrdered(
            orderId,
            // Placing the order answers both dates at once: when it went
            // out, and what the vendor promised. Neither reads on the page
            // before this, so neither may be left out here.
            z
              .object({ orderedAt: date, expectedAt: date })
              .strict()
              .parse(body),
            operationContext(context),
            conditions,
          ),
        );
        operation('receive', 'receive', (context, orderId, body, conditions) =>
          procurement.receive(
            orderId,
            z
              .object({
                lineId: id,
                quantity: z.number().int().min(1).max(10000),
                notes: z.string().max(2000).nullable().optional(),
                serialNos: z.array(z.string().max(128)).optional(),
                locationId: id.optional(),
                stockItemId: id.nullable().optional(),
                entitlementId: id.nullable().optional(),
                extra: z.record(z.string(), z.unknown()).optional(),
              })
              .strict()
              .parse(body),
            operationContext(context),
            conditions,
          ),
        );
        operation('cancel', 'update', (context, orderId, body, conditions) =>
          procurement.cancel(
            orderId,
            z
              .object({ reason: z.string().trim().min(1).max(2000) })
              .strict()
              .parse(body).reason,
            operationContext(context),
            conditions,
          ),
        );
      },
    });

    router.route('/itam/purchase-orders', routes);
    return router;
  });
