import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A purchase order created from an asset request keeps the ticket it fulfils,
 * as repairs and disposals keep theirs.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609180002_add_purchase_order_ticket',
  async up({ builder }) {
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.string('ticketId', { length: 64 }).nullable();
      collection.index('ticketId', { name: 'idx_purchase_orders_ticket' });
    });
  },
  async down({ builder }) {
    // Dropping the column takes its index with it.
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.dropField('ticketId');
    });
  },
});
export default migration;
