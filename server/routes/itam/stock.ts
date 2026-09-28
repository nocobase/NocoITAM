import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  historyServiceToken,
  stockServiceToken,
} from '../../providers/index.js';
import {
  HOLDER_TYPES,
  STOCK_ADJUST_REASONS,
  STOCK_KINDS,
  type StockKind,
  STOCK_COUNT_FIELDS,
  type StockCountField,
} from '../../providers/itam/stock.js';
import { createCrudRoutes } from './crud-routes.js';
import { errorResponse } from './http.js';

/** `/api/itam/stock`: accessories, consumables and components. */
const id = z.string().min(1).max(64);
const optionalText = z.string().trim().max(512).nullable().optional();

export const stockSchema = z.object({
  kind: z.enum(STOCK_KINDS),
  name: z.string().trim().min(1).max(255),
  categoryId: id,
  modelId: id,
  manufacturerId: id.nullable().optional(),
  locationId: id,
  totalQuantity: z.number().int().min(0).optional(),
  minimumQuantity: z.number().int().min(0).optional(),
  notes: z.string().max(20000).nullable().optional(),
  // The category's extended fields; their shape is the template's,
  // which the record cannot validate against on its own.
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  ownerId: id.optional(),
});

const quantityInput = z.object({
  holderType: z.enum(HOLDER_TYPES),
  holderId: id,
  quantity: z.number().int().min(1),
  notes: optionalText,
});

export const stockRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const stock = app.container.resolve(stockServiceToken);
    const history = app.container.resolve(historyServiceToken);

    const routes = createCrudRoutes({
      collection: 'stockItems',
      service: stock,
      history,
      createSchema: stockSchema,
      updateSchema: stockSchema
        .omit({ kind: true, totalQuantity: true })
        .partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        routes.get('/counts', async (context) => {
          try {
            const by = new URL(context.req.url).searchParams.get('by') ?? '';
            if (!(STOCK_COUNT_FIELDS as readonly string[]).includes(by)) {
              return context.json(
                {
                  code: 'VALIDATION',
                  message: 'Unknown count field',
                  field: 'by',
                },
                400,
              );
            }
            const conditions = await decide(context, 'read');
            return context.json({
              data: await stock.countsBy(by as StockCountField, conditions),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/stats', async (context) => {
          try {
            const kind =
              new URL(context.req.url).searchParams.get('kind') ?? '';
            if (!(STOCK_KINDS as readonly string[]).includes(kind)) {
              return context.json(
                {
                  code: 'VALIDATION',
                  message: 'kind is required',
                  field: 'kind',
                },
                400,
              );
            }
            const conditions = await decide(context, 'read');
            return context.json({
              data: await stock.stats(kind as StockKind, conditions),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/holdings-of/:holderType/:holderId', async (context) => {
          try {
            await decide(context, 'read');
            const holderType = context.req.param('holderType');
            if (!(HOLDER_TYPES as readonly string[]).includes(holderType)) {
              return context.json(
                { code: 'VALIDATION', message: 'Unknown holder type' },
                400,
              );
            }
            const kind =
              new URL(context.req.url).searchParams.get('kind') ?? undefined;
            return context.json({
              data: await stock.holdingsOf(
                holderType as never,
                context.req.param('holderId'),
                kind as StockKind | undefined,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/holdings', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await stock.get(context.req.param('id'), conditions))) {
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            }
            return context.json({
              data: await stock.holdings(context.req.param('id')),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/purchases', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await stock.get(context.req.param('id'), conditions))) {
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            }
            return context.json({
              data: await stock.purchases(context.req.param('id')),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/movements', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await stock.get(context.req.param('id'), conditions))) {
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            }
            const url = new URL(context.req.url);
            const pageSize = Number(url.searchParams.get('pageSize') ?? 30);
            const page = Number(url.searchParams.get('page') ?? 1);
            return context.json(
              await stock.movements(context.req.param('id'), {
                limit: pageSize,
                offset: (page - 1) * pageSize,
                outstanding: url.searchParams.get('outstanding') === '1',
                holderType: url.searchParams.get('holderType') ?? undefined,
                type: url.searchParams.get('type') ?? undefined,
              }),
            );
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation('stock-in', 'stockIn', (context, itemId, body, conditions) =>
          stock.stockIn(
            itemId,
            z
              .object({
                quantity: z.number().int().min(1),
                notes: optionalText,
                purchaseOrderId: id.nullable().optional(),
              })
              .strict()
              .parse(body),
            operationContext(context),
            conditions,
          ),
        );
        // Authorized as `update`, like an entitlement's 调整席位: it changes
        // the quantity the record states, with a reason.
        operation('adjust', 'update', (context, itemId, body, conditions) =>
          stock.adjust(
            itemId,
            z
              .object({
                quantity: z.number().int(),
                reason: z.enum(STOCK_ADJUST_REASONS),
                notes: z.string().trim().max(2000).nullable().optional(),
              })
              .strict()
              .parse(body),
            operationContext(context),
            conditions,
          ),
        );
        operation('issue', 'issue', (context, itemId, body, conditions) =>
          stock.issue(
            itemId,
            quantityInput.strict().parse(body),
            operationContext(context),
            conditions,
          ),
        );
        operation('take-back', 'issue', (context, itemId, body, conditions) =>
          stock.takeBack(
            itemId,
            quantityInput.strict().parse(body),
            operationContext(context),
            conditions,
          ),
        );
      },
    });

    router.route('/itam/stock', routes);
    return router;
  });
