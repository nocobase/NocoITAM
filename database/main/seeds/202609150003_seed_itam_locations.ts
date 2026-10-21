
import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// A starter location tree so devices can be placed from the first day: the
// head office with a floor, a warehouse and a server room, and a branch.
// Names are data
// written once in the deployment's default language, like the categories,
// and renamed by the administrator afterwards. Each node is written only
// when its id is absent.

/**
 * The language this deployment writes installation data in.
 *
 * `context.config` is the application's own runtime configuration — the same
 * reader the server resolves `i18n.defaultLocale` through — so this answer
 * holds wherever the host starts the process from. The seeds used to look for
 * `config.yml` themselves, relative to `process.cwd()`, which matched the
 * deployment only when the working directory happened to be the deployment
 * root. `pnpm dev` always did and a Hub deployment never did, so every seeded
 * name came out in English there while looking correct in development, and the
 * fallback was a valid locale rather than an error, so nothing said so.
 *
 * `APP_DEFAULT_LOCALE` remains the fallback for a runner given no application
 * configuration, such as a standalone seeder in a test.
 */
function resolveLocale(context: SeedContext): string {
  const dotted = context.config.get<string>('i18n.defaultLocale')?.trim();
  if (dotted) return dotted;
  const section = context.config.get<{ defaultLocale?: string }>('i18n');
  const nested = section?.defaultLocale?.trim();
  if (nested) return nested;
  return process.env.APP_DEFAULT_LOCALE?.trim() || 'en-US';
}


interface LocationSeed {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly parentId?: string;
  readonly sort: number;
  /** A site's street address; a floor or room is where its site is. */
  readonly address?: Readonly<Record<string, string>>;
}

const LOCATIONS: readonly LocationSeed[] = [
  // Shanghai since 2026-10-21 (Singapore until then): the vendors, the
  // phone numbers and the sign-in page's floor plan were all Shanghai's.
  {
    id: 'loc-hq',
    name: 'Shanghai HQ',
    type: 'company',
    sort: 10,
    address: {
      'en-US': '1568 Century Avenue, Pudong, Shanghai',
      'zh-CN': '上海市浦东新区世纪大道 1568 号',
    },
  },
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
  {
    id: 'loc-japan',
    name: 'Japan branch',
    type: 'company',
    sort: 20,
    address: {
      'en-US': '6-10-1 Roppongi, Minato-ku, Tokyo',
      'zh-CN': '东京都港区六本木 6-10-1',
    },
  },
];

/** Location names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'loc-hq': '上海总部',
    'loc-hq-floor-3': '3 楼',
    'loc-hq-warehouse': '仓库',
    'loc-hq-server-room': '机房',
    'loc-japan': '日本分公司',
  },
};

const localizedName = (location: LocationSeed, locale: string): string =>
  NAMES[locale]?.[location.id] ?? location.name;

const seed: SeedDefinition = defineSeed({
  name: '202609150003_seed_itam_locations',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
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
          name: localizedName(location, locale),
          parentId: location.parentId ?? null,
          type: location.type,
          path: `${parent ? parent.path : '/'}${location.id}/`,
          address:
            location.address?.[locale] ?? location.address?.['en-US'] ?? null,
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
