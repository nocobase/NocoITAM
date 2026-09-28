import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Tickets (the employee ↔ IT entry point), repair records, audit tasks with
// their snapshot items, and disposal records with their asset lists.
const migration: MigrationDefinition = defineMigration({
  name: '202609130003_create_tickets_repairs_audits_disposals',

  async up({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketNo', { length: 64 }).notNull();
      // assetRequest | faultReport | returnRequest | transferRequest |
      // disposalRequest | softwareRequest
      collection.string('type', { length: 32 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      // The requesting person and, when that person is linked to a user, the
      // user id record access matches against ("my tickets").
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('requesterUserId', { length: 64 }).nullable();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.string('assetId', { length: 64 }).nullable();
      collection.string('categoryId', { length: 64 }).nullable();
      collection.string('modelId', { length: 64 }).nullable();
      collection.string('softwareProductId', { length: 64 }).nullable();
      // power | screen | keyboard | network | system | peripheral | other
      collection.string('faultCategory', { length: 32 }).nullable();
      // low | medium | high
      collection.string('urgency', { length: 16 }).notNull();
      collection.text('impact').nullable();
      // open | inProgress | pendingConfirmation | completed | closed | cancelled
      collection.string('status', { length: 32 }).notNull();
      collection.string('assigneeUserId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection
        .decimal('handlingHours', { precision: 10, scale: 2 })
        .nullable();
      collection.boolean('underWarranty').nullable();
      collection.text('cancelReason').nullable();
      collection.datetime('acceptedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.datetime('closedAt').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_tickets' });
      collection.unique('ticketNo', { name: 'uq_tickets_no' });
      collection.index('status', { name: 'idx_tickets_status' });
      collection.index('requesterUserId', { name: 'idx_tickets_requester' });
      collection.index('assigneeUserId', { name: 'idx_tickets_assignee' });
      collection.index('assetId', { name: 'idx_tickets_asset' });
    });

    await builder.createCollection('repairs', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('assetId', { length: 64 }).notNull();
      collection.string('ticketId', { length: 64 }).nullable();
      // vendorWarranty | sendOut | internal
      collection.string('method', { length: 32 }).notNull();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.text('faultDescription').notNull();
      collection.date('sentAt').notNull();
      collection.date('expectedReturnAt').nullable();
      collection.date('actualReturnAt').nullable();
      // inProgress | repaired | unrepairable | replaced
      collection.string('result', { length: 32 }).notNull();
      collection.decimal('cost', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('loanerAssetId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_repairs' });
      collection.index('assetId', { name: 'idx_repairs_asset' });
      collection.index('ticketId', { name: 'idx_repairs_ticket' });
      collection.index('vendorId', { name: 'idx_repairs_vendor' });
      collection.index('result', { name: 'idx_repairs_result' });
    });

    await builder.createCollection('auditTasks', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // { locationIds, departmentIds, categoryIds, assetIds }
      collection.json('scope').notNull();
      collection.date('plannedStart').notNull();
      collection.date('plannedEnd').notNull();
      // User ids who execute the count.
      collection.json('executorIds').notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      // notStarted | inProgress | pendingDifferences | completed | cancelled
      collection.string('status', { length: 32 }).notNull();
      collection.integer('expectedCount').notNull().defaultTo(0);
      collection.integer('countedCount').notNull().defaultTo(0);
      collection.integer('differenceCount').notNull().defaultTo(0);
      collection.text('notes').nullable();
      collection.text('cancelReason').nullable();
      collection.datetime('startedAt').nullable();
      collection.datetime('completedAt').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_audit_tasks' });
      collection.index('status', { name: 'idx_audit_tasks_status' });
      collection.index('plannedEnd', { name: 'idx_audit_tasks_end' });
    });

    await builder.createCollection('auditItems', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('auditTaskId', { length: 64 }).notNull();
      // Null for an unregistered asset found on site.
      collection.string('assetId', { length: 64 }).nullable();
      collection.string('label', { length: 255 }).nullable();
      collection.string('bookLocationId', { length: 64 }).nullable();
      collection.string('bookAssigneeType', { length: 16 }).nullable();
      collection.string('bookAssigneeId', { length: 64 }).nullable();
      collection.string('bookStatus', { length: 32 }).nullable();
      // notCounted | matched | locationMismatch | assigneeMismatch |
      // statusMismatch | notFound | unregistered
      collection.string('result', { length: 32 }).notNull();
      collection.string('actualLocationId', { length: 64 }).nullable();
      collection.string('actualAssigneeId', { length: 64 }).nullable();
      collection.string('actualStatus', { length: 32 }).nullable();
      collection.text('notes').nullable();
      collection.string('photoFileId', { length: 64 }).nullable();
      // updateLocation | updateAssignee | updateStatus | markLost | register |
      // markVerified | unresolved
      collection.string('resolution', { length: 32 }).notNull();
      collection.datetime('resolvedAt').nullable();
      collection.string('countedById', { length: 64 }).nullable();
      collection.datetime('countedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_audit_items' });
      collection.index(['auditTaskId', 'result'], {
        name: 'idx_audit_items_task',
      });
      collection.index('assetId', { name: 'idx_audit_items_asset' });
    });

    await builder.createCollection('disposals', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disposalNo', { length: 64 }).notNull();
      // scrap | sale | donation | returnToLessor | lossWriteOff | other
      collection.string('method', { length: 32 }).notNull();
      // endOfLife | damaged | uneconomicalRepair | insufficientPerformance |
      // lost | leaseEnded | other
      collection.string('reason', { length: 32 }).notNull();
      collection.text('description').nullable();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.date('requestedAt').nullable();
      // draft | pendingApproval | approved | rejected | withdrawn | executed
      collection.string('status', { length: 32 }).notNull();
      collection.integer('assetCount').notNull().defaultTo(0);
      collection
        .decimal('bookValueTotal', { precision: 18, scale: 2 })
        .nullable();
      collection.date('disposedAt').nullable();
      collection.decimal('proceeds', { precision: 18, scale: 2 }).nullable();
      collection.decimal('expenses', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('recipientVendorId', { length: 64 }).nullable();
      collection.string('recipientName', { length: 255 }).nullable();
      // wiped | notRequired
      collection.string('dataWipe', { length: 16 }).nullable();
      // format | erase | physicalDestruction
      collection.string('wipeMethod', { length: 32 }).nullable();
      collection.string('executedById', { length: 64 }).nullable();
      collection.string('ticketId', { length: 64 }).nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_disposals' });
      collection.unique('disposalNo', { name: 'uq_disposals_no' });
      collection.index('status', { name: 'idx_disposals_status' });
    });

    await builder.createCollection('disposalAssets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('disposalId', { length: 64 }).notNull();
      collection.string('assetId', { length: 64 }).notNull();
      collection.decimal('bookValue', { precision: 18, scale: 2 }).nullable();
      collection.string('statusBefore', { length: 32 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_disposal_assets' });
      collection.unique(['disposalId', 'assetId'], {
        name: 'uq_disposal_assets',
      });
      collection.index('assetId', { name: 'idx_disposal_assets_asset' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('disposalAssets');
    await builder.dropCollection('disposals');
    await builder.dropCollection('auditItems');
    await builder.dropCollection('auditTasks');
    await builder.dropCollection('repairs');
    await builder.dropCollection('tickets');
  },
});

export default migration;
