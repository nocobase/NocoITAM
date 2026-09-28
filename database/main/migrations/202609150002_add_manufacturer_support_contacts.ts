import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Warranty and repair cases usually start by email or on the manufacturer's
 * support portal rather than by phone, so a manufacturer records those two
 * next to its support phone.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609150002_add_manufacturer_support_contacts',
  async up({ builder }) {
    await builder.alterCollection('manufacturers', (collection) => {
      collection.string('supportEmail', { length: 255, nullable: true });
      collection.string('supportUrl', { length: 512, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('manufacturers', (collection) => {
      collection.dropField('supportEmail');
      collection.dropField('supportUrl');
    });
  },
});

export default migration;
