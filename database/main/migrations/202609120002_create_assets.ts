import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Individually tracked assets. Category, manufacturer and department are
// denormalised from the model and the assignee so list filters and reports
// never need a three-way join; services keep them in step.
const migration: MigrationDefinition = defineMigration({
  name: '202609120002_create_assets',

  async up({ builder }) {
    await builder.createCollection('assets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('assetNo', { length: 64 }).notNull();
      collection.string('serialNo', { length: 128 }).nullable();
      collection.string('name', { length: 255 }).notNull();
      collection.string('modelId', { length: 64 }).notNull();
      collection.string('categoryId', { length: 64 }).notNull();
      collection.string('manufacturerId', { length: 64 }).notNull();
      // pendingReceipt | inStock | inUse | onLoan | inRepair | retired |
      // pendingDisposal | disposed | lost
      collection.string('status', { length: 32 }).notNull();
      // owned | leased | borrowed | byod
      collection.string('ownership', { length: 32 }).notNull();
      collection.string('lenderVendorId', { length: 64 }).nullable();
      collection.date('returnDueDate').nullable();
      // person | location | asset
      collection.string('assigneeType', { length: 32 }).nullable();
      collection.string('assigneeId', { length: 64 }).nullable();
      collection.datetime('assignedAt').nullable();
      collection.date('expectedReturnDate').nullable();
      // person | ticket
      collection.string('reservedForType', { length: 32 }).nullable();
      collection.string('reservedForId', { length: 64 }).nullable();
      collection.date('reservedUntil').nullable();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.string('locationId', { length: 64 }).notNull();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
      collection.date('purchaseDate').nullable();
      collection
        .decimal('purchasePrice', { precision: 18, scale: 2 })
        .nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.date('warrantyEndDate').nullable();
      collection.date('plannedReplacementDate').nullable();
      // none | straightLine
      collection.string('depreciationMethod', { length: 32 }).notNull();
      collection.integer('usefulLifeMonths').nullable();
      collection.decimal('residualRate', { precision: 5, scale: 4 }).nullable();
      collection.decimal('bookValue', { precision: 18, scale: 2 }).nullable();
      collection
        .decimal('depreciatedAmount', { precision: 18, scale: 2 })
        .nullable();
      collection.text('notes').nullable();
      // Values for the category's fieldTemplate keys.
      collection.json('attributes').nullable();
      collection.datetime('lastAuditedAt').nullable();
      collection.datetime('lastDiscoveredAt').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_assets' });
      collection.unique('assetNo', { name: 'uq_assets_asset_no' });
      collection.index('serialNo', { name: 'idx_assets_serial_no' });
      collection.index('status', { name: 'idx_assets_status' });
      collection.index('modelId', { name: 'idx_assets_model' });
      collection.index('categoryId', { name: 'idx_assets_category' });
      collection.index('locationId', { name: 'idx_assets_location' });
      collection.index('departmentId', { name: 'idx_assets_department' });
      collection.index(['assigneeType', 'assigneeId'], {
        name: 'idx_assets_assignee',
      });
      collection.index('purchaseOrderId', {
        name: 'idx_assets_purchase_order',
      });
      collection.index('warrantyEndDate', { name: 'idx_assets_warranty_end' });
      collection.index('ownerId', { name: 'idx_assets_owner' });
    });

    await builder.createCollection('assetTags', (collection) => {
      collection.string('assetId', { length: 64 }).notNull();
      collection.string('tagId', { length: 64 }).notNull();
      collection.primary(['assetId', 'tagId'], { name: 'pk_asset_tags' });
      collection.index('tagId', { name: 'idx_asset_tags_tag' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('assetTags');
    await builder.dropCollection('assets');
  },
});

export default migration;
