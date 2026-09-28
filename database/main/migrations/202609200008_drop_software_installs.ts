import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Software install records were only ever filled by a discovery import
 * carrying an "installed software" column, which no data source in use
 * provides; the application does not scan devices itself. With nothing
 * feeding them, the per-device compliance comparison, the "unlicensed
 * installs" list and the report column they backed were always empty, so
 * the feature goes (decision 2026-09-20). Rolling back recreates the table
 * empty in its final (renamed) shape.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200008_drop_software_installs',

  async up({ builder }) {
    await builder.dropCollection('softwareInstalls');
  },

  async down({ builder }) {
    await builder.createCollection('softwareInstalls', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('deviceId', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).nullable();
      collection.string('name', { length: 255 }).notNull();
      collection.string('version', { length: 64 }).nullable();
      collection.datetime('discoveredAt').notNull();
      collection.string('discoveryImportId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_software_installs' });
      collection.index('deviceId', { name: 'idx_software_installs_device' });
      collection.index('softwareProductId', {
        name: 'idx_software_installs_product',
      });
    });
  },
});

export default migration;
