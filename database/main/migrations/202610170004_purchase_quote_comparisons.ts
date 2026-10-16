import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 报价比较 (2026-10-17): the quotes a purchase order was weighed against
 * before it was sent for approval. One row per order, replaced when the
 * comparison is redone: each quote as read from its document (vendor,
 * validity, delivery, warranty, payment terms, its prices against the
 * order's lines), Noco's recommendation and the quote the requester took.
 * The approval assistant reads it with the order.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610170004_purchase_quote_comparisons',

  async up({ builder }) {
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

  async down({ builder }) {
    await builder.dropCollection('purchaseQuoteComparisons');
  },
});

export default migration;
