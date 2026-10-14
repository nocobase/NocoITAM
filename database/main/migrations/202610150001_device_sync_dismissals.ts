import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device sync, step 2 (2026-10-15): a person's 以台账为准 on a difference the
 * platforms show — a device silent too long, under another primary user, or
 * online while the register says it is on the shelf. One row per device,
 * kind of difference and the value that was seen (`value`: the last sync,
 * the other user, the register status), so the same difference is never
 * raised again while a different one still is (NocoSolution guideline 3.4:
 * a value a person refused is not proposed twice).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610150001_device_sync_dismissals',

  async up({ builder }) {
    await builder.createCollection('deviceSyncDismissals', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('deviceId', { length: 64 }).notNull();
      // stale, userMismatch or statusMismatch.
      collection.string('kind', { length: 32 }).notNull();
      collection.string('value', { length: 255 }).notNull();
      collection.string('dismissedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_device_sync_dismissals' });
      collection.unique(['deviceId', 'kind', 'value'], {
        name: 'uq_device_sync_dismissals_device_kind_value',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('deviceSyncDismissals');
  },
});

export default migration;
