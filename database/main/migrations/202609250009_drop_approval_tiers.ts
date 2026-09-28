import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the approval amount tiers from the stored settings.
 *
 * Approvers were computed from the order's amount: the highest tier whose
 * threshold it passed named the people who could decide. The submitter now
 * names one person who holds that approval, so the tiers decide nothing and
 * a stored row would keep them alive in the settings page's shape. The
 * switch that says whether a kind of request needs approval stays.
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
  name: '202609250009_drop_approval_tiers',

  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('itam_settings'))) return;
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'approvals')
      .executeTakeFirst<Row>();
    const value = row ? decode(row.value) : null;
    if (!value) return;
    let changed = false;
    for (const kind of ['purchase', 'disposal']) {
      const entry = value[kind];
      if (entry && typeof entry === 'object' && 'tiers' in entry) {
        delete (entry as Record<string, unknown>).tiers;
        changed = true;
      }
    }
    if (!changed) return;
    // Written as an object: the query layer encodes a JSON field itself.
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'approvals')
      .execute();
  },

  async down() {
    // Deliberately empty: restoring empty tiers would describe a routing rule
    // the application no longer has.
  },
});

export default migration;
