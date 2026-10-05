import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A record of each time the assistant read a delivery document for a
 * purchase order: the first piece of work the Agent carries rather than
 * answers (the NocoITAM plan's first vertical, 2026-10-05).
 *
 * A run says who started it (`actorId`, whose grants it ran under) and who
 * answers for the order (`ownerId`), so it traces back to a person in one
 * step. It keeps the document it read (the file, and its text in
 * `documentText`), what the assistant proposed
 * (`draft`), that proposal after the rule checks (`plan`) and what the
 * receiver finally saved (`final`), with the per-field counts of what was
 * accepted, changed, removed or added (`stats`) — the evidence that decides
 * whether the assistant may ever be trusted with more, and each saved run is
 * an example with its answer for the eval set.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610050003_receipt_runs',

  async up({ builder }) {
    await builder.createCollection('receiptRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      collection.string('fileId', { length: 64 }).nullable();
      collection.string('documentName', { length: 255 }).notNull();
      // The document as text, read when the run starts: what the assistant
      // was given, and the document of the eval case a saved run becomes.
      collection.text('documentText').nullable();
      collection.string('actorId', { length: 64 }).notNull();
      collection.string('ownerId', { length: 64 }).nullable();
      collection.string('trigger', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.json('draft').nullable();
      collection.json('plan').nullable();
      collection.json('final').nullable();
      collection.json('stats').nullable();
      collection.text('failure').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.primary('id', { name: 'pk_receipt_runs' });
      collection.index('purchaseOrderId', {
        name: 'idx_receipt_runs_purchase_order',
      });
      collection.index('createdAt', { name: 'idx_receipt_runs_created' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('receiptRuns');
  },
});

export default migration;
