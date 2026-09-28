import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device numbers no longer run per category (decided 2026-09-27). The
 * switch kept one sequence per category under the same prefix, so two
 * categories each handed out DE-000001. Every numbering rule loses
 * `perCategory`, and the per-category sequences (`device:<categoryId>`)
 * fold into the one device sequence, which continues after the highest
 * number any of them reached. Rolling back restores the switch, off; the
 * folded sequences are not split again.
 */
interface SettingsRow {
  readonly key: string;
  readonly value: unknown;
}

/** A JSON column arrives decoded, or as the text an older write left. */
const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const readNumbering = async (
  query: Parameters<MigrationDefinition['up']>[0]['query'],
) => {
  const row = await query
    .selectFrom('itamSettings')
    .select(['key', 'value'])
    .where('key', '=', 'numbering')
    .executeTakeFirst<SettingsRow>();
  return row ? decode(row.value) : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609270012_drop_per_category_numbering',

  async up({ query }) {
    const numbering = await readNumbering(query);
    if (numbering) {
      for (const rule of Object.values(numbering))
        if (rule && typeof rule === 'object')
          delete (rule as Record<string, unknown>).perCategory;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value: numbering })
        .where('key', '=', 'numbering')
        .execute();
    }

    const sequences = await query
      .selectFrom('numberSequences')
      .select(['key', 'nextValue'])
      .where((eb) =>
        eb.or([eb('key', '=', 'device'), eb('key', 'like', 'device:%')]),
      )
      .execute<{ key: string; nextValue: unknown }>();
    const perCategory = sequences.filter((row) => row.key !== 'device');
    if (perCategory.length === 0) return;
    const next = Math.max(...sequences.map((row) => Number(row.nextValue)));
    const now = new Date();
    if (sequences.some((row) => row.key === 'device'))
      await query
        .updateTable('numberSequences')
        .set({ nextValue: next, updatedAt: now })
        .where('key', '=', 'device')
        .execute();
    else
      await query
        .insertInto('numberSequences')
        .values({ key: 'device', nextValue: next, updatedAt: now })
        .execute();
    await query
      .deleteFrom('numberSequences')
      .where('key', 'like', 'device:%')
      .execute();
  },

  async down({ query }) {
    const numbering = await readNumbering(query);
    if (!numbering) return;
    for (const rule of Object.values(numbering))
      if (rule && typeof rule === 'object')
        (rule as Record<string, unknown>).perCategory = false;
    await query
      .updateTable('itamSettings')
      .set({ value: numbering })
      .where('key', '=', 'numbering')
      .execute();
  },
});

export default migration;
