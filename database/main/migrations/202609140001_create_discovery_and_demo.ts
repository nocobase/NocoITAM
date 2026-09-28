import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Discovery imports with their unmatched candidates, and the ledger of demo
// records so a demo can be cleared without touching real data.
const migration: MigrationDefinition = defineMigration({
  name: '202609140001_create_discovery_and_demo',

  async up({ builder }) {
    await builder.createCollection('discoveryImports', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('source', { length: 128 }).notNull();
      collection.string('importedById', { length: 64 }).nullable();
      collection.datetime('importedAt').notNull();
      collection.integer('matched').notNull().defaultTo(0);
      collection.integer('unmatched').notNull().defaultTo(0);
      collection.integer('notSeen').notNull().defaultTo(0);
      collection.integer('flagged').notNull().defaultTo(0);
      collection.primary('id', { name: 'pk_discovery_imports' });
      collection.index('importedAt', { name: 'idx_discovery_imports_at' });
    });

    await builder.createCollection('discoveryCandidates', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('importId', { length: 64 }).notNull();
      collection.string('serialNo', { length: 128 }).nullable();
      collection.string('mac', { length: 64 }).nullable();
      collection.string('hostname', { length: 255 }).nullable();
      collection.string('modelName', { length: 255 }).nullable();
      collection.string('manufacturerName', { length: 255 }).nullable();
      // The raw row, kept for registration and normalisation.
      collection.json('data').notNull();
      // Model normalisation: the registered model the name most likely is.
      collection.string('suggestedModelId', { length: 64 }).nullable();
      // pending | registered | unmanaged
      collection.string('status', { length: 16 }).notNull();
      collection.string('assetId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_discovery_candidates' });
      collection.index(['status', 'createdAt'], {
        name: 'idx_discovery_candidates_status',
      });
    });

    await builder.createCollection('demoRecords', (collection) => {
      collection.string('collection', { length: 64 }).notNull();
      collection.string('recordId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary(['collection', 'recordId'], {
        name: 'pk_demo_records',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('demoRecords');
    await builder.dropCollection('discoveryCandidates');
    await builder.dropCollection('discoveryImports');
  },
});

export default migration;
