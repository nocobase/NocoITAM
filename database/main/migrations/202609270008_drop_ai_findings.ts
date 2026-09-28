import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The self-built AI inspection leaves the application (decided 2026-09-27),
 * the last step of moving AI onto the AI employee plugin: the findings the
 * workbench listed (the rule-layer reminders grouped, with an optional model
 * summary, handled / ignored / snoozed), the instant check on a device's page
 * and the direct model calls behind them. The plugin has no background
 * findings to store and no passive display outside a conversation; the same
 * questions are asked of Ava through the page shortcuts. The rule-layer
 * reminders stay — they need no model.
 *
 * The stored AI settings lose what switched those (`inspectionEnabled`,
 * `inspectionTime`) and ITAM's own `enabled`: whether the assistant is
 * available is now the plugin's to say (a usable model, Ava enabled).
 * Rolling back restores the table empty.
 */
interface SettingsRow {
  readonly key: string;
  readonly value: unknown;
}

/** A JSON column arrives decoded, or as the text an older write left. */
const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609270008_drop_ai_findings',

  async up({ builder, query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (value) {
      delete value.enabled;
      delete value.inspectionEnabled;
      delete value.inspectionTime;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value })
        .where('key', '=', 'ai')
        .execute();
    }
    await builder.dropCollection('aiFindings');
  },

  async down({ builder }) {
    await builder.createCollection('aiFindings', (collection) => {
      collection.string('id', { length: 64 }).notNull();
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
});

export default migration;
