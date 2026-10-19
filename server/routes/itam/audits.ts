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
  auditServiceToken,
  historyServiceToken,
} from '../../providers/index.js';
import {
  ASSIGNEE_TYPES,
  DEVICE_OWNERSHIPS,
  DEVICE_STATUSES,
} from '../../providers/itam/device-status.js';
import {
  AUDIT_RESOLUTIONS,
  AUDIT_RESULTS,
} from '../../providers/itam/audits.js';
import { AUDIT_TASK_LIFECYCLE } from '../../lifecycles/audit-tasks.js';
import { lifecycleRuntimeToken } from '../../providers/itam/lifecycles.js';
import { createCrudRoutes } from './crud-routes.js';
import { errorResponse, readJsonObject } from './http.js';

/** `/api/itam/audits`: tasks, their items, counting and difference handling. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const scopeSchema = z
  .object({
    locationIds: z.array(id).max(200).optional(),
    departmentIds: z.array(id).max(200).optional(),
    categoryIds: z.array(id).max(200).optional(),
    deviceIds: z.array(id).max(5000).optional(),
  })
  .strict();

export const taskSchema = z.object({
  name: z.string().trim().min(1).max(255),
  scope: scopeSchema,
  plannedStart: date,
  plannedEnd: date,
  executorIds: z.array(id).min(1).max(50),
  // Starts at whoever creates the task when not named; required once set.
  ownerId: id.optional(),
  notes: z.string().max(20000).nullable().optional(),
});

const countSchema = z
  .object({
    itemId: id.optional(),
    deviceId: id.optional(),
    result: z.enum(['matched', 'mismatch', 'notFound']),
    actualLocationId: id.nullable().optional(),
    actualAssigneeId: id.nullable().optional(),
    actualAssigneeType: z.enum(ASSIGNEE_TYPES).nullable().optional(),
    actualStatus: z.enum(DEVICE_STATUSES).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

const resolveSchema = z
  .object({
    itemId: id,
    resolution: z.enum(
      AUDIT_RESOLUTIONS.filter((r) => r !== 'unresolved') as [
        'updateToActual',
        'markLost',
        'register',
        'markVerified',
      ],
    ),
    modelId: id.optional(),
    locationId: id.optional(),
    serialNo: z.string().trim().max(128).nullable().optional(),
    // Registering an unregistered item creates a device, so it asks what
    // the device page asks.
    name: z.string().trim().max(255).nullable().optional(),
    departmentId: id.nullable().optional(),
    ownership: z.enum(DEVICE_OWNERSHIPS).nullable().optional(),
    vendorId: id.nullable().optional(),
    purchasePrice: z.number().min(0).nullable().optional(),
    purchaseDate: date.nullable().optional(),
    warrantyEndDate: date.nullable().optional(),
    notes: z.string().max(20000).nullable().optional(),
    ownerId: id.nullable().optional(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export const auditRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const audits = app.container.resolve(auditServiceToken);
    const history = app.container.resolve(historyServiceToken);
    const lifecycles = app.container.resolve(lifecycleRuntimeToken);

    const routes = createCrudRoutes({
      collection: 'auditTasks',
      service: audits,
      history,
      createSchema: taskSchema,
      updateSchema: taskSchema.partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        // 设置 → 流程 → 盘点 (2026-10-19): the lifecycle as its flowchart
        // draws it, from source; nothing about any one stocktake.
        routes.get('/lifecycle', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: lifecycleDescriptionView(lifecycles, AUDIT_TASK_LIFECYCLE),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.post('/preview-scope', async (context) => {
          try {
            await decide(context, 'create');
            const scope = scopeSchema.parse(await readJsonObject(context));
            return context.json({
              data: { expected: await audits.previewScope(scope) },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/items', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await audits.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            const result = new URL(context.req.url).searchParams.get('result');
            return context.json({
              data: await audits.items(
                context.req.param('id'),
                result && (AUDIT_RESULTS as readonly string[]).includes(result)
                  ? result
                  : undefined,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation('start', 'start', (context, taskId, _body, conditions) =>
          audits.start(taskId, operationContext(context), conditions),
        );
        operation('count', 'count', (context, taskId, body, conditions) =>
          audits.count(
            taskId,
            z
              .object({ items: z.array(countSchema).min(1).max(500) })
              .strict()
              .parse(body).items,
            operationContext(context),
            conditions,
          ),
        );
        operation(
          'add-unregistered',
          'count',
          (context, taskId, body, conditions) =>
            audits.addUnregistered(
              taskId,
              z
                .object({
                  label: z.string().trim().min(1).max(255),
                  actualLocationId: id.nullable().optional(),
                  notes: z.string().max(2000).nullable().optional(),
                })
                .strict()
                .parse(body),
              operationContext(context),
              conditions,
            ),
        );
        operation('finish', 'finish', (context, taskId, _body, conditions) =>
          audits.finish(taskId, operationContext(context), conditions),
        );
        operation('resolve', 'resolve', (context, taskId, body, conditions) =>
          audits.resolve(
            taskId,
            z
              .object({ items: z.array(resolveSchema).min(1).max(500) })
              .strict()
              .parse(body).items,
            operationContext(context),
            conditions,
          ),
        );
        operation('cancel', 'cancel', (context, taskId, body, conditions) =>
          audits.cancel(
            taskId,
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

    router.route('/itam/audits', routes);
    return router;
  });
