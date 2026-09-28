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

import { approvalServiceToken } from '../../providers/index.js';
import {
  errorResponse,
  parseListOptions,
  principalId,
  decideCollection,
} from './http.js';

/** `/api/itam/approvals`: the caller's queue and the approval history. */
export const approvalRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const approvals = app.container.resolve(approvalServiceToken);
    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/', async (context) => {
      try {
        const conditions = await decideCollection(context, 'approvals', 'read');
        return context.json(
          await approvals.list(parseListOptions(context), conditions),
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/pending', async (context) => {
      try {
        const conditions = await decideCollection(context, 'approvals', 'read');
        return context.json({
          data: await approvals.pendingFor(principalId(context), conditions),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/approvals', routes);
    return router;
  });
