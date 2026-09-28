import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the `loanOverdue` reminder rows.
 *
 * The rule layer said "a loan is past its return date" once a day; the
 * workbench's 设备借出逾期未还 to-do card now says it live, from the same
 * query, scoped to the device's 负责人 — so the stored copy was a second,
 * staler answer to a question already answered, and 需要关注 had to be told
 * to hide it. The in-app notification it used to send goes with it (decided
 * 2026-09-28: the card is where this is read), which leaves the daily
 * maintenance job sending none at all.
 *
 * The rows are deleted rather than resolved: a reminder of a kind the
 * application no longer declares has no route to open and no label to read.
 * Rolling back leaves the table without them; the next daily run would have
 * rebuilt them, and after this one nothing does.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280006_drop_loan_overdue_reminder',

  async up({ query }) {
    await query
      .deleteFrom('reminders')
      .where('kind', '=', 'loanOverdue')
      .execute();
  },

  async down() {
    // Nothing to restore: the rows were derived, and nothing computes them.
  },
});

export default migration;
