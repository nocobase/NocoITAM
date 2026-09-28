import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the purchase order's actual total.
 *
 * An order carried two amounts: the estimate from its lines, and an actual
 * recomputed from what had been received. Two figures for one order invite
 * the question of which one is the order's amount, and the second answered
 * nothing the first did not — the lines state the price, and what finance
 * actually paid lives in the finance system, not the asset register. The
 * remaining figure is simply the order's 总金额 (decided 2026-09-26).
 *
 * `down` restores an empty column: what it held was derived from the
 * receipts, and recomputing it here would tie this migration to a formula
 * that may change.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260003_drop_actual_total',

  async up({ builder, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('purchase_orders'))) return;
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.dropField('actualTotal');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.decimal('actualTotal', { precision: 14, scale: 2 }).nullable();
    });
  },
});

export default migration;
