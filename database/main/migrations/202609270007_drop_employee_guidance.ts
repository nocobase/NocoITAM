import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The "employee self-service guidance" switch leaves the AI settings
 * (decided 2026-09-27). It was meant for the employee request and fault
 * report pages, which went with the ticket module on 2026-09-19; since then
 * it switched nothing. Rolling back restores nothing: the settings service
 * supplies defaults.
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
  name: '202609270007_drop_employee_guidance',

  async up({ query }) {
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const value = ai ? decode(ai.value) : null;
    if (!value || !('employeeGuidanceEnabled' in value)) return;
    delete value.employeeGuidanceEnabled;
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
