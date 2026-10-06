import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 待入职 as an employment status, and what a joiner's 入职配备 remembers
 * (2026-10-06).
 *
 * 在职状态 follows the dates: somebody whose joining day has not come is
 * 待入职 (`pending`), somebody whose leave date has come is 已离职, and
 * everybody else is 在职. People already entered with a joining day ahead of
 * today become 待入职 here; the nightly status task moves each one to 在职
 * on the day.
 *
 * `onboardingWaived` lists the items of a joiner's kit their 入职负责人
 * marked 不需要 (an item's key, `<target type>:<target id>`), and
 * `onboardingCompletedAt` is when everything else was in hand: from then on
 * the joiner is no longer worked out on every reading of the workbench.
 * Neither is a field of the person's page.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060003_joiner_status',

  async up({ builder, query }) {
    await builder.alterCollection('people', (collection) => {
      collection.json('onboardingWaived').nullable();
      collection.datetime('onboardingCompletedAt').nullable();
    });
    // Today as a calendar date in the server's zone, which is how every
    // date of this application is compared.
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    const today = local.toISOString().slice(0, 10);
    await query
      .updateTable('people')
      .set({ employmentStatus: 'pending' })
      .where('employmentStatus', '=', 'active')
      .where('hireDate', '>', today)
      .execute();
  },

  async down({ builder, query }) {
    await query
      .updateTable('people')
      .set({ employmentStatus: 'active' })
      .where('employmentStatus', '=', 'pending')
      .execute();
    await builder.alterCollection('people', (collection) => {
      collection.dropField('onboardingCompletedAt');
      collection.dropField('onboardingWaived');
    });
  },
});

export default migration;
