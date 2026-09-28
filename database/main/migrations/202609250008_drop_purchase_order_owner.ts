import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops a purchase order's `owner_id`.
 *
 * An order already names the person it belongs to: the requester, which the
 * approval rules read (a requester cannot approve their own order) and which
 * the page shows under 申请信息. The owner was the shared field every
 * long-lived record carries — a device's custodian, an entitlement's
 * manager — and on a document that is written, approved and closed it only
 * repeated the requester it was defaulted from. Rolling back restores the
 * column empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609250008_drop_purchase_order_owner',

  async up({ builder }) {
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.dropField('ownerId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.string('ownerId', { length: 64 }).nullable();
    });
  },
});

export default migration;
