import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The two SaaS governance fields (data region, sensitive data) are not
 * used: entitlements record ownership and cost, and security review lives
 * elsewhere. Rolling back restores the nullable columns.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200004_drop_entitlement_compliance_fields',

  async up({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('dataRegion');
      collection.dropField('sensitiveData');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('dataRegion', { length: 128, nullable: true });
      collection.string('sensitiveData', { length: 8, nullable: true });
    });
  },
});

export default migration;
