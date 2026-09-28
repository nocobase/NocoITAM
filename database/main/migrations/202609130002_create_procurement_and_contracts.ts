import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Contracts with their coverage, purchase orders with lines and receipts,
// the approval record both procurement and disposal share, and the file
// collection the attachment links point at.
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_procurement_and_contracts',

  async up({ builder }) {
    // File metadata in the shape the file plugin requires; attachment_links
    // (P0) connect these files to business records.
    await builder.createCollection('itamFiles', (collection) => {
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('contracts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('contractNo', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // purchase | maintenance | lease | service | softwareSubscription | other
      collection.string('type', { length: 32 }).notNull();
      collection.string('vendorId', { length: 64 }).notNull();
      collection.date('startDate').notNull();
      collection.date('endDate').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('paymentTerms', { length: 255 }).nullable();
      collection.boolean('autoRenew').notNull().defaultTo(false);
      collection.integer('noticeDays').nullable();
      // notStarted | active | expiring | expired | terminated (maintained by date)
      collection.string('status', { length: 16 }).notNull();
      // notDue | underReview | renew | cancel | renewed
      collection.string('renewalDecision', { length: 16 }).notNull();
      collection.text('terminationReason').nullable();
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_contracts' });
      collection.unique('contractNo', { name: 'uq_contracts_no' });
      collection.index('vendorId', { name: 'idx_contracts_vendor' });
      collection.index('status', { name: 'idx_contracts_status' });
      collection.index('endDate', { name: 'idx_contracts_end' });
    });

    await builder.createCollection('contractCoverages', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('contractId', { length: 64 }).notNull();
      // asset | license | subscription
      collection.string('targetType', { length: 16 }).notNull();
      collection.string('targetId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_contract_coverages' });
      collection.unique(['contractId', 'targetType', 'targetId'], {
        name: 'uq_contract_coverages_target',
      });
      collection.index(['targetType', 'targetId'], {
        name: 'idx_contract_coverages_target',
      });
    });

    await builder.createCollection('purchaseOrders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('orderNo', { length: 64 }).notNull();
      // newHire | batchReplacement | stockReplenishment | project | faultReplacement | other
      collection.string('reason', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.date('neededBy').nullable();
      collection.string('vendorId', { length: 64 }).nullable();
      collection
        .decimal('estimatedTotal', { precision: 18, scale: 2 })
        .nullable();
      collection.decimal('actualTotal', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      // draft | pendingApproval | approved | rejected | ordered | partiallyReceived | completed | cancelled
      collection.string('status', { length: 32 }).notNull();
      collection.date('orderedAt').nullable();
      collection.date('expectedAt').nullable();
      collection.date('receivedAt').nullable();
      collection.string('contractId', { length: 64 }).nullable();
      collection.text('cancelReason').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_purchase_orders' });
      collection.unique('orderNo', { name: 'uq_purchase_orders_no' });
      collection.index('status', { name: 'idx_purchase_orders_status' });
      collection.index('requesterId', {
        name: 'idx_purchase_orders_requester',
      });
      collection.index('vendorId', { name: 'idx_purchase_orders_vendor' });
    });

    await builder.createCollection('purchaseOrderLines', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      // asset | accessory | consumable | component | license | subscription | service
      collection.string('itemType', { length: 16 }).notNull();
      collection.string('modelId', { length: 64 }).nullable();
      collection.string('softwareProductId', { length: 64 }).nullable();
      collection.string('description', { length: 255 }).nullable();
      collection.integer('quantity').notNull();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.integer('receivedQuantity').notNull().defaultTo(0);
      collection.text('purpose').nullable();
      collection.string('targetPersonId', { length: 64 }).nullable();
      collection.string('targetDepartmentId', { length: 64 }).nullable();
      collection.integer('sort').notNull().defaultTo(0);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_purchase_order_lines' });
      collection.index('purchaseOrderId', {
        name: 'idx_purchase_order_lines_order',
      });
    });

    await builder.createCollection('purchaseReceipts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('purchaseOrderId', { length: 64 }).notNull();
      collection.string('lineId', { length: 64 }).notNull();
      collection.integer('quantity').notNull();
      // asset | stockItem | license | subscription
      collection.string('generatedType', { length: 16 }).nullable();
      collection.string('generatedId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_purchase_receipts' });
      collection.index('purchaseOrderId', {
        name: 'idx_purchase_receipts_order',
      });
      collection.index(['generatedType', 'generatedId'], {
        name: 'idx_purchase_receipts_generated',
      });
    });

    await builder.createCollection('approvals', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // purchaseOrder | disposal
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).nullable();
      // pending | approved | rejected | withdrawn
      collection.string('status', { length: 16 }).notNull();
      collection.string('requestedById', { length: 64 }).notNull();
      collection.datetime('requestedAt').notNull();
      // Users who may decide; empty = any user with the approve grant.
      collection.json('approverIds').notNull();
      collection.string('decidedById', { length: 64 }).nullable();
      collection.datetime('decidedAt').nullable();
      collection.text('comment').nullable();
      collection.primary('id', { name: 'pk_approvals' });
      collection.index(['subjectType', 'subjectId', 'requestedAt'], {
        name: 'idx_approvals_subject',
      });
      collection.index('status', { name: 'idx_approvals_status' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('approvals');
    await builder.dropCollection('purchaseReceipts');
    await builder.dropCollection('purchaseOrderLines');
    await builder.dropCollection('purchaseOrders');
    await builder.dropCollection('contractCoverages');
    await builder.dropCollection('contracts');
    await builder.dropCollection('itamFiles');
  },
});

export default migration;
