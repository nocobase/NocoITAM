import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Removes purchase order lines that bought a service.
 *
 * `service` was the one line type that produced nothing when the order was
 * received: no device, no stock, no entitlement, only the received count
 * moving. A purchase order is kept in this register because it is where
 * assets come from, so a line that yields none does not belong (decided
 * 2026-09-26). The type is gone from `LINE_ITEM_TYPES`, so a row still
 * holding it could be neither read as a known type nor edited.
 *
 * The order's estimated total is recomputed from the lines that remain, or
 * the page would show a figure its own lines do not add up to.
 *
 * `down` puts nothing back: the rows are gone and what they said is not
 * recoverable from the order.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260002_drop_service_lines',

  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('purchase_order_lines'))) return;
    const affected = await query
      .selectFrom('purchaseOrderLines')
      .select('purchaseOrderId')
      .where('itemType', '=', 'service')
      .execute<{ purchaseOrderId: string }>();
    if (affected.length === 0) return;
    await query
      .deleteFrom('purchaseOrderLines')
      .where('itemType', '=', 'service')
      .execute();
    for (const id of new Set(affected.map((row) => row.purchaseOrderId))) {
      const lines = await query
        .selectFrom('purchaseOrderLines')
        .select(['quantity', 'unitPrice'])
        .where('purchaseOrderId', '=', id)
        .execute<{ quantity: number; unitPrice: unknown }>();
      const estimated = lines.reduce(
        (sum, line) =>
          sum + Number(line.quantity) * Number(line.unitPrice ?? 0),
        0,
      );
      await query
        .updateTable('purchaseOrders')
        .set({ estimatedTotal: Math.round(estimated * 100) / 100 })
        .where('id', '=', id)
        .execute();
    }
  },

  async down() {
    // Deliberately empty; see the note above.
  },
});

export default migration;
