import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Moves every device still waiting to be stocked in into stock.
 *
 * Receiving a purchase order used to create devices as `pendingReceipt`,
 * which a second step on the order ("入库确认") then moved to `inStock`.
 * Receiving is the check — what arrived and was accepted is in stock — so
 * the step and the status went (2026-09-26) and nothing can produce or
 * clear that status any more. A device left in it would be stuck: no page
 * offers it, no operation starts from it.
 *
 * `down` puts nothing back: which devices were waiting is not recoverable
 * from the rows, and re-creating the status without the step that clears it
 * would strand them again.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260001_drop_pending_receipt',

  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('devices'))) return;
    await query
      .updateTable('devices')
      .set({ status: 'inStock' })
      .where('status', '=', 'pendingReceipt')
      .execute();
  },

  async down() {
    // Deliberately empty; see the note above.
  },
});

export default migration;
