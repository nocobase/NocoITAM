import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * An entitlement names no vendor of its own: each batch's reseller is on
 * the purchase order it arrived through, and a subscription's provider is
 * the software product's manufacturer. Rolling back restores the column.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200005_drop_entitlement_vendor',

  async up({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('vendorId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('vendorId', { length: 64, nullable: true });
    });
  },
});

export default migration;
