import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Repairs the `account` table left behind by an earlier authentication
 * plugin.
 *
 * That version identified an account by `issuer + accountId` and made the
 * column `NOT NULL`; the plugin installed today identifies it by
 * `providerId + accountId` and never writes an issuer. The migration that
 * creates the table carries the same name in both versions, so it never ran
 * again and this database kept a required column nothing fills: creating a
 * user failed with `NOT NULL constraint failed: account.issuer` and the
 * Users page answered 500.
 *
 * Dropping the column takes its unique index with it, so the index the
 * current schema expects is created in its place, and the collection
 * metadata loses the field as well — since beta.43 a metadata entry with no
 * physical column makes every decision on that Collection fail to resolve. A
 * database created by the current plugin has none of the three, and this
 * migration then does nothing.
 */
interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
    alterTable(
      table: string,
      build: (table: {
        dropColumn(column: string): unknown;
        unique(
          columns: readonly string[],
          options: { indexName: string },
        ): unknown;
      }) => void,
    ): Promise<unknown>;
    raw(sql: string): Promise<unknown>;
  };
  raw(sql: string): Promise<unknown>;
}

const migration: MigrationDefinition = defineMigration({
  name: '202609250010_repair_account_issuer',

  async up({ connection, query }) {
    const client = await connection.client<SchemaClient>();
    if (!(await client.schema.hasTable('account'))) return;
    // The column and the metadata entry are separate leftovers: a database
    // may have either, so each is checked on its own.
    if (await client.schema.hasColumn('account', 'issuer')) {
      await client.raw('drop index if exists `uq_account_issuer_account`');
      await client.schema.alterTable('account', (table) => {
        table.dropColumn('issuer');
      });
      await client.raw(
        'create unique index if not exists `uq_account_provider_account` on `account` (`provider_id`, `account_id`)',
      );
    }
    const rows = await query
      .selectFrom('__nocobase_collection_metadata')
      .select(['name', 'document'])
      .where('name', '=', 'account')
      .execute<{ name: string; document: string }>();
    for (const row of rows) {
      const document = JSON.parse(String(row.document)) as {
        fields?: Record<string, unknown>;
        indexes?: Record<string, unknown>;
      };
      if (!document.fields || !('issuer' in document.fields)) continue;
      delete document.fields.issuer;
      if (document.indexes) delete document.indexes.uq_account_issuer_account;
      await query
        .updateTable('__nocobase_collection_metadata')
        .set({ document: JSON.stringify(document) })
        .where('name', '=', 'account')
        .execute();
    }
  },

  async down() {
    // Deliberately empty: restoring a required column that nothing fills is
    // the defect this repairs.
  },
});

export default migration;
