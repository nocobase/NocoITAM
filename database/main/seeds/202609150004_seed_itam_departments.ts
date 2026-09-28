import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineSeed, type SeedDefinition } from '@nocobase/db';

// A starter organisation so people and devices can be filed under a
// department from the first day. Names are data written once in the
// deployment's default language, like the categories, and renamed by the
// administrator afterwards. Each node is written only when its id is absent.

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

interface DepartmentSeed {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly parentId?: string;
  readonly sort: number;
}

const DEPARTMENTS: readonly DepartmentSeed[] = [
  { id: 'dept-tech', name: 'Technology', code: 'TECH', sort: 10 },
  {
    id: 'dept-rd',
    name: 'Research & Development',
    code: 'RD',
    parentId: 'dept-tech',
    sort: 10,
  },
  {
    id: 'dept-it',
    name: 'IT Operations',
    code: 'IT',
    parentId: 'dept-tech',
    sort: 20,
  },
  {
    id: 'dept-qa',
    name: 'Quality Assurance',
    code: 'QA',
    parentId: 'dept-tech',
    sort: 30,
  },
  { id: 'dept-product', name: 'Product', code: 'PROD', sort: 20 },
  { id: 'dept-sales', name: 'Sales', code: 'SALES', sort: 30 },
  { id: 'dept-marketing', name: 'Marketing', code: 'MKT', sort: 40 },
  { id: 'dept-customer', name: 'Customer Success', code: 'CS', sort: 50 },
  { id: 'dept-hr', name: 'Human Resources', code: 'HR', sort: 60 },
  { id: 'dept-finance', name: 'Finance', code: 'FIN', sort: 70 },
  { id: 'dept-admin', name: 'Administration', code: 'ADMIN', sort: 80 },
];

/** Department names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'dept-tech': '技术部',
    'dept-rd': '研发',
    'dept-it': 'IT 运维',
    'dept-qa': '质量',
    'dept-product': '产品部',
    'dept-sales': '销售部',
    'dept-marketing': '市场部',
    'dept-customer': '客户成功部',
    'dept-hr': '人力资源部',
    'dept-finance': '财务部',
    'dept-admin': '行政部',
  },
};

const localizedName = (department: DepartmentSeed): string =>
  NAMES[LOCALE]?.[department.id] ?? department.name;

const seed: SeedDefinition = defineSeed({
  name: '202609150004_seed_itam_departments',

  async run({ query }) {
    const now = new Date();
    for (const department of DEPARTMENTS) {
      const existing = await query
        .selectFrom('departments')
        .select('id')
        .where('id', '=', department.id)
        .executeTakeFirst();
      if (existing) continue;
      const parent = department.parentId
        ? await query
            .selectFrom('departments')
            .select('path')
            .where('id', '=', department.parentId)
            .executeTakeFirst<{ path: string }>()
        : undefined;
      // A parent removed by the administrator takes its subtree with it.
      if (department.parentId && !parent) continue;
      await query
        .insertInto('departments')
        .values({
          id: department.id,
          name: localizedName(department),
          parentId: department.parentId ?? null,
          code: department.code,
          path: `${parent ? parent.path : '/'}${department.id}/`,
          costCenter: null,
          managerId: null,
          sort: department.sort,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
