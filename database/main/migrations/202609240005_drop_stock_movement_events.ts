import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Removes the history events that mirrored a stock movement.
 *
 * Stocking in or issuing wrote both a movement row and an event on the item,
 * with the same quantity and the same holder. The movement log is the better
 * record — it carries the balance and the take-back action — and the events
 * were invisible until the timeline merged, at which point the item's page
 * told each movement twice. They are reconstructible from `stock_movements`,
 * so nothing is lost by dropping them.
 *
 * The events on the holder (a person's `stockIssued`, a device's
 * `componentInstalled`) are what those pages show and stay untouched.
 */
const TYPES = ['stockIn', 'issue', 'return', 'consume', 'install', 'uninstall'];

const migration: MigrationDefinition = defineMigration({
  name: '202609240005_drop_stock_movement_events',
  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('history_events'))) return;
    await query
      .deleteFrom('historyEvents')
      .where('subjectType', '=', 'stockItems')
      .where('type', 'in', TYPES)
      .execute();
  },
  async down() {
    // Deliberately empty: the movement log holds every one of them, and
    // writing them back would restore the duplication this removed.
  },
});

export default migration;
