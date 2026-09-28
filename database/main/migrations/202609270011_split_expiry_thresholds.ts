import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One notice period for subscriptions and maintenance was too long for one
 * and too short for the other (decided 2026-09-27): a perpetual
 * entitlement's maintenance end is flagged `maintenanceExpiryDays` ahead
 * (default 30), a subscription's renewal or end `subscriptionExpiryDays`
 * ahead (default 7). A stored `expiryDays` becomes the maintenance period —
 * the one it was chosen for most — and subscriptions start at the new
 * default. The stock water level's default went from 0 to 5 at the same
 * time; a stored 0 is the old seeded default, so it moves too.
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
  name: '202609270011_split_expiry_thresholds',

  async up({ query }) {
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<SettingsRow>();
    const value = row ? decode(row.value) : null;
    if (!value) return;
    if ('expiryDays' in value) {
      value.maintenanceExpiryDays = value.expiryDays;
      delete value.expiryDays;
    }
    if (value.defaultStockMinimum === 0) value.defaultStockMinimum = 5;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'thresholds')
      .execute();
  },

  async down({ query }) {
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<SettingsRow>();
    const value = row ? decode(row.value) : null;
    if (!value) return;
    if ('maintenanceExpiryDays' in value)
      value.expiryDays = value.maintenanceExpiryDays;
    delete value.maintenanceExpiryDays;
    delete value.subscriptionExpiryDays;
    if (value.defaultStockMinimum === 5) value.defaultStockMinimum = 0;
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'thresholds')
      .execute();
  },
});

export default migration;
