import { defineCompositeResource } from '@nocobase/authorization/core';
import { APP_NS } from '@nocobase/i18n';
import {
  defineDatabasePermission,
  type DatabaseAuthorizationConditions,
  type DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization/server';

import {
  ITAM_COLLECTIONS,
  type ItamCollectionDefinition,
} from './collections.js';

/**
 * This application's business operations as authorization sees them.
 *
 * Since template beta.43 a database Collection carries only `read`, `create`,
 * `update` and `delete`; anything else is a business operation and belongs to
 * a resource of its own (see the authorization plugin's Skill). Registering
 * `assign` or `issue` on the Collection instead makes every one of them deny
 * with `UNKNOWN_DATABASE_RESOURCE_OR_ACTION`.
 *
 * Since authorization 0.2.0-beta.21 such a resource is a *composite*
 * (`defineCompositeResource`, stored as `type: 'composite'`), listed in the
 * permission workspace under the ITAM subsection rather than a resource group.
 *
 * Each operation grants the Collection it works on, so a stored grant on
 * `itam.devices/assign` expands at resolve time into a database grant whose
 * `origin` names that operation. The route asks the Collection for its
 * conditions with that origin (`server/routes/itam/crud-routes.ts`), which is
 * how the record scope of one operation stays independent of another's — and
 * why the rules of the default-access, sharing and restriction plugins keep
 * applying to what an operation may touch.
 */
export const ITAM_RESOURCE_SECTION = 'itam';

/**
 * A title the permission workspace translates in this application's
 * namespace: `admin.authz.*` in `client/locales/admin.ts`. A plain string is
 * shown as written in every language, and an operation with no title at all
 * is shown by its name (`markLeft`), which is what this replaced (2026-10-16).
 */
const authzTitle = (key: string) =>
  ({ key: `admin.authz.${key}`, ns: APP_NS }) as const;

/** What the permission workspace calls a Collection, and its operations' heading. */
export const collectionTitleOf = (collection: string) =>
  authzTitle(`collections.${collection}`);

/** What the permission workspace calls one operation, worded as its page words it. */
export const operationTitleOf = (collection: string, action: string) =>
  authzTitle(`operations.${collection}.${action}`);

/** The settings item 设置 → 通用 is granted through, and its two actions. */
export const ITAM_SETTINGS_TITLE = authzTitle('settings');
export const settingsActionTitleOf = (action: 'read' | 'update') =>
  authzTitle(`settingsActions.${action}`);

/** The four a Collection owns; everything else is an operation of its own. */
const CRUD = new Set(['read', 'create', 'update', 'delete']);

/**
 * What an operation does to its Collection's rows. A read-only operation
 * (exporting a list, revealing a product key) asks for `read`, so a grant that
 * allows it never implies the right to write.
 */
const READ_ONLY = new Set(['export', 'viewKey']);

export const databaseActionOf = (action: string): 'read' | 'update' =>
  READ_ONLY.has(action) ? 'read' : 'update';

export const operationsOf = (
  collection: ItamCollectionDefinition,
): readonly string[] => collection.actions.filter((name) => !CRUD.has(name));

/** `itam.devices` for the `devices` Collection. */
export const resourceIdOf = (collection: string): string =>
  `itam.${collection}`;

const resourceOf = (collection: ItamCollectionDefinition) => {
  // An operation grants **no readable field of its own**. It used to grant
  // the Collection's whole field list, on the reasoning that a response is
  // narrowed again by the caller's `read` grant — but that narrowing asks
  // the Collection for the caller's plain `read` decision, and this grant is
  // one of the branches that decision is composed from. Granting every field
  // here therefore widened the very answer it was supposed to be narrowed by:
  // IT support, whose `read` excludes the cost fields, saw `purchasePrice`,
  // `bookValue` and `depreciatedAmount` on every device and the product key
  // and price on every entitlement, because they also hold `assign` and
  // `export` (found 2026-09-27). What an operation may *write* is still its
  // own grant, below.
  const permission = defineDatabasePermission((definition) =>
    definition
      .collection(`main.${collection.name}`)
      .title(collectionTitleOf(collection.name))
      .read([]),
  );
  // A resource is validated as it is defined and must already carry its
  // actions, so they are added inside the callback rather than after it.
  return defineCompositeResource(resourceIdOf(collection.name), (resource) =>
    operationsOf(collection).reduce(
      (builder, action) =>
        builder.action(action, (declaration) =>
          declaration
            .title(operationTitleOf(collection.name, action))
            .grant(
              collection.name,
              databaseActionOf(action) === 'read'
                ? permission
                : permission.update([...collection.fields]),
              { title: collectionTitleOf(collection.name) },
            ),
        ),
      resource.title(collectionTitleOf(collection.name)),
    ),
  );
};

/** One resource per Collection that has operations; registered at boot. */
export const ITAM_RESOURCES = ITAM_COLLECTIONS.filter(
  (collection) => operationsOf(collection).length > 0,
).map((collection) => resourceOf(collection));

interface DecisionLike {
  readonly effect: string;
  readonly conditions?: { readonly type?: string } | undefined;
}

/** How a caller asks authorization for a decision, whatever it holds one on. */
export type Authorize = <P>(request: {
  readonly resource: { readonly type: string; readonly id: string };
  readonly action: string;
  readonly params?: P;
}) => Promise<DecisionLike>;

const asConditions = (
  decision: DecisionLike,
): DatabaseAuthorizationConditions | undefined =>
  decision.effect === 'conditional' && decision.conditions?.type === 'database'
    ? (decision.conditions as DatabaseAuthorizationConditions)
    : undefined;

/**
 * The conditions one operation works under, or `undefined` when the caller
 * does not hold it.
 *
 * `read` / `create` / `update` / `delete` belong to the Collection and are
 * asked for directly. Everything else is a business operation: holding it is
 * decided on its own resource, and the Collection is then asked for the
 * conditions of that operation alone — `params.operation` is what keeps one
 * operation's record scope out of another's answer.
 *
 * What the operation may touch is its own grant; what its response may show
 * stays the caller's `read` grant, so an operation never reveals a field — a
 * price, a product key — the caller cannot read on the record itself.
 */
export async function decideWith(
  authorize: Authorize,
  collection: string,
  action: string,
  params?: DatabaseAuthorizationParams,
): Promise<DatabaseAuthorizationConditions | undefined> {
  const resource = {
    type: 'database.collection',
    id: `main.${collection}`,
  } as const;
  if (!operationNames.has(action)) {
    const conditions = asConditions(
      await authorize<DatabaseAuthorizationParams>({
        resource,
        action,
        params: params ?? { fields: {} },
      }),
    );
    return conditions && action !== 'read'
      ? withReadableOutput(authorize, resource, conditions)
      : conditions;
  }
  const operation = { resource: resourceIdOf(collection), action } as const;
  const held = await authorize({
    resource: { type: 'composite', id: operation.resource },
    action,
  });
  if (held.effect === 'deny') return undefined;
  const conditions = asConditions(
    await authorize<DatabaseAuthorizationParams>({
      resource,
      action: databaseActionOf(action),
      params: { ...(params ?? { fields: {} }), operation },
    }),
  );
  if (!conditions) return undefined;
  return withReadableOutput(authorize, resource, conditions);
}

/**
 * The same conditions, with the fields a response may show taken from the
 * caller's `read` grant.
 *
 * A grant states one field list per action — what a write accepts — so a
 * `create` or `update` decision says nothing about what may be read back.
 * Asking the Collection separately is what keeps a write from revealing a
 * price or a product key the caller cannot read, and what gives a route the
 * output list it narrows its response with (`outputFields` in
 * `authz-filter.ts`). A caller that may write but not read sees nothing back.
 */
async function withReadableOutput(
  authorize: Authorize,
  resource: { readonly type: string; readonly id: string },
  conditions: DatabaseAuthorizationConditions,
): Promise<DatabaseAuthorizationConditions> {
  const output = asConditions(
    await authorize<DatabaseAuthorizationParams>({
      resource,
      action: 'read',
      params: { fields: {} },
    }),
  )?.fieldAccess?.output;
  return output === undefined
    ? conditions
    : {
        ...conditions,
        fieldAccess: { ...conditions.fieldAccess, output },
        allFields: output === '*' && conditions.allFields,
      };
}

/** Every operation name this application declares, across all Collections. */
const operationNames = new Set(
  ITAM_COLLECTIONS.flatMap((collection) => [...operationsOf(collection)]),
);
