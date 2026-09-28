import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops seat usage tracking.
 *
 * A subscription seat's `lastUsedAt` was fed only by a pasted "account, last
 * login" import, and the application does not read any vendor's console, so
 * the column recorded whatever someone last remembered to paste. The import,
 * the last-used column and the "unused seats" view that read it are gone;
 * so is `thresholds.seatIdleDays`, which a stored settings row would keep
 * surfacing on the settings page with no label. `idleSeatRatio` stays: it
 * measures unassigned seats, not usage. Rolling back restores the column
 * empty.
 */
interface Row {
  readonly key: string;
  readonly value: unknown;
}

const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609250001_drop_seat_usage',

  async up({ builder, query, connection }) {
    await builder.alterCollection('entitlementSeats', (collection) => {
      collection.dropField('lastUsedAt');
    });
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('itam_settings'))) return;
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<Row>();
    const value = row ? decode(row.value) : null;
    if (!value || !('seatIdleDays' in value)) return;
    delete value.seatIdleDays;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'thresholds')
      .execute();
  },

  async down({ builder }) {
    await builder.alterCollection('entitlementSeats', (collection) => {
      collection.datetime('lastUsedAt').nullable();
    });
  },
});

export default migration;
