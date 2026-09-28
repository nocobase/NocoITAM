import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The 「IT 支持可查看成本字段」 switch goes (decided 2026-09-27): nothing read
 * it. Who reads cost fields is the permission set's field list — the seeded
 * IT support set leaves them out, and every route and AI tool narrows by
 * that — so a second answer in the settings could only disagree with it.
 * The stored general settings lose `costFieldsForItSupport`; rolling back
 * puts it back switched off, its default.
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
  name: '202609270010_drop_cost_fields_setting',

  async up({ query }) {
    const general = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'general')
      .executeTakeFirst<SettingsRow>();
    const value = general ? decode(general.value) : null;
    if (!value || !('costFieldsForItSupport' in value)) return;
    delete value.costFieldsForItSupport;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'general')
      .execute();
  },

  async down({ query }) {
    const general = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'general')
      .executeTakeFirst<SettingsRow>();
    const value = general ? decode(general.value) : null;
    if (!value) return;
    await query
      .updateTable('itamSettings')
      .set({ value: { ...value, costFieldsForItSupport: false } })
      .where('key', '=', 'general')
      .execute();
  },
});

export default migration;
