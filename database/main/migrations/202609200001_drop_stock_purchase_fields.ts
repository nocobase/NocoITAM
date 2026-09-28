import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A stock item is a batch, and every batch may come from a different order
 * at a different price. The purchase details therefore live on the purchase
 * receipts (`/itam/stock/:id/purchases` reads them through the order and
 * its line) rather than as one copy on the item, which only ever described
 * the first batch. Rolling back restores the columns, empty.
 */
const FIELDS = [
  'vendorId',
  'unitPrice',
  'currency',
  'purchaseDate',
  'purchaseOrderId',
] as const;

const migration: MigrationDefinition = defineMigration({
  name: '202609200001_drop_stock_purchase_fields',
  async up({ builder }) {
    await builder.alterCollection('stockItems', (collection) => {
      for (const field of FIELDS) collection.dropField(field);
    });
  },
  async down({ builder }) {
    await builder.alterCollection('stockItems', (collection) => {
      collection.string('vendorId', { length: 64 }).nullable();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.date('purchaseDate').nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
    });
  },
});

export default migration;
