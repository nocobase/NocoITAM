import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 报价比较 goes (2026-10-23): a purchase order is no longer weighed
 * against suppliers' quotes in the application, so the comparisons kept
 * with orders go with it. Rolling back brings the table back, empty, as
 * `202610170004_purchase_quote_comparisons` made it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610270005_drop_purchase_quote_comparisons',

  async up({ builder }) {
    await builder.dropCollection('purchaseQuoteComparisons');
  },

  async down({ builder }) {
    await builder.createCollection('purchaseQuoteComparisons', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      collection.json('quotes').notNull();
      collection.json('recommendation').nullable();
      collection.integer('chosenIndex').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_purchase_quote_comparisons' });
      collection.unique('purchaseOrderId', {
        name: 'uq_purchase_quote_comparisons_order',
      });
    });
  },
});

export default migration;
