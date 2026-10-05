import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Both IT roles configure the system: the ITAM settings page grant is added
 * to each IT Permission Set when it is missing. It was the Asset Manager's
 * alone until IT support became the manager minus approving and deleting
 * (2026-10-05); this seed was the one place that split was still written.
 */
interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

const SETTINGS_PAGE: Grant = {
  resource: { type: 'page', id: 'itam-settings' },
  actions: [{ action: 'access' }],
};

const seed: SeedDefinition = defineSeed({
  name: '202609130004_seed_itam_p5_grants',

  async run({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(t: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    for (const key of ['itam-it-support', 'itam-asset-manager']) {
      const set = await query
        .selectFrom('authorizationPermissionSets')
        .select(['key', 'grants'])
        .where('key', '=', key)
        .executeTakeFirst<{ key: string; grants: unknown }>();
      if (!set) continue;
      const current =
        typeof set.grants === 'string'
          ? (JSON.parse(set.grants) as Grant[])
          : (set.grants as Grant[]);
      if (
        current.some(
          (grant) =>
            grant.resource.type === 'page' &&
            grant.resource.id === SETTINGS_PAGE.resource.id,
        )
      )
        continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: [...current, SETTINGS_PAGE],
          updatedAt: new Date(),
        })
        .where('key', '=', key)
        .execute();
    }
  },
});

export default seed;
