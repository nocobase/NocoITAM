import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The AI action center leaves the application (decided 2026-09-27): the
 * assistant's changes are now the AI employee plugin's write tools, which
 * the plugin holds (ASK) until the user confirms the card in the
 * conversation, and which then run as that user. A proposal lives in its
 * conversation, so the table that held proposals for a page of their own
 * goes, and with it the batch limit in the stored AI settings, which only
 * bounded those proposals. Findings keep their `actionId` column until the
 * findings themselves are decided on. Rolling back restores the table empty.
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
  name: '202609270005_drop_ai_actions',

  async up({ builder, query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (value && 'batchActionLimit' in value) {
      delete value.batchActionLimit;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value })
        .where('key', '=', 'ai')
        .execute();
    }
    await builder.dropCollection('aiActions');
  },

  async down({ builder }) {
    await builder.createCollection('aiActions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // single | batch
      collection.string('kind', { length: 16 }).notNull();
      collection.string('actionType', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('summary').nullable();
      collection.json('payload').notNull();
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
  },
});

export default migration;
