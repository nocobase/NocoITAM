import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A disposal has a requester and no separate owner: the column always held
 * the requester's id, and row-level authorization now reads `requesterId`.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190003_drop_disposal_owner',
  async up({ builder }) {
    await builder.alterCollection('disposals', (collection) => {
      collection.dropField('ownerId');
    });
  },
  async down({ builder, query }) {
    await builder.alterCollection('disposals', (collection) => {
      collection.string('ownerId', { length: 64 }).nullable();
    });
    const rows = await query
      .selectFrom('disposals')
      .select(['id', 'requesterId'])
      .execute<{ id: string; requesterId: string }>();
    for (const row of rows)
      await query
        .updateTable('disposals')
        .set({ ownerId: row.requesterId })
        .where('id', '=', row.id)
        .execute();
  },
});

export default migration;
