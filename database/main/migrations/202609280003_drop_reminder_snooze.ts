import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Snoozing a reminder goes (decided 2026-09-28): it had an endpoint and no
 * page ever called it, so a hidden reminder was one nobody could have
 * hidden. `reminders.snoozedUntil` is dropped; rolling back restores the
 * column empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280003_drop_reminder_snooze',

  async up({ builder }) {
    await builder.alterCollection('reminders', (collection) => {
      collection.dropField('snoozedUntil');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('reminders', (collection) => {
      collection.datetime('snoozedUntil').nullable();
    });
  },
});

export default migration;
