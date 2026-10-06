import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// A starter organisation so people and devices can be filed under a
// department from the first day. Names are data written once in the
// deployment's default language, like the categories, and renamed by the
// administrator afterwards. Each node is written only when its id is absent.

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

interface DepartmentSeed {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly sort: number;
}

const DEPARTMENTS: readonly DepartmentSeed[] = [
  { id: 'dept-tech', name: 'Technology', sort: 10 },
  {
    id: 'dept-rd',
    name: 'Research & Development',
    parentId: 'dept-tech',
    sort: 10,
  },
  {
    id: 'dept-it',
    name: 'IT Operations',
    parentId: 'dept-tech',
    sort: 20,
  },
  {
    id: 'dept-qa',
    name: 'Quality Assurance',
    parentId: 'dept-tech',
    sort: 30,
  },
  { id: 'dept-product', name: 'Product', sort: 20 },
  { id: 'dept-sales', name: 'Sales', sort: 30 },
  { id: 'dept-marketing', name: 'Marketing', sort: 40 },
  { id: 'dept-customer', name: 'Customer Success', sort: 50 },
  { id: 'dept-hr', name: 'Human Resources', sort: 60 },
  { id: 'dept-finance', name: 'Finance', sort: 70 },
  { id: 'dept-admin', name: 'Administration', sort: 80 },
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

const localizedName = (department: DepartmentSeed, locale: string): string =>
  NAMES[locale]?.[department.id] ?? department.name;

/**
 * Each department's starting positions (2026-10-06): a person's 职位 is
 * chosen from them, and a position's own 入职配置 is attached to one. They
 * are spelled as the demo's people and the designer kit spell theirs, so
 * neither adds a near-duplicate.
 */
const POSITIONS: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  'en-US': {
    'dept-tech': ['Technical Director', 'Architect'],
    'dept-rd': [
      'Frontend Engineer',
      'Backend Engineer',
      'QA Engineer',
      'Mobile Engineer',
    ],
    'dept-it': ['IT administrator', 'IT Support Engineer', 'IT Asset Manager'],
    'dept-qa': ['QA Engineer', 'QA Manager'],
    'dept-product': ['Product Manager', 'Designer'],
    'dept-sales': [
      'Sales Manager',
      'Presales Consultant',
      'Sales Representative',
    ],
    'dept-marketing': ['Marketing Manager', 'Content Marketer'],
    'dept-customer': ['Customer Success Manager', 'Support Specialist'],
    'dept-hr': ['Recruiter', 'HR Business Partner'],
    'dept-finance': ['Finance Manager', 'Accountant'],
    'dept-admin': ['Office Administrator', 'Receptionist'],
  },
  'zh-CN': {
    'dept-tech': ['技术总监', '架构师'],
    'dept-rd': ['前端工程师', '后端工程师', '测试工程师', '移动端工程师'],
    'dept-it': ['IT 管理员', 'IT 支持工程师', 'IT 资产经理'],
    'dept-qa': ['测试工程师', '质量经理'],
    'dept-product': ['产品经理', '设计师'],
    'dept-sales': ['销售经理', '售前顾问', '销售代表'],
    'dept-marketing': ['市场经理', '内容运营'],
    'dept-customer': ['客户成功经理', '技术支持'],
    'dept-hr': ['招聘专员', 'HRBP'],
    'dept-finance': ['财务经理', '会计'],
    'dept-admin': ['行政专员', '前台'],
  },
};

const localizedPositions = (id: string, locale: string): string[] => [
  ...(POSITIONS[locale]?.[id] ?? POSITIONS['en-US']?.[id] ?? []),
];

const seed: SeedDefinition = defineSeed({
  name: '202609150004_seed_itam_departments',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
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
          name: localizedName(department, locale),
          parentId: department.parentId ?? null,
          path: `${parent ? parent.path : '/'}${department.id}/`,
          managerId: null,
          sort: department.sort,
          // The query layer encodes a JSON field itself.
          positions: localizedPositions(department.id, locale),
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
