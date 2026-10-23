import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  historyServiceToken,
  repairServiceToken,
} from '../../providers/index.js';
import { REPAIR_RECOMMENDATIONS } from '../../providers/itam/ai-reading.js';
import {
  REPAIR_DISPOSITIONS,
  REPAIR_QUOTE_DECISIONS,
  REPAIR_FAULT_CATEGORIES,
  REPAIR_METHODS,
  REPAIR_RESULTS,
} from '../../providers/itam/repairs.js';
import { REPAIR_LIFECYCLE } from '../../lifecycles/repairs.js';
import { lifecycleRuntimeToken } from '../../providers/itam/lifecycles.js';
import { createCrudRoutes } from './crud-routes.js';
import { errorResponse, maybeDecide } from './http.js';

/** `/api/itam/repairs`: CRUD filtered by device / vendor, plus completion. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const repairSchema = z.object({
  deviceId: id,
  method: z.enum(REPAIR_METHODS),
  vendorId: id.nullable().optional(),
  faultDescription: z.string().trim().min(1).max(20000),
  // Required from 2026-10-20: every repair says what kind of fault it is.
  faultCategory: z.enum(REPAIR_FAULT_CATEGORIES),
  sentAt: date.optional(),
  expectedReturnAt: date.nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  currency: z.string().trim().max(8).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  // Who is responsible for it, and so who may finish it. Left out, it is
  // whoever files the repair.
  ownerId: id.nullable().optional(),
});

export const repairRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const repairs = app.container.resolve(repairServiceToken);
    const history = app.container.resolve(historyServiceToken);
    const lifecycles = app.container.resolve(lifecycleRuntimeToken);

    const routes = createCrudRoutes({
      collection: 'repairs',
      service: repairs,
      history,
      createSchema: repairSchema,
      updateSchema: repairSchema
        .omit({ deviceId: true })
        .extend({
          // Corrections to a finished repair: the outcome and when it came back.
          result: z.enum(
            REPAIR_RESULTS.filter((value) => value !== 'inProgress') as [
              string,
              ...string[],
            ],
          ),
          actualReturnAt: date,
          // The vendor's quote while the device is away (2026-10-23), with
          // what Asset Steward advised at that price and what was decided.
          quoteAmount: z.number().min(0).nullable(),
          quoteNotes: z.string().max(20000).nullable(),
          quotedAt: date.nullable(),
          quoteRecommendation: z.enum(REPAIR_RECOMMENDATIONS).nullable(),
          quoteReasons: z.string().max(2000).nullable(),
          quoteDecision: z.enum(REPAIR_QUOTE_DECISIONS).nullable(),
        })
        .partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        // 设置 → 流程 → 维修 (2026-10-19): the lifecycle as its flowchart
        // draws it, from source; nothing about any one repair.
        routes.get('/lifecycle', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: lifecycleDescriptionView(lifecycles, REPAIR_LIFECYCLE),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation(
          'complete',
          'complete',
          async (context, repairId, body, conditions) =>
            repairs.complete(
              repairId,
              z
                .object({
                  result: z.enum(
                    REPAIR_RESULTS.filter((r) => r !== 'inProgress') as [
                      'repaired',
                      'unrepairable',
                      'replaced',
                      'cancelled',
                    ],
                  ),
                  actualReturnAt: date.optional(),
                  cost: z.number().min(0).nullable().optional(),
                  currency: z.string().trim().max(8).nullable().optional(),
                  notes: z.string().max(20000).nullable().optional(),
                  disposition: z.enum(REPAIR_DISPOSITIONS).optional(),
                })
                .strict()
                .parse(body),
              operationContext(context),
              conditions,
              // Whoever may delete repairs supervises them, and may close
              // one somebody else follows.
              {
                supervises: Boolean(
                  await maybeDecide(context, 'repairs', 'delete'),
                ),
              },
            ),
        );
      },
    });

    router.route('/itam/repairs', routes);
    return router;
  });
