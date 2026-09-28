import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Starter vendors, one per role, and a first employee, so purchase orders,
// repairs and assignments can be recorded from the first day. Names are data
// written once in the deployment's default language and renamed by the
// administrator afterwards. Each record is written only when its id is
// absent; a vendor whose name already exists (names are unique) is left alone.

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

interface VendorSeed {
  readonly id: string;
  readonly name: string;
  readonly types: readonly string[];
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

const VENDORS: readonly VendorSeed[] = [
  {
    id: 'vendor-equipment',
    name: 'IT equipment reseller',
    types: ['equipment', 'softwareReseller'],
  },
  {
    id: 'vendor-software',
    name: 'Software reseller',
    types: ['softwareReseller'],
  },
  { id: 'vendor-repair', name: 'Repair provider', types: ['repairProvider'] },
  { id: 'vendor-recycler', name: 'Recycler', types: ['recycler'] },
];

const PEOPLE: readonly PersonSeed[] = [
  {
    id: 'person-li-xiao',
    name: 'Li Xiao',
    employeeNo: 'EMP-001',
    email: 'li.xiao@example.com',
    departmentId: 'dept-it',
    locationId: 'loc-hq-floor-3',
    position: 'IT administrator',
  },
];

/** Names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'vendor-equipment': 'IT 设备经销商',
    'vendor-software': '软件经销商',
    'vendor-repair': '维修服务商',
    'vendor-recycler': '回收商',
    'person-li-xiao': '黎晓',
    'position:person-li-xiao': 'IT 管理员',
  },
};

const localized = (id: string, fallback: string): string =>
  NAMES[LOCALE]?.[id] ?? fallback;

const seed: SeedDefinition = defineSeed({
  name: '202609150005_seed_itam_vendors_people',

  async run({ query }) {
    const now = new Date();
    for (const vendor of VENDORS) {
      const name = localized(vendor.id, vendor.name);
      const existing = await query
        .selectFrom('vendors')
        .select('id')
        .where((eb) => eb.or([eb('id', '=', vendor.id), eb('name', '=', name)]))
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('vendors')
        .values({
          id: vendor.id,
          name,
          types: vendor.types,
          contactName: null,
          phone: null,
          email: null,
          address: null,
          website: null,
          notes: null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
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
          name: localized(person.id, person.name),
          employeeNo: person.employeeNo,
          email: person.email,
          phone: null,
          departmentId: person.departmentId,
          position: localized(`position:${person.id}`, person.position),
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
