import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the `handoverCompleted` history events.
 *
 * For an afternoon the workbench kept a 已完成 list under each column, and
 * a leaver's place in it was dated by an event written the moment their
 * last item was settled. The list went the same day (2026-10-05): the board
 * shows what is waiting, and an act now says what it did — and, for a
 * leaver, how much is left — in a toast when it succeeds. With nothing
 * reading the events and no label to show them by, a timeline would print
 * their stored English summary, so they are deleted rather than kept.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610050004_drop_handover_completed',

  async up({ query }) {
    await query
      .deleteFrom('historyEvents')
      .where('type', '=', 'handoverCompleted')
      .execute();
  },

  async down() {
    // Nothing to restore: nothing writes or reads them any more.
  },
});

export default migration;
