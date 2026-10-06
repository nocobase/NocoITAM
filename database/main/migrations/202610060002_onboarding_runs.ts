import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Each time Noco chose a joiner's equipment in the background (2026-10-06):
 * the first piece of work the assistant does with nobody watching, which
 * reverses the 2026-09-27 rule that nothing AI runs outside a conversation.
 *
 * A run is made as the joiner's 入职负责人 (`actorId`), under that person's
 * grants and in a conversation of theirs (`sessionId`), so it traces back to
 * a person in one step. It writes nothing but this row: what it picked for
 * each kit item and why (`suggestions`), which the plan puts first while the
 * pick is still free, and which the 入职负责人 confirms or changes. `inputs`
 * is what the run was asked on — joining day, department, position, owner —
 * so an edit that changes the question asks again and one that does not
 * leaves the answer alone.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060002_onboarding_runs',

  async up({ builder }) {
    await builder.createCollection('onboardingRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('personId', { length: 64 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.string('trigger', { length: 32 }).notNull();
      collection.string('status', { length: 32 }).notNull();
      collection.string('inputs', { length: 255 }).notNull();
      collection.json('suggestions').nullable();
      collection.text('summary').nullable();
      collection.text('failure').nullable();
      collection.string('sessionId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.primary('id', { name: 'pk_onboarding_runs' });
      collection.index('personId', { name: 'idx_onboarding_runs_person' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('onboardingRuns');
  },
});

export default migration;
