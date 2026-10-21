import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The headquarters is in Shanghai (2026-10-21; seeded as Singapore until
 * then), where the vendors, the phone numbers and the sign-in page's floor
 * plan already were. Renames the seeded headquarters if it still carries
 * the old seeded name, in either language, and gives the two seeded sites
 * their street address where none is set — an administrator's own name or
 * address is left alone.
 */
const RENAMES: readonly (readonly [string, string])[] = [
  ['Singapore HQ', 'Shanghai HQ'],
  ['新加坡总部', '上海总部'],
];

/** Each site's address, by the language its name is in. */
const ADDRESSES: Readonly<
  Record<string, { readonly zh: string; readonly en: string }>
> = {
  'loc-hq': {
    zh: '上海市浦东新区世纪大道 1568 号',
    en: '1568 Century Avenue, Pudong, Shanghai',
  },
  'loc-japan': {
    zh: '东京都港区六本木 6-10-1',
    en: '6-10-1 Roppongi, Minato-ku, Tokyo',
  },
};

const seed: SeedDefinition = defineSeed({
  name: '202610210004_move_hq_to_shanghai',

  async run({ query }) {
    for (const [from, to] of RENAMES)
      await query
        .updateTable('locations')
        .set({ name: to })
        .where('id', '=', 'loc-hq')
        .where('name', '=', from)
        .execute();
    for (const [id, address] of Object.entries(ADDRESSES)) {
      const site = await query
        .selectFrom('locations')
        .select(['name', 'address'])
        .where('id', '=', id)
        .executeTakeFirst<{ name: string; address: string | null }>();
      if (!site || site.address) continue;
      // A Chinese name takes the Chinese address.
      const chinese = /[\u4e00-\u9fff]/.test(site.name);
      await query
        .updateTable('locations')
        .set({ address: chinese ? address.zh : address.en })
        .where('id', '=', id)
        .execute();
    }
  },
});

export default seed;
