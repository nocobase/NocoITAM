import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device sync (2026-10-15): a platform's connection as entered on 设置 →
 * 设备同步, for a deployment whose operator does not edit `config.yml`. One
 * row per platform (`source`: intune or jamf). The client secret is sealed
 * with the deployment's `secrets.keys` (`clientSecretSealed`), never stored
 * in plain text; the other values are not secret. `config.yml` still wins
 * for a platform it configures.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610150002_device_sync_connections',

  async up({ builder }) {
    await builder.createCollection('deviceSyncConnections', (collection) => {
      collection.string('source', { length: 32 }).notNull();
      // Intune's Entra ID tenant.
      collection.string('tenantId', { length: 255 }).nullable();
      // Jamf Pro's server address.
      collection.string('url', { length: 1024 }).nullable();
      collection.string('clientId', { length: 255 }).notNull();
      collection.text('clientSecretSealed').notNull();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('source', { name: 'pk_device_sync_connections' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deviceSyncConnections');
  },
});

export default migration;
