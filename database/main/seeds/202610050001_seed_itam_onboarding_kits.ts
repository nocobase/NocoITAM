import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// Example 入职配置: one default kit per department, the same kits the AI
// business notes describe in prose, plus one kit for a position within a
// department (Product's designers) to show the department + position match.
// They reference the seeded departments, models, categories and software
// products; a kit whose department the administrator removed is skipped,
// and an item whose model or product is gone is left out. Each kit is
// written only when its id is absent, and is the administrator's to change.

/** The language this deployment writes installation data in (see the departments seed). */
function resolveLocale(context: SeedContext): string {
  const dotted = context.config.get<string>('i18n.defaultLocale')?.trim();
  if (dotted) return dotted;
  const section = context.config.get<{ defaultLocale?: string }>('i18n');
  const nested = section?.defaultLocale?.trim();
  if (nested) return nested;
  return process.env.APP_DEFAULT_LOCALE?.trim() || 'en-US';
}

type Item =
  | { readonly modelId: string; readonly quantity: number }
  | { readonly categoryId: string; readonly quantity: number }
  | { readonly softwareProductId: string; readonly quantity: number };

interface KitSeed {
  readonly id: string;
  readonly departmentId: string;
  readonly position?: { readonly en: string; readonly zh: string };
  readonly name: { readonly en: string; readonly zh: string };
  readonly items: readonly Item[];
}

const one = (modelId: string): Item => ({ modelId, quantity: 1 });
const seat = (softwareProductId: string): Item => ({
  softwareProductId,
  quantity: 1,
});

const ENGINEERING: readonly Item[] = [
  one('model-macbook-pro-14-m3'),
  one('model-u2723qe'),
  one('model-wd22tb4'),
  one('model-mx-keys'),
  one('model-mx-master-3s'),
  seat('sp-intellij-idea'),
  seat('sp-microsoft-365'),
  seat('sp-zoom-workplace'),
];
const OFFICE: readonly Item[] = [
  // ThinkPad or Latitude: any laptop will do.
  { categoryId: 'cat-laptop', quantity: 1 },
  one('model-mx-keys'),
  one('model-mx-master-3s'),
  seat('sp-microsoft-365'),
];
const CUSTOMER_FACING: readonly Item[] = [
  one('model-macbook-air-13-m3'),
  one('model-zone-vibe-100'),
  one('model-iphone-15'),
  seat('sp-microsoft-365'),
  seat('sp-zoom-workplace'),
];

const KITS: readonly KitSeed[] = [
  {
    id: 'kit-rd',
    departmentId: 'dept-rd',
    name: { en: 'R&D standard kit', zh: '研发标准配置' },
    items: ENGINEERING,
  },
  {
    id: 'kit-qa',
    departmentId: 'dept-qa',
    name: { en: 'QA standard kit', zh: '质量标准配置' },
    items: ENGINEERING,
  },
  {
    id: 'kit-it',
    departmentId: 'dept-it',
    name: { en: 'IT Operations standard kit', zh: 'IT 运维标准配置' },
    items: [
      one('model-thinkpad-t14-gen5'),
      one('model-u2723qe'),
      one('model-wd22tb4'),
      seat('sp-microsoft-365'),
      seat('sp-zoom-workplace'),
    ],
  },
  {
    id: 'kit-product',
    departmentId: 'dept-product',
    name: { en: 'Product standard kit', zh: '产品标准配置' },
    items: [
      one('model-macbook-pro-14-m3'),
      one('model-u2723qe'),
      one('model-mx-master-3s'),
      seat('sp-figma'),
      seat('sp-microsoft-365'),
      seat('sp-zoom-workplace'),
    ],
  },
  {
    id: 'kit-product-designer',
    departmentId: 'dept-product',
    position: { en: 'Designer', zh: '设计师' },
    name: { en: 'Product designer kit', zh: '产品设计师配置' },
    items: [
      one('model-macbook-pro-14-m3'),
      one('model-u2723qe'),
      one('model-mx-master-3s'),
      seat('sp-figma'),
      seat('sp-adobe-creative-cloud'),
      seat('sp-microsoft-365'),
      seat('sp-zoom-workplace'),
    ],
  },
  {
    id: 'kit-marketing',
    departmentId: 'dept-marketing',
    name: { en: 'Marketing standard kit', zh: '市场标准配置' },
    items: [
      one('model-macbook-air-13-m3'),
      one('model-mx-master-3s'),
      seat('sp-adobe-creative-cloud'),
      seat('sp-figma'),
      seat('sp-microsoft-365'),
    ],
  },
  {
    id: 'kit-sales',
    departmentId: 'dept-sales',
    name: { en: 'Sales standard kit', zh: '销售标准配置' },
    items: CUSTOMER_FACING,
  },
  {
    id: 'kit-customer',
    departmentId: 'dept-customer',
    name: { en: 'Customer Success standard kit', zh: '客户成功标准配置' },
    items: CUSTOMER_FACING,
  },
  {
    id: 'kit-hr',
    departmentId: 'dept-hr',
    name: { en: 'HR standard kit', zh: '人力资源标准配置' },
    items: OFFICE,
  },
  {
    id: 'kit-finance',
    departmentId: 'dept-finance',
    name: { en: 'Finance standard kit', zh: '财务标准配置' },
    items: OFFICE,
  },
  {
    id: 'kit-admin',
    departmentId: 'dept-admin',
    name: { en: 'Administration standard kit', zh: '行政标准配置' },
    items: OFFICE,
  },
];

const itemId = (item: Item): { table: string; id: string } =>
  'modelId' in item
    ? { table: 'models', id: item.modelId }
    : 'categoryId' in item
      ? { table: 'categories', id: item.categoryId }
      : { table: 'softwareProducts', id: item.softwareProductId };

const seed: SeedDefinition = defineSeed({
  name: '202610050001_seed_itam_onboarding_kits',

  async run(context) {
    const { query } = context;
    const zh = resolveLocale(context).startsWith('zh');
    const now = new Date();
    for (const kit of KITS) {
      const existing = await query
        .selectFrom('onboardingKits')
        .select('id')
        .where('id', '=', kit.id)
        .executeTakeFirst();
      if (existing) continue;
      const department = await query
        .selectFrom('departments')
        .select('id')
        .where('id', '=', kit.departmentId)
        .executeTakeFirst();
      if (!department) continue;
      const items: Item[] = [];
      for (const item of kit.items) {
        const { table, id } = itemId(item);
        const found = await query
          .selectFrom(table)
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (found) items.push(item);
      }
      await query
        .insertInto('onboardingKits')
        .values({
          id: kit.id,
          name: zh ? kit.name.zh : kit.name.en,
          departmentId: kit.departmentId,
          position: kit.position ? (zh ? kit.position.zh : kit.position.en) : null,
          // The query layer encodes a JSON field itself.
          items,
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
