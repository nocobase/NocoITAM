import type {
  PermissionGrant,
  PermissionGrantAction,
} from '@nocobase/authorization/core';
import type { PermissionSetsApi } from '@nocobase/authorization/permission-sets';

import { operationsOf, resourceIdOf } from './authz-resources.js';
import { ITAM_COLLECTIONS } from './collections.js';

/**
 * Collections and pages the application no longer has: tickets (removed
 * 2026-09-19), the separate licenses / subscriptions tables merged into
 * `entitlements`, the never-used tags and the software install records
 * nothing fed (all 2026-09-20), the subscription bills and contracts
 * (both 2026-09-25).
 * Permission sets are data an administrator edits, so seeds only add grants and never take them away; this startup
 * step drops the grants that point at nothing after every seed run. A set
 * that had a license or subscription grant receives the entitlements grant
 * from the seeds, which add what is missing.
 */
const STALE_COLLECTIONS = new Set([
  'main.tickets',
  'main.licenses',
  'main.licenseSeats',
  'main.subscriptions',
  'main.subscriptionSeats',
  'main.subscriptionBills',
  'main.tags',
  'main.softwareInstalls',
  'main.entitlementBills',
  'main.contracts',
  'main.contractCoverages',
]);
/**
 * The operations each `itam.*` resource declares today. A stored grant on
 * anything else — an operation removed with its feature (the seat usage
 * import, subscription bills) or a resource removed with its collection
 * (`itam.tickets`, which the P4 seed still produces from the tickets grant) —
 * makes the authorization plugin skip it with a warning, and throw at a
 * development start, so it is dropped here rather than listed by hand.
 */
const DECLARED_OPERATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  ITAM_COLLECTIONS.map((collection) => [
    resourceIdOf(collection.name),
    new Set(operationsOf(collection)),
  ]),
);
const STALE_PAGES = new Set([
  'tickets',
  'my-tickets',
  'request-asset',
  'report-fault',
  'licenses',
  'subscriptions',
  'contracts',
  // The AI action center, replaced by the AI employee plugin's write tools.
  'ai-actions',
  // 我的资产, which went with the employee role (2026-10-05).
  'my-assets',
]);

/**
 * Permission sets the application no longer has. Employees stopped signing
 * in on 2026-10-05: the register is IT's own, so the Employee set and its
 * assignments go, and whoever held it keeps their account with no ITAM
 * access. Only a set the seeds created is removed, by its key.
 */
const REMOVED_SETS: readonly string[] = ['itam-employee'];

/**
 * The field allowlist a stored database policy carries.
 *
 * Template beta.43 made it one list per action — what a read returns, what a
 * write accepts — where it used to be `{ input, output }`. The plugin
 * validates the shape and drops a policy it does not recognise
 * (`isPermissionFields` in the authorization plugin's database authorizer),
 * so a set written in the old shape grants nothing at all: every read of a
 * Collection without an `itam.*` operation to grant it through answers
 * `NO_OBJECT_PERMISSION`, with no error to notice. Rewriting the shape here
 * keeps the sets an administrator already has, since seeds only ever add.
 */
const CRUD_FIELD_SIDE: Readonly<Record<string, 'input' | 'output' | null>> = {
  read: 'output',
  create: 'input',
  update: 'input',
  // A delete touches no field, so it carries no allowlist.
  delete: null,
};

const legacyFields = (
  value: unknown,
): { input?: unknown; output?: unknown } | undefined =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  ('input' in value || 'output' in value)
    ? value
    : undefined;

/** One action's policy in today's shape, or the same object when it already is. */
function normalizeActionPolicy(
  action: string,
  policy: unknown,
): { policy: unknown; changed: boolean } {
  if (
    typeof policy !== 'object' ||
    policy === null ||
    Reflect.get(policy, 'type') !== 'database'
  )
    return { policy, changed: false };
  const fields = legacyFields(Reflect.get(policy, 'fields'));
  if (!fields) return { policy, changed: false };
  const side = CRUD_FIELD_SIDE[action] ?? null;
  const { fields: _legacy, ...rest } = policy as Record<string, unknown>;
  const allowed = side === null ? undefined : fields[side];
  return {
    policy: allowed === undefined ? rest : { ...rest, fields: allowed },
    changed: true,
  };
}

/**
 * Fields a write grant gained after the seeds first wrote it. A stored
 * allowlist says what a set accepts, and one written before a field existed
 * refuses the form that now asks for it ("Not allowed") — the seeds cannot
 * fix that, because they only ever add whole resources. Widening the list is
 * safe: nobody chose to leave out a field that did not exist.
 *
 * 2026-09-27: a disposal states what happens to the data on the devices it
 * lists when it is created, so those fields are part of `create` and
 * `update`.
 */
const ADDED_FIELDS: ReadonlyMap<string, readonly string[]> = new Map([
  ['main.disposals', ['dataWipe', 'wipeMethod']],
  // Stock items and entitlements gained the extended-field document a
  // device has always had (2026-09-28). A stored policy written before that
  // states a list without it, so the field would be unreadable and
  // unwritable for every role an administrator already has.
  ['main.stockItems', ['attributes']],
  ['main.entitlements', ['attributes']],
  // A repair names its 负责人 since 2026-09-28; before that it had only a
  // creator, so a stored policy states a list without it.
  ['main.repairs', ['ownerId']],
]);

/**
 * Fields renamed since a stored policy was written, per Collection. A
 * purchase order's and a disposal's 申请人 became their 负责人 on
 * 2026-10-05 (`202610050001_request_owner`), so a list naming
 * `requesterId` would grant a column that no longer exists and withhold the
 * one that replaced it.
 */
const RENAMED_FIELDS: ReadonlyMap<
  string,
  ReadonlyMap<string, string>
> = new Map([
  ['main.purchaseOrders', new Map([['requesterId', 'ownerId']])],
  ['main.disposals', new Map([['requesterId', 'ownerId']])],
]);

/** Renames the fields above in every list a stored policy states. */
function renameFields(grant: PermissionGrant): {
  grant: PermissionGrant;
  changed: boolean;
} {
  const renamed =
    grant.resource.type === 'database.collection'
      ? RENAMED_FIELDS.get(grant.resource.id)
      : undefined;
  if (!renamed) return { grant, changed: false };
  let changed = false;
  const actions = grant.actions.map((entry) => {
    const policy = entry.policy as Record<string, unknown> | undefined;
    if (typeof policy !== 'object' || policy === null) return entry;
    if (!Array.isArray(policy.fields)) return entry;
    const stated = (policy.fields as unknown[]).filter(
      (field): field is string => typeof field === 'string',
    );
    if (!stated.some((field) => renamed.has(field))) return entry;
    changed = true;
    const fields = [
      ...new Set(stated.map((field) => renamed.get(field) ?? field)),
    ];
    return {
      ...entry,
      policy: {
        ...policy,
        fields,
      } as unknown as PermissionGrantAction['policy'],
    };
  });
  return changed
    ? { grant: { ...grant, actions }, changed }
    : { grant, changed };
}

/**
 * Operations whose stored grant must no longer narrow by record, because the
 * service now decides who may perform them from the record itself. A repair
 * is finished by its 负责人, which is a field that can be handed over; the
 * grant used to say `recordsICreated`, which cannot, so leaving it would
 * keep an administrator's saved set refusing a repair passed to them.
 */
const UNSCOPED_OPERATIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['itam.repairs', new Set(['complete'])],
]);

/** The same, for a Collection's own actions (`delete` on a repair). */
const UNSCOPED_ACTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['main.repairs', new Set(['delete'])],
]);

/**
 * Drops the record scope from the operations above: a composite grant's data
 * scopes go to `allRecords`, a Collection grant loses its `recordAccess`.
 */
function unscopeOperations(grant: PermissionGrant): {
  grant: PermissionGrant;
  changed: boolean;
} {
  if (grant.resource.type === 'composite') {
    const operations = UNSCOPED_OPERATIONS.get(grant.resource.id);
    if (!operations) return { grant, changed: false };
    let changed = false;
    const actions = grant.actions.map((entry) => {
      const policy = entry.policy as
        { type?: unknown; scopes?: Record<string, unknown> } | undefined;
      if (!operations.has(entry.action) || policy?.type !== 'composite')
        return entry;
      const scopes = policy.scopes ?? {};
      if (Object.values(scopes).every((scope) => scope === 'allRecords'))
        return entry;
      changed = true;
      return {
        ...entry,
        policy: {
          ...policy,
          scopes: Object.fromEntries(
            Object.keys(scopes).map((key) => [key, 'allRecords']),
          ),
        } as unknown as PermissionGrantAction['policy'],
      };
    });
    return changed
      ? { grant: { ...grant, actions }, changed }
      : { grant, changed };
  }
  const operations =
    grant.resource.type === 'database.collection'
      ? UNSCOPED_ACTIONS.get(grant.resource.id)
      : undefined;
  if (!operations) return { grant, changed: false };
  let changed = false;
  const actions = grant.actions.map((entry) => {
    const policy = entry.policy as Record<string, unknown> | undefined;
    if (!operations.has(entry.action)) return entry;
    if (typeof policy !== 'object' || policy === null) return entry;
    // `allRecords` is the unscoped policy the seeds themselves write, so
    // leaving it alone is what keeps a freshly seeded database reconcile to
    // nothing. Only a scope that narrows is dropped.
    if (
      !Array.isArray(policy.recordAccess) ||
      policy.recordAccess.every((scope) => scope === 'allRecords')
    )
      return entry;
    changed = true;
    const { recordAccess: _dropped, ...rest } = policy;
    return {
      ...entry,
      policy: rest as unknown as PermissionGrantAction['policy'],
    };
  });
  return changed
    ? { grant: { ...grant, actions }, changed }
    : { grant, changed };
}

/**
 * Adds the fields above to a stored policy that states an explicit list.
 * A field added to a Collection after a grant was written is missing from
 * every list an administrator already has, and seeds only ever create a set
 * that is absent — so this is the only place an existing database learns
 * about it.
 */
function addWriteFields(grant: PermissionGrant): {
  grant: PermissionGrant;
  changed: boolean;
} {
  const added =
    grant.resource.type === 'database.collection'
      ? ADDED_FIELDS.get(grant.resource.id)
      : undefined;
  if (!added) return { grant, changed: false };
  let changed = false;
  const actions = grant.actions.map((entry) => {
    // `read` as well as the writes: a field nobody may read back is only
    // half granted.
    if (!['read', 'create', 'update'].includes(entry.action)) return entry;
    const policy = entry.policy as Record<string, unknown> | undefined;
    if (typeof policy !== 'object' || policy === null) return entry;
    const stated = policy.fields;
    if (!Array.isArray(stated)) return entry;
    const fields = stated.filter(
      (field): field is string => typeof field === 'string',
    );
    const missing = added.filter((field) => !fields.includes(field));
    if (missing.length === 0) return entry;
    changed = true;
    return {
      ...entry,
      policy: {
        ...policy,
        fields: [...fields, ...missing],
      } as unknown as PermissionGrantAction['policy'],
    };
  });
  return changed
    ? { grant: { ...grant, actions }, changed }
    : { grant, changed };
}

/** Rewrites a stored Collection grant whose policies use the old field shape. */
export function normalizeGrantFields(grant: PermissionGrant): {
  grant: PermissionGrant;
  changed: boolean;
} {
  if (grant.resource.type !== 'database.collection')
    return { grant, changed: false };
  let changed = false;
  const actions = grant.actions.map((entry) => {
    const normalized = normalizeActionPolicy(entry.action, entry.policy);
    if (!normalized.changed) return entry;
    changed = true;
    return {
      ...entry,
      policy: normalized.policy as PermissionGrantAction['policy'],
    };
  });
  return changed
    ? { grant: { ...grant, actions }, changed }
    : { grant, changed };
}

/**
 * The menu each seeded role has. Every menu entry began checking its page
 * grant on 2026-09-27; before that the grants were stored and never read, so
 * a database seeded earlier is missing whichever pages arrived after its
 * sets were written — 授权 (the merged entitlements page), 维修 and
 * 主数据概览 all predate nothing and were simply never added. Topping the
 * list up here is what keeps those roles whole; the seeds cannot, because
 * they create a set once and never touch it again.
 *
 * This only adds. A page an administrator granted beyond the list stays.
 */
const IT_PAGES: readonly string[] = [
  'workbench',
  'inbox',
  'notifications',
  'devices',
  'accessories',
  'consumables',
  'components',
  'software-products',
  'entitlements',
  'procurement',
  'repairs',
  'audits',
  'disposals',
  'master-data-overview',
  'categories',
  'models',
  'manufacturers',
  'vendors',
  'locations',
  'departments',
  'people',
];
/**
 * Both IT roles reach the same pages since IT support became the Asset
 * Manager minus approving and deleting (2026-10-05). 报表 went to the
 * Asset Manager alone on 2026-09-27, because it reads costs across the
 * register and IT support could not read costs; once it could, keeping the
 * page from it guarded nothing. A set seeded in between lacks 报表 and
 * 定时任务, which this tops up.
 */
const IT_ROLE_PAGES: readonly string[] = [
  ...IT_PAGES,
  'reports',
  'scheduler.schedules',
];
const ADDED_PAGES: ReadonlyMap<string, readonly string[]> = new Map([
  ['itam-it-support', IT_ROLE_PAGES],
  ['itam-asset-manager', IT_ROLE_PAGES],
]);

export async function reconcileGrants(
  permissionSets: PermissionSetsApi,
): Promise<void> {
  for (const set of await permissionSets.list()) {
    if (REMOVED_SETS.includes(set.key)) {
      for (const assignment of await permissionSets.listAssignments(set.key))
        await permissionSets.revoke(assignment.id);
      await permissionSets.delete(set.key);
      continue;
    }
    let changed = false;
    const grants = set.grants.flatMap((entry) => {
      const normalized = normalizeGrantFields(entry);
      if (normalized.changed) changed = true;
      const widened = addWriteFields(normalized.grant);
      if (widened.changed) changed = true;
      const unscoped = unscopeOperations(widened.grant);
      if (unscoped.changed) changed = true;
      const renamed = renameFields(unscoped.grant);
      if (renamed.changed) changed = true;
      const grant = renamed.grant;
      if (
        (grant.resource.type === 'database.collection' &&
          STALE_COLLECTIONS.has(grant.resource.id)) ||
        (grant.resource.type === 'page' && STALE_PAGES.has(grant.resource.id))
      ) {
        changed = true;
        return [];
      }
      if (
        grant.resource.type !== 'composite' ||
        !grant.resource.id.startsWith('itam.')
      )
        return [grant];
      const declared = DECLARED_OPERATIONS.get(grant.resource.id);
      const actions = grant.actions.filter((entry) =>
        declared?.has(entry.action),
      );
      if (actions.length === grant.actions.length) return [grant];
      changed = true;
      return actions.length > 0 ? [{ ...grant, actions }] : [];
    });
    const held = new Set(
      grants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id),
    );
    for (const id of ADDED_PAGES.get(set.key) ?? []) {
      if (held.has(id)) continue;
      grants.push({
        resource: { type: 'page', id },
        actions: [{ action: 'access' }],
      });
      changed = true;
    }
    if (changed) await permissionSets.update(set.key, { ...set, grants });
  }
}
