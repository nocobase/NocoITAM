import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the ticket leftovers from the stored ITAM settings.
 *
 * The service's defaults lost `thresholds.ticketTimeoutHours` and the
 * `numbering.ticket` rule when the ticket module was removed
 * (`202609190004_drop_tickets`), but a row saved before that keeps them:
 * stored values are merged over the defaults, so both surfaced on the
 * settings page with no label to render — the translations went with the
 * module. The repair rule the service added since is left to the merge,
 * which fills a numbering kind the stored map does not name.
 */
interface Row {
  readonly key: string;
  readonly value: unknown;
}

/**
 * The column is JSON and the query layer decodes it, so a row may arrive as
 * an object or as the text an older write left behind — including text that
 * holds JSON twice over.
 */
const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609230004_drop_ticket_settings',
  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('itam_settings'))) return;
    const rows = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .execute<Row>();
    for (const row of rows) {
      if (row.key !== 'thresholds' && row.key !== 'numbering') continue;
      const value = decode(row.value);
      if (!value) continue;
      const field = row.key === 'thresholds' ? 'ticketTimeoutHours' : 'ticket';
      const encoded = typeof row.value === 'string';
      if (!(field in value) && !encoded) continue;
      delete value[field];
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value })
        .where('key', '=', row.key)
        .execute();
    }
  },
  async down() {
    // Deliberately empty: putting the keys back would restore settings no
    // page can label and no service reads.
  },
});

export default migration;
