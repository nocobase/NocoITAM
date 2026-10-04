import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the `leftPersonHoldings` reminder, which became a to-do.
 *
 * A leaver still holding equipment was the one `critical` rule on 需要关注,
 * and it was the right thing to notice — but a reminder is read by everybody
 * with the grant, so it said that somebody should do something without saying
 * who. 我的待办 now carries it, scoped the way the other cards are: by the
 * owner of the thing held, since recovering a device belongs to its 负责人 the
 * way chasing a loan back does. A leaver whose holdings answer to two people
 * is a to-do for both, each seeing the part that is theirs.
 *
 * It had to leave the reminder layer rather than sit in both: the same people
 * on one screen as both work and risk read as two problems. `loanOverdue` set
 * that precedent in September (`202609280006_drop_loan_overdue_reminder`) for
 * the same reason.
 *
 * The 人员 group goes with it, since this was its only rule. 需要关注 keeps
 * the ten that remain, all of them about a thing rather than a person.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610040002_drop_left_person_reminder',

  async up({ query }) {
    await query
      .deleteFrom('reminders')
      .where('kind', '=', 'leftPersonHoldings')
      .execute();
  },

  async down() {
    // Nothing to restore: the rows were derived, and nothing computes them any
    // more. The workbench reads the same people live.
  },
});

export default migration;
