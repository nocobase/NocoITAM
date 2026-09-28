import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Rewrites this application's stored grants into the shapes authorization
 * 0.2.0-beta.21 (template beta.49) reads.
 *
 * - A business operation was a grant on `{ type: 'resource', id:
 *   'itam.<collection>' }` whose policy named the record access per
 *   collection: `{ type: 'resource', devices: 'allRecords' }`. It is now a
 *   composite resource, stored as `{ type: 'composite', id }` with
 *   `{ type: 'composite', scopes: { devices: 'allRecords' } }` — the data
 *   scope keys are the same collection names, so the choice an administrator
 *   made carries over as it is.
 * - The settings grant was a resource type of its own (`itam.settings` /
 *   `general`). Administration surfaces are settings items now:
 *   `{ type: 'settings', id: 'itam.settings' }`, same actions.
 *
 * Left as they were, the new authorizer knows neither type, so every ITAM
 * operation and the settings page would deny with no error to notice.
 * Other grants — pages, Collections, other plugins' — are not touched.
 */
interface GrantAction {
  readonly action: string;
  readonly policy?: Readonly<Record<string, unknown>>;
}

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly GrantAction[];
}

const isItamOperation = (grant: Grant, type: string): boolean =>
  grant.resource.type === type && grant.resource.id.startsWith('itam.');

const up = (grant: Grant): Grant => {
  if (isItamOperation(grant, 'resource'))
    return {
      resource: { type: 'composite', id: grant.resource.id },
      actions: grant.actions.map((entry) => {
        if (!entry.policy) return entry;
        const { type: _type, ...scopes } = entry.policy;
        return { ...entry, policy: { type: 'composite', scopes } };
      }),
    };
  if (grant.resource.type === 'itam.settings')
    return {
      ...grant,
      resource: { type: 'settings', id: 'itam.settings' },
    };
  return grant;
};

const down = (grant: Grant): Grant => {
  if (isItamOperation(grant, 'composite'))
    return {
      resource: { type: 'resource', id: grant.resource.id },
      actions: grant.actions.map((entry) => {
        const scopes = entry.policy?.scopes;
        if (typeof scopes !== 'object' || scopes === null) return entry;
        return { ...entry, policy: { type: 'resource', ...scopes } };
      }),
    };
  if (
    grant.resource.type === 'settings' &&
    grant.resource.id === 'itam.settings'
  )
    return { ...grant, resource: { type: 'itam.settings', id: 'general' } };
  return grant;
};

async function rewrite(
  { query, connection }: Parameters<MigrationDefinition['up']>[0],
  convert: (grant: Grant) => Grant,
): Promise<void> {
  const client = await connection.client<{
    schema: { hasTable(table: string): Promise<boolean> };
  }>();
  if (!(await client.schema.hasTable('authorization_permission_sets'))) return;
  const rows = await query
    .selectFrom('authorizationPermissionSets')
    .select(['id', 'grants'])
    .execute<{ id: string; grants: unknown }>();
  for (const row of rows) {
    const current = (
      typeof row.grants === 'string'
        ? (JSON.parse(row.grants) as Grant[])
        : ((row.grants ?? []) as Grant[])
    ).filter((grant) => grant && typeof grant === 'object');
    const grants = current.map(convert);
    if (grants.every((grant, index) => grant === current[index])) continue;
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants, updatedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
  }
}

const migration: MigrationDefinition = defineMigration({
  name: '202609280007_composite_grants',
  async up(context) {
    await rewrite(context, up);
  },
  async down(context) {
    await rewrite(context, down);
  },
});

export default migration;
