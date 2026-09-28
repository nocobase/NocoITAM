import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The AI action center: actions the assistant proposes (single or batch)
// and the findings of the daily inspection, each with its adoption state.
const migration: MigrationDefinition = defineMigration({
  name: '202609130005_create_ai_tables',

  async up({ builder }) {
    await builder.createCollection('aiActions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // single | batch
      collection.string('kind', { length: 16 }).notNull();
      // assetAssign | assetReturn | … (see ai-actions.ts)
      collection.string('actionType', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('summary').nullable();
      // Single: the operation input. Batch: shared parameters.
      collection.json('payload').notNull();
      // Batch rows: [{ id, params, status, error }]
      collection.json('rows').nullable();
      // pending | confirmed | partial | failed | ignored | snoozed | expired
      collection.string('status', { length: 16 }).notNull();
      // chat | inspection | embedded
      collection.string('sourceType', { length: 32 }).notNull();
      collection.string('sessionId', { length: 64 }).nullable();
      collection.string('findingId', { length: 64 }).nullable();
      collection.string('proposedForId', { length: 64 }).notNull();
      collection.text('ignoreReason').nullable();
      collection.datetime('snoozedUntil').nullable();
      collection.datetime('decidedAt').nullable();
      collection.json('result').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ai_actions' });
      collection.index(['proposedForId', 'status'], {
        name: 'idx_ai_actions_user',
      });
      collection.index('sessionId', { name: 'idx_ai_actions_session' });
    });

    await builder.createCollection('aiFindings', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // Reminder kind or an AI-named category.
      collection.string('kind', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('summary').nullable();
      collection.string('subjectType', { length: 32 }).nullable();
      collection.json('subjectIds').notNull();
      collection.integer('subjectCount').notNull().defaultTo(0);
      collection
        .decimal('estimatedAmount', { precision: 18, scale: 2 })
        .nullable();
      // info | warning | critical
      collection.string('severity', { length: 16 }).notNull();
      // open | handled | ignored | snoozed
      collection.string('status', { length: 16 }).notNull();
      // rules | ai
      collection.string('layer', { length: 16 }).notNull();
      collection.string('suggestedActionType', { length: 64 }).nullable();
      collection.string('actionId', { length: 64 }).nullable();
      collection.datetime('snoozedUntil').nullable();
      collection.datetime('inspectedAt').notNull();
      collection.datetime('decidedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ai_findings' });
      collection.index(['status', 'inspectedAt'], {
        name: 'idx_ai_findings_status',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('aiFindings');
    await builder.dropCollection('aiActions');
  },
});

export default migration;
