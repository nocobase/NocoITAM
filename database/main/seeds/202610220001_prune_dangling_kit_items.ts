import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Takes out of every onboarding kit the items whose model, category or
 * software product is gone (2026-10-22): until deleting one took it out of
 * the kits too, a demo re-import left a model of the demo in a department's
 * kit as a bare id. Self-contained, as a seed is; the service does the same
 * from now on (`pruneKitItems`).
 */
const REFS = [
  ['modelId', 'models'],
  ['categoryId', 'categories'],
  ['softwareProductId', 'softwareProducts'],
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202610220001_prune_dangling_kit_items',

  async run({ query }) {
    const kits = await query
      .selectFrom('onboardingKits')
      .select(['id', 'items'])
      .execute<{ id: string; items: unknown }>();
    for (const kit of kits) {
      let items: unknown = kit.items;
      if (typeof items === 'string')
        try {
          items = JSON.parse(items);
        } catch {
          continue;
        }
      if (!Array.isArray(items)) continue;
      const kept: unknown[] = [];
      for (const entry of items as Record<string, unknown>[]) {
        let present = true;
        for (const [field, table] of REFS) {
          const id = entry?.[field];
          if (typeof id !== 'string') continue;
          if (
            !(await query
              .selectFrom(table)
              .select('id')
              .where('id', '=', id)
              .executeTakeFirst())
          )
            present = false;
        }
        if (present) kept.push(entry);
      }
      if (kept.length === items.length) continue;
      await query
        .updateTable('onboardingKits')
        // The query layer encodes a JSON field itself.
        .set({ items: kept, updatedAt: new Date() })
        .where('id', '=', kit.id)
        .execute();
    }
  },
});

export default seed;
