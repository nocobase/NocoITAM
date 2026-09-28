import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Extended fields for the asset types that are not devices.
 *
 * A category carries a `fieldTemplate` whatever it applies to, and the
 * editor on its page has always offered one — but only `devices` had a
 * column to put the answers in, so a template defined on an accessory or a
 * software category described fields nobody could fill. Stock items and
 * entitlements get the same `attributes` document the device has, and their
 * pages render it under 基本信息 the way the device page does.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280002_stock_entitlement_attributes',

  async up({ builder }) {
    for (const collection of ['stockItems', 'entitlements']) {
      await builder.alterCollection(collection, (table) => {
        table.json('attributes').nullable();
      });
    }
  },

  async down({ builder }) {
    for (const collection of ['stockItems', 'entitlements']) {
      await builder.alterCollection(collection, (table) => {
        table.dropField('attributes');
      });
    }
  },
});

export default migration;
