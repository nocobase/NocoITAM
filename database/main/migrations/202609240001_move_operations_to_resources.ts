import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Moves this application's business operations out of the Collection grants.
 *
 * Template beta.43 narrowed a database Collection to `read`, `create`,
 * `update` and `delete`; an action of this application's own — `assign`,
 * `issue`, `approve`, `export` … — is a business operation and is granted on
 * the resource declared for it (`server/providers/itam/authz-resources.ts`).
 * A grant written before that names `main.devices/assign`, which the
 * authorizer answers with `UNKNOWN_DATABASE_RESOURCE_OR_ACTION`: every one of
 * those operations returned 403 and their buttons disappeared.
 *
 * Each such action moves to `itam.<collection>/<action>` keeping the record
 * access it was granted with. The field lists those grants carried are
 * dropped on purpose: an operation's fields now come from its declaration,
 * and its response is narrowed again by the caller's `read` grant, so a role
 * without the cost fields does not gain them here.
 */
interface GrantAction {
  readonly action: string;
  readonly policy?: Readonly<Record<string, unknown>>;
}

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly GrantAction[];
}

const CRUD_ACTIONS = new Set(['read', 'create', 'update', 'delete']);

const recordAccessOf = (action: GrantAction): string => {
  const selected = (
    action.policy?.recordAccess as readonly unknown[] | undefined
  )?.[0];
  return typeof selected === 'string' ? selected : 'allRecords';
};

const split = (
  grants: readonly Grant[],
): { grants: Grant[]; moved: number } => {
  let moved = 0;
  const next = grants.flatMap((grant): Grant[] => {
    if (grant.resource.type !== 'database.collection') return [grant];
    if (!grant.resource.id.startsWith('main.')) return [grant];
    const collection = grant.resource.id.slice('main.'.length);
    const owned = grant.actions.filter((entry) =>
      CRUD_ACTIONS.has(entry.action),
    );
    const operations = grant.actions.filter(
      (entry) => !CRUD_ACTIONS.has(entry.action),
    );
    if (operations.length === 0) return [grant];
    moved += operations.length;
    return [
      ...(owned.length > 0 ? [{ ...grant, actions: owned }] : []),
      {
        resource: { type: 'resource', id: `itam.${collection}` },
        actions: operations.map((entry) => ({
          action: entry.action,
          policy: {
            type: 'resource',
            [collection]: recordAccessOf(entry),
          },
        })),
      },
    ];
  });
  // An operation grant may already exist next to the Collection's: fold the
  // moved actions into it rather than leaving the set with two.
  const byResource = new Map<string, Grant>();
  const ordered: Grant[] = [];
  for (const grant of next) {
    const key = `${grant.resource.type}:${grant.resource.id}`;
    const existing = byResource.get(key);
    if (!existing) {
      byResource.set(key, grant);
      ordered.push(grant);
      continue;
    }
    const actions = [...existing.actions];
    for (const action of grant.actions)
      if (!actions.some((entry) => entry.action === action.action))
        actions.push(action);
    const merged = { ...existing, actions };
    byResource.set(key, merged);
    ordered[ordered.indexOf(existing)] = merged;
  }
  return { grants: ordered, moved };
};

const migration: MigrationDefinition = defineMigration({
  name: '202609240001_move_operations_to_resources',
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
      const { grants, moved } = split(current);
      if (moved === 0) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants, updatedAt: new Date() })
        .where('id', '=', row.id)
        .execute();
    }
  },
  async down() {
    // Deliberately empty: the reverse would put every operation back on the
    // Collection, where this version of the authorizer denies all of them.
  },
});

export default migration;
