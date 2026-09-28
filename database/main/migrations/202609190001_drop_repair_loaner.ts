import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A device lent during a repair is an ordinary loan made from the ticket
 * (the allocation records the ticket as its source), so the repair record
 * no longer names one.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190001_drop_repair_loaner',
  async up({ builder }) {
    await builder.alterCollection('repairs', (collection) => {
      collection.dropField('loanerDeviceId');
    });
  },
  async down({ builder }) {
    // The links are gone; the column comes back empty.
    await builder.alterCollection('repairs', (collection) => {
      collection.string('loanerDeviceId', { length: 64 }).nullable();
    });
  },
});
export default migration;
