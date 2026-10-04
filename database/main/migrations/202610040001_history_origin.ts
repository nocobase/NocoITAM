import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Every line of a record's timeline says what wrote it.
 *
 * `actorId` already says *who* a change is attributed to, and that stays the
 * answer to "whose decision was this". It does not say how the decision
 * reached the record: a person typing on a page, the assistant proposing a
 * card that this same person then confirmed, a CSV the person imported, or
 * the nightly maintenance acting on a rule somebody configured. Those read
 * identically today, so a value the assistant proposed cannot be told from
 * one its confirmer typed, and a reader has no way to weigh it.
 *
 * `origin` is that second half. It is deliberately not a replacement for
 * `actorId`: an assistant write is `origin = 'agent'` *and* the confirming
 * user's `actorId`, because a card the plugin held until a person confirmed
 * it is that person's decision — the assistant only proposed it.
 *
 * Rows written before this are left null and read as `human`, which is what
 * they were: the assistant's writes have always gone through a confirmation
 * card, the importer through a person's upload, and neither recorded itself.
 * A null is honest about not having been recorded, where backfilling
 * `'human'` would claim a provenance nobody checked.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610040001_history_origin',

  async up({ builder }) {
    for (const table of ['historyEvents', 'changeLogs'])
      await builder.alterCollection(table, (collection) => {
        // human | agent | import | schedule
        collection.string('origin', { length: 16 }).nullable();
      });
  },

  async down({ builder }) {
    for (const table of ['historyEvents', 'changeLogs'])
      await builder.alterCollection(table, (collection) => {
        collection.dropField('origin');
      });
  },
});

export default migration;
