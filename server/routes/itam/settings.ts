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

import { resourceIdOf } from '../../providers/itam/authz-resources.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import {
  maintenanceServiceToken,
  settingsServiceToken,
} from '../../providers/index.js';
import {
  DEFAULT_ITAM_SETTINGS,
  type ItamSettingsKey,
} from '../../providers/itam/settings.js';
import {
  errorResponse,
  principalId,
  readJsonObject,
  requireGrant,
} from './http.js';
import { ValidationError } from '../../providers/itam/errors.js';

/**
 * ITAM configuration. `GET /api/itam/settings` returns the whole document,
 * which every signed-in user may read: thresholds and numbering shape what
 * pages show. Writing needs the `update` grant on the settings resource.
 */
const SETTINGS_KEYS = new Set<string>(Object.keys(DEFAULT_ITAM_SETTINGS));

export const settingsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const settings = app.container.resolve(settingsServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/', async (context) =>
      context.json({ data: await settings.all() }),
    );

    // Database grants carry policies and are absent from the client's
    // permission snapshot, so pages ask here which collection actions the
    // caller holds. The answer only drives what to show; every request is
    // still authorized on its own.
    // The Collection's own actions; everything else is a business operation.
    const CRUD_ACTIONS = new Set(['read', 'create', 'update', 'delete']);
    routes.get('/permissions', async (context) => {
      const url = new URL(context.req.url);
      const collection = url.searchParams.get('collection') ?? '';
      const actions = (url.searchParams.get('actions') ?? '')
        .split(',')
        .map((action) => action.trim())
        .filter(Boolean)
        .slice(0, 32);
      if (!/^[a-zA-Z]+$/.test(collection) || actions.length === 0) {
        return context.json(
          {
            code: 'VALIDATION',
            message: 'collection and actions are required',
          },
          400,
        );
      }
      const authz = context.get('authz');
      // Database decisions are "conditional" (they carry a record filter and
      // field sets), which `can()` reports as false; treat any non-deny as
      // held. A business operation is asked for on its own resource, the way
      // the route that performs it does (`decideFor` in `http.ts`).
      const results = await Promise.all(
        actions.map(async (action) => {
          const decision = await authz.authorize(
            CRUD_ACTIONS.has(action)
              ? {
                  resource: {
                    type: 'database.collection',
                    id: `main.${collection}`,
                  },
                  action,
                }
              : {
                  resource: { type: 'composite', id: resourceIdOf(collection) },
                  action,
                },
          );
          return decision.effect !== 'deny';
        }),
      );
      return context.json({
        data: Object.fromEntries(
          actions.map((action, index) => [action, results[index] ?? false]),
        ),
      });
    });

    routes.put(
      '/:key',
      requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
      async (context) => {
        const key = context.req.param('key');
        try {
          if (!SETTINGS_KEYS.has(key)) {
            throw new ValidationError('Unknown settings key', 'key');
          }
          const value = await readJsonObject(context);
          const saved = await settings.set(
            key as ItamSettingsKey,
            value as never,
            principalId(context),
          );
          // New thresholds show on the workbench at once rather than after
          // the next daily run (which used to need a manual 重新计算提醒).
          if (key === 'thresholds')
            await app.container
              .resolve(maintenanceServiceToken)
              .computeReminders();
          return context.json({ data: saved });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    router.route('/itam/settings', routes);
    return router;
  });
