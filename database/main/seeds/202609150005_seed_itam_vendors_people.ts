import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// A first employee, so assignments can be recorded from the first day. The
// name is data written once in the deployment's default language. It is
// written only when its id is absent. Until 2026-10-21 it wrote a starter
// vendor per role too ("IT equipment reseller", …), placeholders nobody
// dealt with; `202610210003_remove_starter_vendors` takes them off a
// database that has them.

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


interface PersonSeed {
  readonly id: string;
  readonly name: string;
  readonly employeeNo: string;
  readonly email: string;
  readonly departmentId: string;
  readonly locationId: string;
  readonly position: string;
}

const PEOPLE: readonly PersonSeed[] = [
  // The id keeps the name it was first seeded under: a database that ran
  // this seed already holds it, and nobody reads an id.
  {
    id: 'person-li-xiao',
    name: 'James Walker',
    employeeNo: 'EMP-001',
    email: 'james.walker@example.com',
    departmentId: 'dept-it',
    locationId: 'loc-hq-floor-3',
    position: 'IT administrator',
  },
];

/** Names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'person-li-xiao': '黎晓',
    'email:person-li-xiao': 'li.xiao@example.com',
    'position:person-li-xiao': 'IT 管理员',
  },
};

const localized = (id: string, fallback: string, locale: string): string =>
  NAMES[locale]?.[id] ?? fallback;

const seed: SeedDefinition = defineSeed({
  name: '202609150005_seed_itam_vendors_people',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
    const now = new Date();
    for (const person of PEOPLE) {
      const existing = await query
        .selectFrom('people')
        .select('id')
        .where((eb) =>
          eb.or([
            eb('id', '=', person.id),
            eb('employeeNo', '=', person.employeeNo),
          ]),
        )
        .executeTakeFirst();
      if (existing) continue;
      const department = await query
        .selectFrom('departments')
        .select('id')
        .where('id', '=', person.departmentId)
        .executeTakeFirst();
      // The department seed runs first; a removed department skips the person.
      if (!department) continue;
      const location = await query
        .selectFrom('locations')
        .select('id')
        .where('id', '=', person.locationId)
        .executeTakeFirst();
      await query
        .insertInto('people')
        .values({
          id: person.id,
          name: localized(person.id, person.name, locale),
          employeeNo: person.employeeNo,
          email: localized(`email:${person.id}`, person.email, locale),
          phone: null,
          departmentId: person.departmentId,
          position: localized(`position:${person.id}`, person.position, locale),
          locationId: location ? person.locationId : null,
          userId: null,
          employmentStatus: 'active',
          hireDate: null,
          leaveDate: null,
          notes: null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
