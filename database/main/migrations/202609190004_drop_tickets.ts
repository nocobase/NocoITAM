import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Tickets leave the application: it is an asset register, not a service
 * desk (docs/IMPLEMENTATION_PLAN.md, 2026-09-19). Repairs, disposals and
 * purchase orders lose the ticket they were raised from, and the history,
 * change log, reminders, attachment links and demo bookkeeping that pointed
 * at tickets go with the table. Rolling back restores the schema, not the
 * rows.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609190004_drop_tickets',

  async up({ builder, query }) {
    for (const table of ['historyEvents', 'changeLogs', 'reminders'] as const)
      await query
        .deleteFrom(table)
        .where('subjectType', '=', 'tickets')
        .execute();
    await query
      .deleteFrom('attachmentLinks')
      .where('ownerType', '=', 'tickets')
      .execute();
    await query
      .deleteFrom('demoRecords')
      .where('collection', '=', 'tickets')
      .execute();
    // Dropping a column takes its index with it.
    for (const table of ['repairs', 'disposals', 'purchaseOrders'] as const)
      await builder.alterCollection(table, (collection) => {
        collection.dropField('ticketId');
      });
    await builder.dropCollection('tickets');
  },

  async down({ builder }) {
    await builder.createCollection('tickets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('ticketNo', { length: 64 }).notNull();
      // assetRequest | faultReport | returnRequest | transferRequest | disposalRequest
      collection.string('type', { length: 32 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('description').notNull();
      collection.string('requesterId', { length: 64 }).notNull();
      collection.string('requesterUserId', { length: 64 }).nullable();
      collection.string('departmentId', { length: 64 }).nullable();
      collection.string('deviceId', { length: 64 }).nullable();
      collection.string('categoryId', { length: 64 }).nullable();
      collection.string('modelId', { length: 64 }).nullable();
      collection.string('softwareProductId', { length: 64 }).nullable();
      // device | accessory | consumable | component | entitlement
      collection.string('requestAssetType', { length: 32 }).nullable();
      collection.integer('quantity').nullable();
      collection.string('relatedAssetType', { length: 32 }).nullable();
      collection.string('stockItemId', { length: 64 }).nullable();
      collection.string('entitlementId', { length: 64 }).nullable();
      // perpetual | subscription
      collection.string('entitlementKind', { length: 32 }).nullable();
      // power | screen | keyboard | network | system | peripheral | other
      collection.string('faultCategory', { length: 32 }).nullable();
      // low | medium | high
      collection.string('urgency', { length: 16 }).notNull();
      // open | inProgress | pendingConfirmation | closed | cancelled
      collection.string('status', { length: 32 }).notNull();
      collection.string('assigneeUserId', { length: 64 }).nullable();
      collection.text('resolution').nullable();
      collection
        .decimal('handlingHours', { precision: 10, scale: 2 })
        .nullable();
      collection.text('cancelReason').nullable();
      // requesterConfirmed | autoClosed | handlerClosed
      collection.string('closeMethod', { length: 32 }).nullable();
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
      collection.index('deviceId', { name: 'idx_tickets_device' });
      collection.index('stockItemId', { name: 'idx_tickets_stock_item' });
      collection.index('entitlementId', { name: 'idx_tickets_entitlement' });
    });
    await builder.alterCollection('repairs', (collection) => {
      collection.string('ticketId', { length: 64 }).nullable();
      collection.index('ticketId', { name: 'idx_repairs_ticket' });
    });
    await builder.alterCollection('disposals', (collection) => {
      collection.string('ticketId', { length: 64 }).nullable();
    });
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.string('ticketId', { length: 64 }).nullable();
      collection.index('ticketId', { name: 'idx_purchase_orders_ticket' });
    });
  },
});

export default migration;
