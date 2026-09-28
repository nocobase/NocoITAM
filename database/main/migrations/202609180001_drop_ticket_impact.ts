import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The impact statement went with a service-desk priority matrix this
 * application never had; what matters about a ticket is in its description.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609180001_drop_ticket_impact',
  async up({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('impact');
    });
  },
  async down({ builder }) {
    // The dropped statements are gone; the column comes back empty.
    await builder.alterCollection('tickets', (collection) => {
      collection.text('impact').nullable();
    });
  },
});
export default migration;
