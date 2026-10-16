import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A repair's kind of fault (2026-10-17): screen, keyboard, battery, power,
 * storage, network, system, peripheral, physical damage or other. The
 * fault was free text alone, so nothing could say which faults a model
 * keeps having; the kind is picked when the repair is filed, or filled by
 * Noco from the description, and may stay empty. Existing repairs have
 * none.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610170003_repair_fault_category',

  async up({ builder }) {
    await builder.alterCollection('repairs', (table) => {
      table.string('faultCategory', { length: 32 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('repairs', (table) => {
      table.dropField('faultCategory');
    });
  },
});

export default migration;
