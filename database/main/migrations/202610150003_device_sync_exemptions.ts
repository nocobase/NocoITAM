import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device sync (2026-10-15): 不需要纳管 — a person's decision that a device
 * in use, of a category that should be managed, is rightly on no platform
 * (a Linux workstation, a lab machine), with the reason. One row per
 * device; it leaves 只在台账 until a person takes it back, and the sync
 * deletes it once a platform reports the device after all.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610150003_device_sync_exemptions',

  async up({ builder }) {
    await builder.createCollection('deviceSyncExemptions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('deviceId', { length: 64 }).notNull();
      collection.string('reason', { length: 500 }).notNull();
      collection.string('exemptedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_device_sync_exemptions' });
      collection.unique(['deviceId'], {
        name: 'uq_device_sync_exemptions_device',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deviceSyncExemptions');
  },
});

export default migration;
