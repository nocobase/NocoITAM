import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops a purchase order line's `purpose`, `targetPersonId` and
 * `targetDepartmentId`.
 *
 * All three were written into the schema and never given a way in: no form
 * offered them, no import mapped them, and only the demo generator ever set
 * one. A line says what is being bought and how many; who it is for is the
 * order's own department and requester, and what it is for is the order's
 * reason. Rolling back restores the three columns empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250007_drop_line_targets',

  async up({ builder }) {
    await builder.alterCollection('purchaseOrderLines', (collection) => {
      collection.dropField('purpose');
      collection.dropField('targetPersonId');
      collection.dropField('targetDepartmentId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('purchaseOrderLines', (collection) => {
      collection.text('purpose').nullable();
      collection.string('targetPersonId', { length: 64 }).nullable();
      collection.string('targetDepartmentId', { length: 64 }).nullable();
    });
  },
});

export default migration;
