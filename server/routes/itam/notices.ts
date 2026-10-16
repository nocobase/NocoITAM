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
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

import { noticesOf } from '../../providers/itam/notices.js';
import { errorResponse, principalId } from './http.js';

/**
 * `/api/itam/notices?ids=…`: the records the reader's own in-app
 * notifications open (`providers/itam/notices.ts`), for the inbox. Signed
 * in is all it asks: it answers only about the caller's own items, and the
 * record is loaded afterwards under the caller's own grants.
 */
export const noticeRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);

    // The identity only: no collection is read through it.
    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/', async (context) => {
      try {
        const ids = (context.req.query('ids') ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        return context.json({
          data: await noticesOf(database, principalId(context), ids),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/notices', routes);
    return router;
  });
