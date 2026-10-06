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
import { databaseManagerToken } from '@nocobase/db';

import { createDomainAccess } from '../../providers/itam/domains.js';
import {
  nameOf,
  referenceNames,
} from '../../providers/itam/reference-names.js';
import { REMINDER_KINDS } from '../../providers/itam/maintenance.js';
import {
  decideCollection,
  errorResponse,
  maybeDecide,
  principalId,
  type ItamContext,
} from './http.js';

/**
 * What the workbench's search box looks through, in the order its groups
 * read. A group is one list page: stock items are three, one per kind,
 * because each kind is its own page and "show all" opens that page.
 */
export const SEARCH_GROUPS: readonly {
  readonly key: string;
  readonly collection: string;
  readonly filter?: Readonly<Record<string, string>>;
}[] = [
  { key: 'devices', collection: 'devices' },
  { key: 'people', collection: 'people' },
  {
    key: 'accessories',
    collection: 'stockItems',
    filter: { kind: 'accessory' },
  },
  {
    key: 'consumables',
    collection: 'stockItems',
    filter: { kind: 'consumable' },
  },
  {
    key: 'components',
    collection: 'stockItems',
    filter: { kind: 'component' },
  },
  { key: 'entitlements', collection: 'entitlements' },
  { key: 'purchaseOrders', collection: 'purchaseOrders' },
  { key: 'repairs', collection: 'repairs' },
  { key: 'disposals', collection: 'disposals' },
  { key: 'auditTasks', collection: 'auditTasks' },
  { key: 'models', collection: 'models' },
  { key: 'softwareProducts', collection: 'softwareProducts' },
  { key: 'vendors', collection: 'vendors' },
  { key: 'locations', collection: 'locations' },
  { key: 'departments', collection: 'departments' },
  { key: 'categories', collection: 'categories' },
  { key: 'manufacturers', collection: 'manufacturers' },
];

/** Rows a group shows before "show all" takes over. */
const SEARCH_PAGE = 5;

/**
 * What a result needs to name itself and say what it is: the fields the
 * pages label records with, and a couple that tell two of a name apart.
 * Anything the caller may not read is already gone from the row.
 */
const SEARCH_FIELDS = [
  'id',
  'deviceNo',
  'orderNo',
  'disposalNo',
  'repairNo',
  'faultDescription',
  'name',
  'serialNo',
  'status',
  'kind',
  'employeeNo',
  'email',
  'code',
  'appliesTo',
] as const;

/**
 * References a result reads by name beside its own fields: what a device or
 * a stock item is a model of, what an entitlement licenses. A search can
 * match through them (`searchByReference`), so the result says so.
 */
const NAMED_REFERENCES = {
  modelId: 'modelName',
  softwareProductId: 'productName',
} as const;

/**
 * `/api/itam/workbench`: "my work" for the signed-in user, the rule-layer
 * reminders (needs `read` on `reminders`), and the search box (each group
 * under its own `read`).
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
        // `?scope=mine` narrows the team's queue to the reader's part.
        const scope =
          new URL(context.req.url).searchParams.get('scope') === 'mine'
            ? 'mine'
            : 'all';
        return context.json({
          data: await workbench.myWork(principalId(context), decider(context), {
            scope,
          }),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // 入职供需: every joiner's plan, worked out together, and what is short.
    routes.get('/onboarding-supply', async (context) => {
      try {
        const supply = await workbench.onboardingSupply(decider(context));
        if (!supply)
          return context.json(
            { code: 'FORBIDDEN', message: 'Not allowed' },
            403,
          );
        return context.json({ data: supply });
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

    /**
     * The search box: one request, each group read under the caller's own
     * `read` decision and left out when they hold none, so a reader is never
     * refused for a collection they were not asking about — and never shown
     * a record their pages would not list.
     */
    const domains = createDomainAccess(app.container);
    const database = app.container.resolve(databaseManagerToken);
    routes.get('/search', async (context) => {
      try {
        const q = z
          .string()
          .trim()
          .min(1)
          .max(100)
          .parse(context.req.query('q') ?? '');
        const decisions = new Map<
          string,
          Awaited<ReturnType<typeof maybeDecide>>
        >();
        for (const group of SEARCH_GROUPS)
          if (!decisions.has(group.collection))
            decisions.set(
              group.collection,
              await maybeDecide(context, group.collection, 'read'),
            );
        const groups = [];
        for (const group of SEARCH_GROUPS) {
          const conditions = decisions.get(group.collection);
          if (!conditions) continue;
          const result = await domains.list(
            group.collection,
            { q, filter: group.filter, page: 1, pageSize: SEARCH_PAGE },
            conditions,
          );
          if (result.total === 0) continue;
          // Only the references, so only their names are looked up — and
          // only where the caller may read the collection they name.
          const referenced = result.data.map((row) =>
            Object.fromEntries(
              Object.keys(NAMED_REFERENCES)
                .filter((field) => row[field] !== undefined)
                .map((field) => [field, row[field]]),
            ),
          );
          const names = await referenceNames(database, referenced, {
            readable: async (collection) =>
              Boolean(await maybeDecide(context, collection, 'read')),
          });
          groups.push({
            key: group.key,
            collection: group.collection,
            total: result.total,
            rows: result.data.map((row, index) => ({
              ...Object.fromEntries(
                SEARCH_FIELDS.filter((field) => row[field] !== undefined).map(
                  (field) => [field, row[field]],
                ),
              ),
              ...Object.fromEntries(
                Object.entries(NAMED_REFERENCES)
                  .filter(([field]) => typeof row[field] === 'string')
                  .map(([field, key]) => [
                    key,
                    nameOf(names, referenced[index] ?? {}, field),
                  ]),
              ),
            })),
          });
        }
        return context.json({ data: groups });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/workbench', routes);
    return router;
  });
