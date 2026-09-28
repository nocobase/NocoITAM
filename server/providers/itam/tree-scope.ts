import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

/**
 * Ids of the given tree nodes and all their descendants, using the
 * materialized `path` column of `locations` and `departments`.
 */
export async function subtreeIds(
  source: DatabaseManager | DatabaseConnection,
  table: 'locations' | 'departments',
  ids: readonly string[],
): Promise<readonly string[]> {
  if (ids.length === 0) return [];
  const query =
    'query' in source && typeof source.query !== 'function'
      ? (source as DatabaseConnection).query
      : (source as DatabaseManager).query();
  const roots = await query
    .selectFrom(table)
    .select('path')
    .where('id', 'in', [...ids])
    .execute<{ path: string }>();
  if (roots.length === 0) return [];
  const rows = await query
    .selectFrom(table)
    .select('id')
    .where((eb) =>
      eb.or(roots.map((root) => eb('path', 'like', `${root.path}%`))),
    )
    .execute<{ id: string }>();
  return rows.map((row) => row.id);
}
