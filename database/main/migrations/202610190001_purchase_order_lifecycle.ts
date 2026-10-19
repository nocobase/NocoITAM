import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Purchase orders move through their states by a record lifecycle of
 * `@nocobase/lifecycle` (server/lifecycles/purchase-orders.ts, 2026-10-19,
 * after the disposals' pilot, docs/adr/0001-record-lifecycles.md): an order
 * keeps its state in `status` as before, and gains when the state last
 * changed and a version every transition moves on. The runtime's log tables
 * exist already (202610180001_disposal_lifecycle).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610190001_purchase_order_lifecycle',
  async up({ builder, query }: MigrationContext): Promise<void> {
    await builder.alterCollection('purchaseOrders', (c) => {
      // Nullable: an order the demo or an import writes has not been
      // through a transition yet.
      c.datetimeTz('statusChangedAt').nullable();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.index(['status', 'statusChangedAt'], {
        name: 'purchase_orders_status_changed',
      });
    });
    // When each order entered the state it is in: its last write is the
    // nearest the table knows. `updatedAt` is a datetime without a zone and
    // reads back as local text, which the zoned field refuses as it is, so
    // it goes back as the instant it names. The query builder has no
    // column-to-column update, so each row is read and written back.
    const rows = await query
      .selectFrom('purchaseOrders')
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
        .updateTable('purchaseOrders')
        .set({ statusChangedAt: at })
        .where('id', '=', row.id)
        .execute();
    }
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('purchaseOrders', (c) => {
      c.dropIndex('purchase_orders_status_changed');
    });
    await builder.alterCollection('purchaseOrders', (c) => {
      c.dropField('lifecycleVersion');
      c.dropField('statusChangedAt');
    });
  },
});

export default migration;
