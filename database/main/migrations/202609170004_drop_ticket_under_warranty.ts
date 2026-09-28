import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170004_drop_ticket_under_warranty',
  async up({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('underWarranty');
    });
  },
  async down({ builder }) {
    // The old boolean snapshots cannot be reconstructed from current devices.
    await builder.alterCollection('tickets', (collection) => {
      collection.boolean('underWarranty').nullable();
    });
  },
});
export default migration;
