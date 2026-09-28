import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Audit tasks lose their owner (decided 2026-09-27). The executors do the
 * count and the creator organised it; an owner beside them was nearly always
 * the creator, and nothing is handed over or followed up on an audit task
 * that would need someone else to answer for it. What read the owner reads
 * the creator now: the workbench's "active audits" and the record's owner
 * for "records I own" scopes. Rolling back restores the column filled with
 * the creator.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609270002_drop_audit_owner',

  async up({ builder }) {
    await builder.alterCollection('auditTasks', (collection) => {
      collection.dropField('ownerId');
    });
  },

  async down({ builder, query }) {
    await builder.alterCollection('auditTasks', (collection) => {
      collection.string('ownerId', { length: 64 }).nullable();
    });
    const rows = await query
      .selectFrom('auditTasks')
      .select(['id', 'createdById'])
      .execute<{ id: string; createdById: string | null }>();
    for (const row of rows)
      await query
        .updateTable('auditTasks')
        .set({ ownerId: row.createdById })
        .where('id', '=', row.id)
        .execute();
  },
});

export default migration;
