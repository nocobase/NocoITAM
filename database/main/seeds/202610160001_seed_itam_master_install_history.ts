import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * A creation line for the master data that came with the installation
 * (2026-10-16). The seeds write their categories, manufacturers, models and
 * the rest straight into the tables, so their 历史 tab started empty while a
 * record somebody added later opened on "创建". Each record with no creation
 * line gets one, dated when the record was, with no actor and the `install`
 * origin, which the timeline reads as 随系统安装. Records written through
 * the services already have theirs and are left alone; the ids are fixed,
 * so a repeat run adds nothing.
 */
const COLLECTIONS = [
  'categories',
  'manufacturers',
  'models',
  'softwareProducts',
  'locations',
  'departments',
  'vendors',
  'people',
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202610160001_seed_itam_master_install_history',

  async run({ query }) {
    for (const collection of COLLECTIONS) {
      const logged = new Set(
        (
          await query
            .selectFrom('changeLogs')
            .select(['subjectId'])
            .where('subjectType', '=', collection)
            .where('action', '=', 'create')
            .execute<{ subjectId: string }>()
        ).map((row) => String(row.subjectId)),
      );
      const rows = await query
        .selectFrom(collection)
        .select(['id', 'createdAt'])
        .execute<{ id: unknown; createdAt: unknown }>();
      for (const row of rows) {
        const id = String(row.id);
        if (logged.has(id)) continue;
        await query
          .insertInto('changeLogs')
          .values({
            id: `install:${collection}:${id}`.slice(0, 64),
            subjectType: collection,
            subjectId: id,
            action: 'create',
            field: null,
            oldValue: null,
            newValue: null,
            sourceType: null,
            sourceId: null,
            actorId: null,
            origin: 'install',
            operationId: null,
            createdAt: row.createdAt ?? new Date(),
          })
          .execute();
      }
    }
  },
});

export default seed;
