import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 审批配置 goes (decided 2026-09-27): every purchase order and every
 * disposal is approved by the person its submitter names, with no switch
 * to skip it. The stored `approvals` settings row is deleted; rolling back
 * writes it back with both kinds switched on, as it was seeded.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609270013_drop_approval_settings',

  async up({ query }) {
    await query
      .deleteFrom('itamSettings')
      .where('key', '=', 'approvals')
      .execute();
  },

  async down({ query }) {
    const existing = await query
      .selectFrom('itamSettings')
      .select('key')
      .where('key', '=', 'approvals')
      .executeTakeFirst();
    if (existing) return;
    await query
      .insertInto('itamSettings')
      .values({
        key: 'approvals',
        // Written as an object: the query layer encodes a JSON field itself.
        value: { purchase: { enabled: true }, disposal: { enabled: true } },
        updatedById: null,
        updatedAt: new Date(),
      })
      .execute();
  },
});

export default migration;
