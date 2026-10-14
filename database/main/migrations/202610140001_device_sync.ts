import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device sync (2026-10-14, step 1 of the NocoITAM device sync plan): the
 * devices a device management platform (Microsoft Intune first) reports,
 * kept apart from the register. The register is never written by a sync —
 * `devices` gains no field — so a device's page reads what the platform
 * says through `managedDevices.deviceId`.
 *
 * `deviceSyncRuns` is one row per pull from one platform: who or what started
 * it, how it ended and why, and what it counted. A pull that stopped half way
 * (`partial`) never marks the devices it did not reach as gone.
 *
 * `managedDevices` is one row per device per platform, keyed by the
 * platform's own id (`source`, `externalId`). `serialNo` is the serial as
 * matched — trimmed and upper-cased, empty for a placeholder such as "To be
 * filled by O.E.M." — while `raw` keeps the platform's record as evidence. A
 * link to a register device (`deviceId`) follows the platform id once made,
 * so a serial that changes later (a new mainboard) keeps it. `goneAt` is set
 * when a complete pull no longer returns the device. The `ignored*` fields
 * hold a person's "not on the register" decision, which step 2 adds.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610140001_device_sync',

  async up({ builder }) {
    await builder.createCollection('deviceSyncRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('source', { length: 32 }).notNull();
      collection.string('trigger', { length: 32 }).notNull();
      collection.string('actorId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('seen').notNull().defaultTo(0);
      collection.integer('added').notNull().defaultTo(0);
      collection.integer('linked').notNull().defaultTo(0);
      collection.integer('gone').notNull().defaultTo(0);
      collection.string('failureCode', { length: 64 }).nullable();
      collection.text('failure').nullable();
      collection.datetime('startedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_device_sync_runs' });
      collection.index(['source', 'startedAt'], {
        name: 'idx_device_sync_runs_source_started',
      });
    });

    await builder.createCollection('managedDevices', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('source', { length: 32 }).notNull();
      collection.string('externalId', { length: 128 }).notNull();
      collection.string('serialNo', { length: 128 }).nullable();
      collection.string('deviceName', { length: 255 }).nullable();
      collection.string('manufacturer', { length: 255 }).nullable();
      collection.string('model', { length: 255 }).nullable();
      collection.string('osName', { length: 64 }).nullable();
      collection.string('osVersion', { length: 64 }).nullable();
      collection.string('userPrincipal', { length: 255 }).nullable();
      collection.string('userName', { length: 255 }).nullable();
      collection.string('personId', { length: 64 }).nullable();
      // company, personal or unknown.
      collection.string('ownership', { length: 32 }).notNull();
      collection.string('compliance', { length: 32 }).nullable();
      collection.boolean('encrypted').nullable();
      collection.string('wifiMac', { length: 64 }).nullable();
      collection.datetime('enrolledAt').nullable();
      collection.datetime('lastSyncAt').nullable();
      collection.datetime('firstSeenAt').notNull();
      collection.datetime('lastSeenAt').notNull();
      collection.datetime('goneAt').nullable();
      collection.string('deviceId', { length: 64 }).nullable();
      // linked, unlinked, ambiguous or ignored.
      collection.string('matchState', { length: 32 }).notNull();
      // serial or manual.
      collection.string('matchedBy', { length: 32 }).nullable();
      collection.string('ignoredById', { length: 64 }).nullable();
      collection.datetime('ignoredAt').nullable();
      collection.text('ignoreReason').nullable();
      collection.json('raw').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_managed_devices' });
      collection.unique(['source', 'externalId'], {
        name: 'uq_managed_devices_source_external',
      });
      collection.index('deviceId', { name: 'idx_managed_devices_device' });
      collection.index('serialNo', { name: 'idx_managed_devices_serial' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('managedDevices');
    await builder.dropCollection('deviceSyncRuns');
  },
});

export default migration;
