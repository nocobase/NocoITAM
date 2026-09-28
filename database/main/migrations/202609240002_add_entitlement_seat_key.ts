import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A seat of a perpetual entitlement may carry its own product key.
 *
 * The key on the entitlement is the shared one — a volume key that activates
 * every seat. Retail and boxed licences issue one key per copy instead, which
 * until now had to live in a note or in one entitlement per key. The column
 * is optional: an entitlement with a shared key leaves every seat empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240002_add_entitlement_seat_key',
  async up({ builder }) {
    await builder.alterCollection('entitlementSeats', (collection) => {
      collection.text('productKey', { nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('entitlementSeats', (collection) => {
      collection.dropField('productKey');
    });
  },
});

export default migration;
