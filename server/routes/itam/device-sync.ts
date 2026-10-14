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

import { deviceSyncServiceToken } from '../../providers/index.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { BusinessRuleError } from '../../providers/itam/errors.js';
import { errorResponse, principalId, requireGrant } from './http.js';

/**
 * `/api/itam/device-sync` (2026-10-14): where each device management
 * platform stands, and a pull started by hand. Both belong to 设置 → 设备同步,
 * so both take the settings grant. What a platform says about one device is
 * read on that device (`GET /api/itam/devices/:id/managed`).
 */
export const deviceSyncRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const sync = app.container.resolve(deviceSyncServiceToken);

    routes.use(
      '*',
      auth.required(),
      authorization.middleware(),
      requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
    );

    routes.get('/', async (context) => {
      try {
        return context.json({ data: await sync.status() });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // Answers with the runs as soon as they are open; the pulls carry on,
    // and the page asks `GET /` again until none is running.
    routes.post('/run', async (context) => {
      try {
        const runs = await sync.start('manual', principalId(context));
        if (runs.length === 0)
          throw new BusinessRuleError(
            'No device management platform is configured',
            'deviceSync.notConfigured',
          );
        return context.json({ data: runs }, 202);
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/device-sync', routes);
    return router;
  });
