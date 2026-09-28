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
import { Hono } from 'hono';
import { z } from 'zod';

import {
  maintenanceServiceToken,
  workbenchServiceToken,
} from '../../providers/index.js';
import { REMINDER_KINDS } from '../../providers/itam/maintenance.js';
import {
  decideCollection,
  errorResponse,
  principalId,
  type ItamContext,
} from './http.js';

/**
 * `/api/itam/workbench`: "my work" for the signed-in user, the rule-layer
 * reminders (needs `read` on `reminders`), and the maintenance jobs
 * (listing and manual runs need `update` on the settings resource).
 */
export const workbenchRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const maintenance = app.container.resolve(maintenanceServiceToken);
    const workbench = app.container.resolve(workbenchServiceToken);

    routes.use('*', auth.required(), authorization.middleware());
    const decider =
      (context: ItamContext) => async (collection: string, action: string) => {
        try {
          return await decideCollection(context, collection, action);
        } catch {
          return undefined;
        }
      };

    routes.get('/my-work', async (context) => {
      try {
        return context.json({
          data: await workbench.myWork(principalId(context), decider(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/reminders', async (context) => {
      try {
        await decideCollection(context, 'reminders', 'read');
        return context.json({ data: await maintenance.reminderCounts() });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/reminders/:kind', async (context) => {
      try {
        await decideCollection(context, 'reminders', 'read');
        const kind = z.enum(REMINDER_KINDS).parse(context.req.param('kind'));
        return context.json({ data: await maintenance.reminders(kind) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/workbench', routes);
    return router;
  });
