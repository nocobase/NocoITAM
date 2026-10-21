import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

/**
 * Ids of the given tree nodes and all their descendants, using the
 * materialized `path` column of `locations` and `departments`; categories,
 * which keep none, are walked by their parent (a few hundred at most).
 */
export async function subtreeIds(
  source: DatabaseManager | DatabaseConnection,
  table: 'locations' | 'departments' | 'categories',
  ids: readonly string[],
): Promise<readonly string[]> {
  if (ids.length === 0) return [];
  const query =
    'query' in source && typeof source.query !== 'function'
      ? (source as DatabaseConnection).query
      : (source as DatabaseManager).query();
  if (table === 'categories') {
    const nodes = await query
      .selectFrom(table)
      .select(['id', 'parentId'])
      .execute<{ id: string; parentId: string | null }>();
    const found = nodes
      .filter((node) => ids.includes(node.id))
      .map((n) => n.id);
    for (let at = 0; at < found.length; at++)
      for (const node of nodes)
        if (node.parentId === found[at] && !found.includes(node.id))
          found.push(node.id);
    return found;
  }
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
