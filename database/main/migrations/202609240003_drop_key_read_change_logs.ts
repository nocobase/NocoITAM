import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Removes the change-log rows a product key read left behind.
 *
 * Revealing or copying a key is audited, but it changes nothing: the rows
 * carried no old or new value and collected one entry per look, which buried
 * the record's actual changes. The read is recorded in the application log
 * now (`itam.productKey.read`), so the change log holds changes again.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240003_drop_key_read_change_logs',
  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('change_logs'))) return;
    await query
      .deleteFrom('changeLogs')
      .where('action', '=', 'view')
      .where('subjectType', '=', 'entitlements')
      .execute();
  },
  async down() {
    // Deliberately empty: the rows recorded reads that are now kept in the
    // application log, and nothing can reconstruct them here.
  },
});

export default migration;
