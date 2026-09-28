import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineSeed, type SeedDefinition } from '@nocobase/db';

// A starter location tree so devices can be placed from the first day: the
// head office with a floor, a warehouse and a server room, and a branch.
// Names are data
// written once in the deployment's default language, like the categories,
// and renamed by the administrator afterwards. Each node is written only
// when its id is absent.

/** Same resolution as the category seed: env, then config, then en-US. */
function resolveDefaultLocale(): string {
  const fromEnvironment = process.env.APP_DEFAULT_LOCALE?.trim();
  if (fromEnvironment) return fromEnvironment;
  const root = process.env.APP_CONFIG_FILE
    ? path.resolve(process.env.APP_CONFIG_FILE)
    : ['config.yml', 'config.yaml', 'config.json']
        .map((name) => path.resolve(process.cwd(), name))
        .find((candidate) => existsSync(candidate));
  if (!root || !existsSync(root)) return 'en-US';
  const text = readFileSync(root, 'utf8');
  if (root.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as { i18n?: { defaultLocale?: string } };
      return parsed.i18n?.defaultLocale ?? 'en-US';
    } catch {
      return 'en-US';
    }
  }
  const block = /^i18n:\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
  const line = block
    ? /^[ \t]+defaultLocale:[ \t]*["']?([A-Za-z-]+)/m.exec(block[1] ?? '')
    : undefined;
  return line?.[1] ?? 'en-US';
}

const LOCALE = resolveDefaultLocale();

interface LocationSeed {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly parentId?: string;
  readonly sort: number;
}

const LOCATIONS: readonly LocationSeed[] = [
  { id: 'loc-hq', name: 'Singapore HQ', type: 'company', sort: 10 },
  {
    id: 'loc-hq-floor-3',
    name: 'Level 3',
    type: 'floor',
    parentId: 'loc-hq',
    sort: 10,
  },
  {
    id: 'loc-hq-warehouse',
    name: 'Warehouse',
    type: 'warehouse',
    parentId: 'loc-hq',
    sort: 20,
  },
  {
    id: 'loc-hq-server-room',
    name: 'Server room',
    type: 'room',
    parentId: 'loc-hq',
    sort: 30,
  },
  { id: 'loc-japan', name: 'Japan branch', type: 'company', sort: 20 },
];

/** Location names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'loc-hq': '新加坡总部',
    'loc-hq-floor-3': '3 楼',
    'loc-hq-warehouse': '仓库',
    'loc-hq-server-room': '机房',
    'loc-japan': '日本分公司',
  },
};

const localizedName = (location: LocationSeed): string =>
  NAMES[LOCALE]?.[location.id] ?? location.name;

const seed: SeedDefinition = defineSeed({
  name: '202609150003_seed_itam_locations',

  async run({ query }) {
    const now = new Date();
    for (const location of LOCATIONS) {
      const existing = await query
        .selectFrom('locations')
        .select('id')
        .where('id', '=', location.id)
        .executeTakeFirst();
      if (existing) continue;
      const parent = location.parentId
        ? await query
            .selectFrom('locations')
            .select('path')
            .where('id', '=', location.parentId)
            .executeTakeFirst<{ path: string }>()
        : undefined;
      // A parent removed by the administrator takes its subtree with it.
      if (location.parentId && !parent) continue;
      await query
        .insertInto('locations')
        .values({
          id: location.id,
          name: localizedName(location),
          parentId: location.parentId ?? null,
          type: location.type,
          path: `${parent ? parent.path : '/'}${location.id}/`,
          address: null,
          ownerId: null,
          notes: null,
          sort: location.sort,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
