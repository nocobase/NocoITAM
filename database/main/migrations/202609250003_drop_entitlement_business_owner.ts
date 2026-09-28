import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops a subscription's business owner.
 *
 * The record already has an owner (负责人), the person who looks after it;
 * a second person "responsible in the business" duplicated that for no
 * rule, reminder or permission that read it. Rolling back restores the
 * column empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250003_drop_entitlement_business_owner',

  async up({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('businessOwnerId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('businessOwnerId', { length: 64 }).nullable();
    });
  },
});

export default migration;
