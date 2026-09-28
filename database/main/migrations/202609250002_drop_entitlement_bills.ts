import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops subscription bills.
 *
 * Bills were entered by hand, one per billing period, and nothing read them
 * back: reports, the workbench and the annualised cost all estimate from the
 * unit price or cycle cost, and actual spend belongs to finance (card
 * statements, payables), not to the asset register. What a subscription
 * costs is its estimate; what was signed is on the covering contract.
 * Rolling back restores the table empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250002_drop_entitlement_bills',

  async up({ builder }) {
    await builder.dropCollection('entitlementBills');
  },

  async down({ builder }) {
    await builder.createCollection('entitlementBills', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('entitlementId', { length: 64 }).notNull();
      collection.date('periodStart').notNull();
      collection.date('periodEnd').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).notNull();
      collection.string('currency', { length: 8 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_entitlement_bills' });
      collection.index(['entitlementId', 'periodStart'], {
        name: 'idx_entitlement_bills_entitlement',
      });
    });
  },
});

export default migration;
