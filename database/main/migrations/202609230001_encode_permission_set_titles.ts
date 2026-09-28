import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Permission set titles are stored encoded since `@nocobase/authorization`
 * 0.1.0-beta.8 (template beta.43): a JSON string, or a JSON `{ key, ns }`
 * translation descriptor. Sets written before that hold bare text, which the
 * store now fails to parse — which takes down every read of the permission
 * sets, so the rows are encoded here.
 */
interface Row {
  readonly id: string;
  readonly title: string | null;
}

const isEncoded = (value: string): boolean => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const migration: MigrationDefinition = defineMigration({
  name: '202609230001_encode_permission_set_titles',
  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    const rows = await query
      .selectFrom('authorizationPermissionSets')
      .select(['id', 'title'])
      .execute<Row>();
    for (const row of rows) {
      if (row.title === null || isEncoded(row.title)) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ title: JSON.stringify(row.title) })
        .where('id', '=', row.id)
        .execute();
    }
  },
  async down({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    const rows = await query
      .selectFrom('authorizationPermissionSets')
      .select(['id', 'title'])
      .execute<Row>();
    for (const row of rows) {
      if (row.title === null) continue;
      let decoded: unknown;
      try {
        decoded = JSON.parse(row.title);
      } catch {
        continue;
      }
      if (typeof decoded !== 'string') continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({ title: decoded })
        .where('id', '=', row.id)
        .execute();
    }
  },
});

export default migration;
