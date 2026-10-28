import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Takes `reassignable` out of the stored grants on entitlements
 * (2026-10-28), after `202610280002_drop_entitlement_reassignable` dropped
 * the column.
 *
 * The authorization plugin checks every stored grant when it starts, before
 * ITAM's start-up reconciliation (`reconcile-grants.ts`) could rename the
 * field away, and refuses to start on a grant naming a field that is not
 * there: an upgraded database stopped the application. Only a field list
 * on the entitlements Collection changes; every other grant is untouched.
 *
 * `down` changes nothing: which lists named the field is not recorded, and
 * a list without it grants less rather than something invalid.
 */
interface GrantAction {
  readonly action: string;
  readonly policy?: Readonly<Record<string, unknown>>;
}

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly GrantAction[];
}

const withoutField = (grant: Grant): Grant => {
  if (
    grant.resource.type !== 'database.collection' ||
    grant.resource.id !== 'main.entitlements'
  )
    return grant;
  let changed = false;
  const actions = grant.actions.map((entry) => {
    const fields = entry.policy?.fields;
    if (!Array.isArray(fields) || !fields.includes('reassignable'))
      return entry;
    changed = true;
    return {
      ...entry,
      policy: {
        ...entry.policy,
        fields: fields.filter((field) => field !== 'reassignable'),
      },
    };
  });
  return changed ? { ...grant, actions } : grant;
};

const migration: MigrationDefinition = defineMigration({
  name: '202610280003_drop_reassignable_from_grants',
  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
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
      const grants = current.map(withoutField);
      if (grants.every((grant, index) => grant === current[index])) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants, updatedAt: new Date() })
        .where('id', '=', row.id)
        .execute();
    }
  },
  async down() {},
});

export default migration;
