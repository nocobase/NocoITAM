import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Stocktakes move through their states by a record lifecycle of
 * `@nocobase/lifecycle` (server/lifecycles/audit-tasks.ts, 2026-10-19, after
 * the disposals', purchase orders' and repairs'): a task keeps its state in
 * `status` as before, and gains when the state last changed and a version
 * every transition moves on. The runtime's log tables exist already
 * (202610180001_disposal_lifecycle).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610190003_audit_task_lifecycle',
  async up({ builder, query }: MigrationContext): Promise<void> {
    await builder.alterCollection('auditTasks', (c) => {
      // Nullable: a stocktake the demo or an import writes has not been
      // through a transition yet.
      c.datetimeTz('statusChangedAt').nullable();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.index(['status', 'statusChangedAt'], {
        name: 'audit_tasks_status_changed',
      });
    });
    // When each stocktake entered the state it is in: its last write is the
    // nearest the table knows. `updatedAt` is a datetime without a zone and
    // reads back as local text, which the zoned field refuses as it is, so
    // it goes back as the instant it names. The query builder has no
    // column-to-column update, so each row is read and written back.
    const rows = await query
      .selectFrom('auditTasks')
      .select(['id', 'updatedAt'])
      .execute<{ id: string; updatedAt: unknown }>();
    for (const row of rows) {
      const value = row.updatedAt;
      const at =
        value instanceof Date
          ? value
          : typeof value === 'string' || typeof value === 'number'
            ? new Date(value)
            : null;
      if (!at || Number.isNaN(at.getTime())) continue;
      await query
        .updateTable('auditTasks')
        .set({ statusChangedAt: at })
        .where('id', '=', row.id)
        .execute();
    }
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('auditTasks', (c) => {
      c.dropIndex('audit_tasks_status_changed');
    });
    await builder.alterCollection('auditTasks', (c) => {
      c.dropField('lifecycleVersion');
      c.dropField('statusChangedAt');
    });
  },
});

export default migration;
