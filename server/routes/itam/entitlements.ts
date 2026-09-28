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
  entitlementServiceToken,
  historyServiceToken,
} from '../../providers/index.js';
import {
  BILLING_CYCLES,
  BILLING_MODELS,
  ENTITLEMENT_KINDS,
  LICENSING_MODELS,
  SEAT_HOLDER_TYPES,
} from '../../providers/itam/entitlements.js';
import { createCrudRoutes } from './crud-routes.js';
import { errorResponse } from './http.js';

/**
 * `/api/itam/entitlements`: both kinds of software entitlement with seat
 * operations and the audited key reveal. The schema
 * accepts the union of columns; the service checks what the kind needs.
 */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().max(512).nullable().optional();

export const entitlementSchema = z.object({
  kind: z.enum(ENTITLEMENT_KINDS),
  softwareProductId: id,
  // Derived from the product; accepted so the form may send them back.
  categoryId: id.nullable().optional(),
  manufacturerId: id.nullable().optional(),
  name: z.string().trim().min(1).max(255),
  licensingModel: z.enum(LICENSING_MODELS).nullable().optional(),
  seatCount: z.number().int().min(0).nullable().optional(),
  productKey: z.string().max(4000).nullable().optional(),
  reassignable: z.boolean().optional(),
  startDate: date.nullable().optional(),
  expiryDate: date.nullable().optional(),
  maintenanceExpiryDate: date.nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  billingModel: z.enum(BILLING_MODELS).nullable().optional(),
  billingCycle: z.enum(BILLING_CYCLES).nullable().optional(),
  unitPrice: z.number().min(0).nullable().optional(),
  autoRenew: z.boolean().optional(),
  consoleUrl: z.string().trim().max(512).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  // The category's extended fields; their shape is the template's,
  // which the record cannot validate against on its own.
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  ownerId: id.optional(),
});

export const entitlementRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const entitlements = app.container.resolve(entitlementServiceToken);
    const history = app.container.resolve(historyServiceToken);

    const routes = createCrudRoutes({
      collection: 'entitlements',
      service: entitlements,
      history,
      createSchema: entitlementSchema,
      // The kind is fixed at creation; the service rejects it on update.
      updateSchema: entitlementSchema.omit({ kind: true }).partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        routes.get('/stats', async (context) => {
          try {
            return context.json({
              data: await entitlements.stats(await decide(context, 'read')),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/seats-of/:holderType/:holderId', async (context) => {
          try {
            await decide(context, 'read');
            const holderType = context.req.param('holderType');
            if (
              !(SEAT_HOLDER_TYPES as readonly string[]).includes(holderType)
            ) {
              return context.json(
                { code: 'VALIDATION', message: 'Unknown holder type' },
                400,
              );
            }
            return context.json({
              data: await entitlements.seatsOf(
                holderType as never,
                context.req.param('holderId'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/seats', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            const entitlementId = context.req.param('id');
            if (!(await entitlements.get(entitlementId, conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: { seats: await entitlements.seats(entitlementId) },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/purchases', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await entitlements.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: await entitlements.purchases(context.req.param('id')),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // Adjusting the seat count is an update the record states a reason
        // for, so it is authorized as one: a role that could edit the field
        // can adjust the count.
        operation(
          'adjust-seats',
          'update',
          (context, entitlementId, body, conditions) =>
            entitlements.adjustSeats(
              entitlementId,
              z
                .object({
                  quantity: z.number().int(),
                  notes: optionalText,
                })
                .strict()
                .parse(body),
              operationContext(context),
              conditions,
            ),
        );
        operation(
          'assign-seats',
          'assignSeat',
          (context, entitlementId, body, conditions) =>
            entitlements.assignSeats(
              entitlementId,
              z
                .object({
                  seats: z
                    .array(
                      z.object({
                        holderType: z.enum(SEAT_HOLDER_TYPES).optional(),
                        holderId: id.nullable().optional(),
                        account: z
                          .string()
                          .trim()
                          .min(1)
                          .max(255)
                          .nullable()
                          .optional(),
                        // A perpetual seat may carry its own key.
                        productKey: z
                          .string()
                          .trim()
                          .max(255)
                          .nullable()
                          .optional(),
                      }),
                    )
                    .min(1)
                    .max(200),
                })
                .strict()
                .parse(body).seats,
              operationContext(context),
              conditions,
            ),
        );
        operation(
          'reclaim-seats',
          'assignSeat',
          (context, entitlementId, body, conditions) =>
            entitlements.reclaimSeats(
              entitlementId,
              z
                .object({ seatIds: z.array(id).min(1).max(200) })
                .strict()
                .parse(body).seatIds,
              operationContext(context),
              conditions,
            ),
        );
        operation(
          'reveal-key',
          'viewKey',
          async (context, entitlementId, body, conditions) => ({
            productKey: await entitlements.revealKey(
              entitlementId,
              operationContext(context),
              conditions,
              z.object({ seatId: id.optional() }).strict().parse(body).seatId,
            ),
          }),
        );
        operation(
          'seat-key',
          'assignSeat',
          (context, entitlementId, body, conditions) => {
            const input = z
              .object({
                seatId: id,
                productKey: z.string().trim().max(255).nullable(),
              })
              .strict()
              .parse(body);
            return entitlements.setSeatKey(
              entitlementId,
              input.seatId,
              input.productKey,
              operationContext(context),
              conditions,
            );
          },
        );
      },
    });

    router.route('/itam/entitlements', routes);
    return router;
  });
