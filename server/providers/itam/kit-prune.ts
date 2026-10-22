import type { DatabaseConnection } from '@nocobase/db';

/** What a kit item may point at, by its field. */
const REFS = [
  ['modelId', 'models'],
  ['categoryId', 'categories'],
  ['softwareProductId', 'softwareProducts'],
] as const;

/**
 * Takes out of every onboarding kit the items whose model, category or
 * software product no longer exists (2026-10-22): a kit keeps its items as
 * JSON, so deleting what one names — by hand, or a demo re-import clearing
 * the models it made — left the kit pointing at nothing, shown as a bare id.
 */
export async function pruneKitItems(
  connection: DatabaseConnection,
): Promise<void> {
  const kits = await connection.query
    .selectFrom('onboardingKits')
    .select(['id', 'items'])
    .execute<{ id: string; items: unknown }>();
  const parsed = kits.map((kit) => {
    let items: unknown = kit.items;
    if (typeof items === 'string')
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    return {
      id: kit.id,
      items: (Array.isArray(items) ? items : []) as Record<string, unknown>[],
    };
  });
  const existing = new Map<string, Set<string>>();
  for (const [field, table] of REFS) {
    const ids = [
      ...new Set(
        parsed.flatMap((kit) =>
          kit.items
            .map((item) => item[field])
            .filter((id): id is string => typeof id === 'string'),
        ),
      ),
    ];
    const found =
      ids.length === 0
        ? []
        : await connection.query
            .selectFrom(table)
            .select('id')
            .where('id', 'in', ids)
            .execute<{ id: string }>();
    existing.set(field, new Set(found.map((row) => row.id)));
  }
  for (const kit of parsed) {
    const kept = kit.items.filter((item) =>
      REFS.every(
        ([field]) =>
          typeof item[field] !== 'string' ||
          existing.get(field)!.has(item[field]),
      ),
    );
    if (kept.length === kit.items.length) continue;
    await connection.query
      .updateTable('onboardingKits')
      // The query layer encodes a JSON field itself.
      .set({ items: kept, updatedAt: new Date() })
      .where('id', '=', kit.id)
      .execute();
  }
}
