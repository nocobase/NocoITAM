import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Cross-cutting ITAM tables: settings, numbering, the unified history
// timeline, field-level change logs, the shared allocation event, attachment
// links and rule-layer reminders.
const migration: MigrationDefinition = defineMigration({
  name: '202609120003_create_system_tables',

  async up({ builder }) {
    await builder.createCollection('itamSettings', (collection) => {
      collection.string('key', { length: 128 }).notNull();
      collection.json('value').notNull();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.datetime('updatedAt').notNull();
      collection.primary('key', { name: 'pk_itam_settings' });
    });

    await builder.createCollection('numberSequences', (collection) => {
      // "asset", "ticket", or "asset:<categoryId>" when numbered per category.
      collection.string('key', { length: 128 }).notNull();
      collection.integer('nextValue').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('key', { name: 'pk_number_sequences' });
    });

    await builder.createCollection('historyEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      // assign | return | transfer | loan | reserve | statusChange | audit | ...
      collection.string('type', { length: 64 }).notNull();
      collection.text('summary').notNull();
      collection.json('payload').nullable();
      // ticket | purchaseOrder | auditTask | aiAction | ...
      collection.string('sourceType', { length: 32 }).nullable();
      collection.string('sourceId', { length: 64 }).nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_history_events' });
      collection.index(['subjectType', 'subjectId', 'createdAt'], {
        name: 'idx_history_events_subject',
      });
      collection.index(['sourceType', 'sourceId'], {
        name: 'idx_history_events_source',
      });
    });

    await builder.createCollection('changeLogs', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      // create | update | statusChange | view | delete
      collection.string('action', { length: 32 }).notNull();
      collection.string('field', { length: 128 }).nullable();
      collection.json('oldValue').nullable();
      collection.json('newValue').nullable();
      collection.string('sourceType', { length: 32 }).nullable();
      collection.string('sourceId', { length: 64 }).nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_change_logs' });
      collection.index(['subjectType', 'subjectId', 'createdAt'], {
        name: 'idx_change_logs_subject',
      });
    });

    await builder.createCollection('allocations', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // asset | stockItem | licenseSeat | subscriptionSeat
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      // assign | loan | return | transfer | issue | install | uninstall |
      // seatAssign | seatReclaim
      collection.string('action', { length: 32 }).notNull();
      // person | location | asset
      collection.string('targetType', { length: 32 }).nullable();
      collection.string('targetId', { length: 64 }).nullable();
      collection.string('previousTargetType', { length: 32 }).nullable();
      collection.string('previousTargetId', { length: 64 }).nullable();
      collection.integer('quantity').notNull().defaultTo(1);
      collection.boolean('requiresSignature').notNull().defaultTo(false);
      collection.datetime('signedAt').nullable();
      collection.date('expectedReturnDate').nullable();
      collection.text('notes').nullable();
      collection.string('sourceType', { length: 32 }).nullable();
      collection.string('sourceId', { length: 64 }).nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      // Set when the holding this event opened is closed by a later event.
      collection.datetime('endedAt').nullable();
      collection.primary('id', { name: 'pk_allocations' });
      collection.index(['subjectType', 'subjectId', 'createdAt'], {
        name: 'idx_allocations_subject',
      });
      collection.index(['targetType', 'targetId', 'endedAt'], {
        name: 'idx_allocations_target',
      });
    });

    await builder.createCollection('attachmentLinks', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('fileId', { length: 64 }).notNull();
      collection.string('ownerType', { length: 32 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('uploadedById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_attachment_links' });
      collection.index(['ownerType', 'ownerId'], {
        name: 'idx_attachment_links_owner',
      });
      collection.index('fileId', { name: 'idx_attachment_links_file' });
    });

    await builder.createCollection('reminders', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // warrantyExpiring | contractExpiring | idleAsset | auditOverdue | ...
      collection.string('kind', { length: 64 }).notNull();
      collection.string('subjectType', { length: 32 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      // info | warning | critical
      collection.string('severity', { length: 16 }).notNull();
      collection.json('data').nullable();
      collection.datetime('computedAt').notNull();
      collection.datetime('resolvedAt').nullable();
      collection.datetime('snoozedUntil').nullable();
      collection.primary('id', { name: 'pk_reminders' });
      collection.unique(['kind', 'subjectType', 'subjectId'], {
        name: 'uq_reminders_subject',
      });
      collection.index(['kind', 'resolvedAt'], { name: 'idx_reminders_kind' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('reminders');
    await builder.dropCollection('attachmentLinks');
    await builder.dropCollection('allocations');
    await builder.dropCollection('changeLogs');
    await builder.dropCollection('historyEvents');
    await builder.dropCollection('numberSequences');
    await builder.dropCollection('itamSettings');
  },
});

export default migration;
