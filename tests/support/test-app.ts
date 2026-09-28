import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import path from 'node:path';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { Application } from '@nocobase/app-server/application';
import { createSeeder, databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';

import { ITAM_RESOURCES } from '../../server/providers/itam/authz-resources.js';
import { findItamCollection } from '../../server/providers/itam/collections.js';
import ItamProvider from '../../server/providers/itam/index.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/**
 * A container with an in-memory database, the ITAM services, and test
 * doubles for authentication and authorization. Requests identify themselves
 * with `x-test-user` and `x-test-role`; the authorization double grants by
 * role so route tests cover the 401 / 403 / 200 boundary without the plugin's
 * own permission tables.
 */
export type TestRole = 'employee' | 'support' | 'manager' | 'noCost';

// Employees hold no collection grants of their own in this double; their
// pages read through the programmatic scope instead.
/** The actions a Collection owns; every other one is a business operation. */
const CRUD_ACTIONS = new Set(['read', 'create', 'update', 'delete']);

const ROLE_GRANTS: Readonly<
  Record<TestRole, (resource: string, action: string) => boolean>
> = {
  employee: () => false,
  support: (_resource, action) => action === 'read',
  manager: () => true,
  // A manager's grants whose reads leave out each collection's cost fields
  // (`costFields` in `collections.ts`), as IT support's seeded reads do.
  noCost: () => true,
};

/** What a `read` decision lets this role see of a collection. */
const readOutput = (role: TestRole, resourceId: string): '*' | string[] => {
  if (role !== 'noCost') return '*';
  const definition = findItamCollection(resourceId.replace(/^main\./, ''));
  if (!definition) return '*';
  const hidden = new Set(definition.costFields ?? []);
  return definition.fields.filter((field) => !hidden.has(field));
};

/** Users the programmatic authorization scope treats as managers. */
export const MANAGER_USERS: Set<string> = new Set(['mia', 'ann']);

/**
 * One notification as the services sent it, flattened to what the assertions
 * care about. The plugin takes a message per channel since template beta.43;
 * ITAM sends the in-app one, so the recipient and text are read from there.
 */
export interface SentNotification {
  readonly idempotencyKey: string;
  readonly to: { readonly type: string; readonly id: string };
  readonly content: { readonly title?: string; readonly body: string };
}

interface NotificationSendInput {
  readonly idempotencyKey: string;
  readonly messages?: {
    readonly 'in-app'?: {
      readonly to: string;
      readonly title?: string;
      readonly body: string;
    };
  };
}

export interface TestApp {
  readonly container: ServiceContainer;
  readonly db: TestDatabase;
  readonly app: Application;
  /** Every in-app notification the services sent, in order. */
  readonly notifications: SentNotification[];
  request(
    path: string,
    init?: RequestInit & { readonly user?: string; readonly role?: TestRole },
  ): Promise<Response>;
  mount(
    contribution: { createRouter(app: Application): Hono | Promise<Hono> },
    prefix?: string,
  ): Promise<void>;
  destroy(): Promise<void>;
}

export async function createTestApp(
  options: { seeds?: boolean } = {},
): Promise<TestApp> {
  const db = await createTestDatabase();
  if (options.seeds) {
    // Seeds read the deployment locale; tests want the English names
    // regardless of the developer's config.yml.
    process.env.APP_DEFAULT_LOCALE ??= 'en-US';
    await createSeeder({
      database: db.database,
      packageName: 'itam',
      directory: path.resolve(process.cwd(), 'database/main/seeds'),
    }).run();
  }

  const container = new ServiceContainer();
  container.instance(databaseManagerToken, db.database);
  const notifications: SentNotification[] = [];
  container.instance(notificationServiceToken, {
    send: async (input: NotificationSendInput) => {
      const message = input.messages?.['in-app'];
      notifications.push({
        idempotencyKey: input.idempotencyKey,
        to: { type: 'user', id: message?.to ?? '' },
        content: { title: message?.title, body: message?.body ?? '' },
      });
      return {
        notificationId: String(notifications.length),
        idempotencyKey: input.idempotencyKey,
        deduplicated: false,
        status: 'completed',
        deliveries: [],
      };
    },
  } as never);

  const authRequired: MiddlewareHandler = async (context, next) => {
    if (!context.req.header('x-test-user')) {
      return context.json({ code: 'UNAUTHENTICATED' }, 401);
    }
    await next();
  };
  container.instance(authenticationToken, {
    required: () => authRequired,
    optional: () => (async (_context, next) => next()) as MiddlewareHandler,
  } as never);

  const scopeFor = (user: string, role: TestRole) => {
    const allowed = ROLE_GRANTS[role] ?? ROLE_GRANTS.employee;
    return {
      identity: { principal: { type: 'user', id: user }, subjects: [] },
      authorize: async (request: {
        resource: { type: string; id: string };
        action: string;
        params?: { fields?: { input?: readonly string[] | '*' } };
      }) =>
        actionBelongsToResource(request.resource, request.action) &&
        allowed(request.resource.id, request.action) &&
        inputFieldsRegistered(request.resource.id, request.params)
          ? {
              effect: 'conditional',
              reasons: [],
              conditions: {
                type: 'database',
                collection: request.resource.id,
                action: request.action,
                // The plugin's condition shape since template beta.43: a
                // scope (`true` or a filter AST) and the readable fields,
                // with the input / output split under `fieldAccess`.
                scope:
                  role === 'employee'
                    ? {
                        kind: 'filter',
                        version: 1,
                        collection: request.resource.id,
                        root: {
                          kind: 'group',
                          logic: 'and',
                          items: [
                            {
                              kind: 'condition',
                              path: ['requesterUserId'],
                              operator: '$eq',
                              value: user,
                            },
                          ],
                        },
                      }
                    : true,
                fields: [],
                // A grant states one field list per action, so a write
                // decision says nothing about what may be read back: the
                // real plugin reports no output for it. Mirroring that is
                // what makes a route that decides without `decideWith`
                // (which merges the caller's `read` grant) return an empty
                // record here rather than only in the browser.
                fieldAccess: {
                  input: '*',
                  output:
                    request.action === 'read'
                      ? readOutput(role, request.resource.id)
                      : [],
                },
                allFields: true,
              },
            }
          : { effect: 'deny', reasons: [] },
      can: async (request: {
        resource: { type: string; id: string };
        action: string;
      }) => allowed(request.resource.id, request.action),
      // A settings item (`requireGrant` in `server/routes/itam/http.ts`):
      // refused with the plugin's own error, whose response is the 403.
      require: async (request: {
        resource: { type: string; id: string };
        action: string;
      }) => {
        if (!allowed(request.resource.id, request.action))
          throw new AuthorizationDeniedError({ effect: 'deny', reasons: [] });
      },
    };
  };
  /**
   * A Collection owns `read`, `create`, `update` and `delete` and nothing
   * else: since template beta.43 the real authorizer answers any other action
   * on one with `UNKNOWN_DATABASE_RESOURCE_OR_ACTION`. A business operation
   * (`assign`, `issue`, `approve`…) is asked for on the composite resource
   * declared for it in `server/providers/itam/authz-resources.ts`. Mirroring both halves
   * here is what makes a route that asks the wrong one fail in tests rather
   * than in the browser.
   */
  const actionBelongsToResource = (
    resource: { type: string; id: string },
    action: string,
  ): boolean => {
    if (resource.type === 'composite')
      return (
        ITAM_RESOURCES.some(
          (declared) => declared.build().name === resource.id,
        ) &&
        (findItamCollection(
          resource.id.replace(/^itam\./, ''),
        )?.actions.includes(action) ??
          false)
      );
    return CRUD_ACTIONS.has(action);
  };

  // The real authorizer decides field by field and only knows a collection's
  // registered fields, so an input key that is not one (a relation such as
  // `deviceIds`) is denied outright. Mirror that so routes cannot pass one.
  const inputFieldsRegistered = (
    resourceId: string,
    params: { fields?: { input?: readonly string[] | '*' } } | undefined,
  ): boolean => {
    const input = params?.fields?.input;
    if (!Array.isArray(input)) return true;
    const definition = findItamCollection(resourceId.replace(/^main\./, ''));
    if (!definition) return true;
    return input.every((field) => definition.fields.includes(field));
  };
  const authzMiddleware: MiddlewareHandler = async (context, next) => {
    const user = context.req.header('x-test-user') ?? 'anonymous';
    const role = (context.req.header('x-test-role') ?? 'employee') as TestRole;
    context.set('authz', scopeFor(user, role));
    await next();
  };
  // Programmatic scopes (AI actions run outside a request): users named in
  // MANAGER_USERS are managers, everyone else an employee.
  container.instance(authorizationToken, {
    middleware: () => authzMiddleware,
    for: (identity: { principal: { id: string } }) =>
      scopeFor(
        identity.principal.id,
        MANAGER_USERS.has(identity.principal.id) ? 'manager' : 'employee',
      ),
  } as never);

  const app = { container } as unknown as Application;
  new ItamProvider(app).register();

  const root = new Hono();
  root.onError((error, context) => {
    // An error that carries its own response (the authorization plugin's
    // denial) answers with it, as the application server does.
    if ('getResponse' in error && typeof error.getResponse === 'function')
      return (error as { getResponse(): Response }).getResponse();
    console.error(error);
    return context.json({ code: 'INTERNAL', message: String(error) }, 500);
  });
  return {
    container,
    db,
    app,
    notifications,
    async mount(contribution, prefix = '/api') {
      root.route(prefix, await contribution.createRouter(app));
    },
    request(requestPath, init = {}) {
      const { user, role, headers, ...rest } = init;
      return root.request(requestPath, {
        ...rest,
        headers: {
          ...(headers as Record<string, string> | undefined),
          ...(user ? { 'x-test-user': user } : {}),
          ...(role ? { 'x-test-role': role } : {}),
        },
      });
    },
    destroy: () => db.destroy(),
  };
}

export const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
