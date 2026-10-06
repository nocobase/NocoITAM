import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops a department's code and cost center.
 *
 * Nothing used either: the cost center was shown and imported but no
 * report, cost or permission read it — costs are counted by the department
 * itself — and the code was only kept unique and searchable. They are the
 * keys a sync with an HR or finance system would match on; that sync would
 * be the decision to bring them back (2026-10-06).
 *
 * `down` restores empty columns; what they held is not recoverable.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060006_drop_department_code_cost_center',

  async up({ builder }) {
    await builder.alterCollection('departments', (collection) => {
      collection.dropField('code');
      collection.dropField('costCenter');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('departments', (collection) => {
      collection.string('code', { length: 64 }).nullable();
      collection.string('costCenter', { length: 64 }).nullable();
    });
  },
});

export default migration;
