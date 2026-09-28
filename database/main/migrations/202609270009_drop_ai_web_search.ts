import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * ITAM's own 允许联网搜索 switch goes (decided 2026-09-27): nothing read it,
 * and web search is the AI employee plugin's, chosen per conversation where
 * the model's provider supports it. The stored AI settings lose
 * `webSearchEnabled`; rolling back puts it back switched off, its default.
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
  name: '202609270009_drop_ai_web_search',

  async up({ query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (!value || !('webSearchEnabled' in value)) return;
    delete value.webSearchEnabled;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'ai')
      .execute();
  },

  async down({ query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (!value) return;
    await query
      .updateTable('itamSettings')
      .set({ value: { ...value, webSearchEnabled: false } })
      .where('key', '=', 'ai')
      .execute();
  },
});

export default migration;
