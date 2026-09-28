import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The embedded AI capabilities leave the ITAM settings (decided 2026-09-27):
 * natural-language filtering, document parsing, report reading and audit
 * difference grouping are now tasks for the ITAM assistant on the AI
 * employee plugin, sent with the page as context and, where they change
 * the page, a frontend tool — no longer one prompt each behind a switch of
 * their own. The stored `ai.embedded` switches (and the never-built import
 * assist) would otherwise stay in the settings row with nothing to read
 * them. Rolling back restores nothing: the switches default on.
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
  name: '202609270006_drop_ai_embedded',

  async up({ query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (!value || !('embedded' in value)) return;
    delete value.embedded;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'ai')
      .execute();
  },

  async down() {
    // Nothing to restore: the settings service supplies defaults.
  },
});

export default migration;
