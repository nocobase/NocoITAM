import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Quantity-managed items (accessories, consumables, components) and software
// (licenses, subscriptions). One stock table carries all three kinds; the
// kind decides which movements are allowed. Installed components and issued
// accessories are current holdings; every quantity change is a movement.
const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_stock_and_software',

  async up({ builder }) {
    await builder.createCollection('stockItems', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // accessory | consumable | component
      collection.string('kind', { length: 16 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('categoryId', { length: 64 }).notNull();
      collection.string('modelId', { length: 64 }).nullable();
      collection.string('manufacturerId', { length: 64 }).nullable();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.string('locationId', { length: 64 }).notNull();
      collection.integer('totalQuantity').notNull().defaultTo(0);
      // Issued (accessories), consumed (consumables) or installed (components).
      collection.integer('usedQuantity').notNull().defaultTo(0);
      collection.integer('minimumQuantity').notNull().defaultTo(0);
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.date('purchaseDate').nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
      collection.string('imageFileId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_stock_items' });
      collection.index('kind', { name: 'idx_stock_items_kind' });
      collection.index('categoryId', { name: 'idx_stock_items_category' });
      collection.index('locationId', { name: 'idx_stock_items_location' });
      collection.index('name', { name: 'idx_stock_items_name' });
    });

    await builder.createCollection('stockHoldings', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('stockItemId', { length: 64 }).notNull();
      // person | location | asset
      collection.string('holderType', { length: 16 }).notNull();
      collection.string('holderId', { length: 64 }).notNull();
      collection.integer('quantity').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_stock_holdings' });
      collection.unique(['stockItemId', 'holderType', 'holderId'], {
        name: 'uq_stock_holdings_holder',
      });
      collection.index(['holderType', 'holderId'], {
        name: 'idx_stock_holdings_holder',
      });
    });

    await builder.createCollection('stockMovements', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('stockItemId', { length: 64 }).notNull();
      // in | issue | return | consume | install | uninstall | adjust
      collection.string('type', { length: 16 }).notNull();
      collection.integer('quantity').notNull();
      collection.string('holderType', { length: 16 }).nullable();
      collection.string('holderId', { length: 64 }).nullable();
      collection.string('sourceType', { length: 32 }).nullable();
      collection.string('sourceId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_stock_movements' });
      collection.index(['stockItemId', 'createdAt'], {
        name: 'idx_stock_movements_item',
      });
      collection.index(['holderType', 'holderId'], {
        name: 'idx_stock_movements_holder',
      });
    });

    await builder.createCollection('licenses', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // perUser | perDevice | concurrent | perCore | site | free
      collection.string('licensingModel', { length: 16 }).notNull();
      // perpetual | subscription | trial
      collection.string('licenseType', { length: 16 }).notNull();
      // null = unlimited (site licence)
      collection.integer('seatCount').nullable();
      collection.integer('assignedCount').notNull().defaultTo(0);
      // compliant | overAllocated | idle
      collection.string('complianceStatus', { length: 16 }).notNull();
      collection.text('productKey').nullable();
      collection.date('effectiveDate').nullable();
      collection.date('expiryDate').nullable();
      collection.date('maintenanceExpiryDate').nullable();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
      collection
        .decimal('purchasePrice', { precision: 18, scale: 2 })
        .nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('contractId', { length: 64 }).nullable();
      collection.boolean('reassignable').notNull().defaultTo(true);
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_licenses' });
      collection.index('softwareProductId', { name: 'idx_licenses_product' });
      collection.index('complianceStatus', { name: 'idx_licenses_compliance' });
      collection.index('expiryDate', { name: 'idx_licenses_expiry' });
    });

    await builder.createCollection('licenseSeats', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('licenseId', { length: 64 }).notNull();
      // person | asset
      collection.string('holderType', { length: 16 }).notNull();
      collection.string('holderId', { length: 64 }).notNull();
      collection.datetime('assignedAt').notNull();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('releasedAt').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_license_seats' });
      collection.index(['licenseId', 'releasedAt'], {
        name: 'idx_license_seats_license',
      });
      collection.index(['holderType', 'holderId', 'releasedAt'], {
        name: 'idx_license_seats_holder',
      });
    });

    await builder.createCollection('subscriptions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('providerVendorId', { length: 64 }).nullable();
      collection.string('consoleUrl', { length: 512 }).nullable();
      // perSeat | usage | flat
      collection.string('billingModel', { length: 16 }).notNull();
      collection.integer('seatCount').nullable();
      collection.integer('assignedCount').notNull().defaultTo(0);
      // month | quarter | year
      collection.string('billingCycle', { length: 16 }).notNull();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.decimal('cycleCost', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.decimal('annualCost', { precision: 18, scale: 2 }).nullable();
      collection.date('startDate').nullable();
      collection.date('expiryDate').notNull();
      collection.boolean('autoRenew').notNull().defaultTo(false);
      // notDue | underReview | renew | reduceSeats | cancel | renewed
      collection.string('renewalDecision', { length: 16 }).notNull();
      collection.string('businessOwnerId', { length: 64 }).notNull();
      collection.string('itOwnerId', { length: 64 }).notNull();
      collection.string('dataRegion', { length: 128 }).nullable();
      // yes | no | unknown
      collection
        .string('sensitiveData', { length: 8 })
        .notNull()
        .defaultTo('unknown');
      collection.string('contractId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_subscriptions' });
      collection.index('softwareProductId', {
        name: 'idx_subscriptions_product',
      });
      collection.index('expiryDate', { name: 'idx_subscriptions_expiry' });
      collection.index('renewalDecision', {
        name: 'idx_subscriptions_decision',
      });
    });

    await builder.createCollection('subscriptionSeats', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subscriptionId', { length: 64 }).notNull();
      collection.string('personId', { length: 64 }).nullable();
      collection.string('account', { length: 255 }).notNull();
      collection.datetime('assignedAt').notNull();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('releasedAt').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_subscription_seats' });
      collection.index(['subscriptionId', 'releasedAt'], {
        name: 'idx_subscription_seats_subscription',
      });
      collection.index(['personId', 'releasedAt'], {
        name: 'idx_subscription_seats_person',
      });
      collection.index('account', { name: 'idx_subscription_seats_account' });
    });

    await builder.createCollection('subscriptionBills', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subscriptionId', { length: 64 }).notNull();
      collection.date('periodStart').notNull();
      collection.date('periodEnd').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).notNull();
      collection.string('currency', { length: 8 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_subscription_bills' });
      collection.index(['subscriptionId', 'periodStart'], {
        name: 'idx_subscription_bills_subscription',
      });
    });

    await builder.createCollection('softwareInstalls', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('assetId', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).nullable();
      collection.string('name', { length: 255 }).notNull();
      collection.string('version', { length: 64 }).nullable();
      collection.datetime('discoveredAt').notNull();
      collection.string('discoveryImportId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_software_installs' });
      collection.index('assetId', { name: 'idx_software_installs_asset' });
      collection.index('softwareProductId', {
        name: 'idx_software_installs_product',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('softwareInstalls');
    await builder.dropCollection('subscriptionBills');
    await builder.dropCollection('subscriptionSeats');
    await builder.dropCollection('subscriptions');
    await builder.dropCollection('licenseSeats');
    await builder.dropCollection('licenses');
    await builder.dropCollection('stockMovements');
    await builder.dropCollection('stockHoldings');
    await builder.dropCollection('stockItems');
  },
});

export default migration;
