import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The fifth asset type is the entitlement (a software product's licenses
 * and subscriptions), and its stored value now says so. The categories
 * seed writes `entitlement` for fresh installations; this rewrites the
 * rows an installation already has.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609160001_rename_software_applies_to',
  async up({ query }) {
    await query
      .updateTable('categories')
      .set({ appliesTo: 'entitlement' })
      .where('appliesTo', '=', 'software')
      .execute();
  },
  async down({ query }) {
    await query
      .updateTable('categories')
      .set({ appliesTo: 'software' })
      .where('appliesTo', '=', 'entitlement')
      .execute();
  },
});

export default migration;
