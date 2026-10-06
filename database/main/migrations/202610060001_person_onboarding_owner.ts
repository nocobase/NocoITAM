import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 入职负责人: the IT person who answers for getting a joiner equipped
 * (2026-10-06).
 *
 * A joiner's preparation had nobody's name on it, so 待入职 was everybody's
 * and empty under 我负责的, nobody was told when something needed doing, and
 * the assistant preparing it in the background would have had nobody to act
 * as. It is a sign-in, like every other 负责人, and new people start with
 * whoever creates them; people already in the register keep it empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060001_person_onboarding_owner',

  async up({ builder }) {
    await builder.alterCollection('people', (collection) => {
      collection.string('onboardingOwnerId', { length: 64 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('people', (collection) => {
      collection.dropField('onboardingOwnerId');
    });
  },
});

export default migration;
