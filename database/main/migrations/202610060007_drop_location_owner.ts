import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops a location's 负责人 (2026-10-06).
 *
 * It was the only owner on a piece of reference data, and nothing used it:
 * no reminder, to-do or notification asked a location's owner for anything.
 * Its one effect was to put each location an IT person owned on their
 * offboarding handover list, as something to hand over. Locations, like
 * models and departments, are kept by the team. If offices come to be run
 * by different IT staff — counts and arrivals routed by location — that is
 * the decision to bring an owner back, with a use.
 *
 * `down` restores an empty column; who it named is not recoverable.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060007_drop_location_owner',

  async up({ builder }) {
    await builder.alterCollection('locations', (collection) => {
      collection.dropField('ownerId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('locations', (collection) => {
      collection.string('ownerId', { length: 64 }).nullable();
    });
  },
});

export default migration;
