import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Common software products and their publishers so a fresh installation can
// record licenses and subscriptions without typing the catalogue first. Each
// record is written only when its id is absent; a manufacturer or product
// whose name already exists (names are unique) is reused rather than
// duplicated. Product names are brand names and are not localized.

interface ManufacturerSeed {
  readonly id: string;
  readonly name: string;
  readonly website?: string;
}

interface SoftwareProductSeed {
  readonly id: string;
  readonly name: string;
  readonly manufacturerId: string;
  readonly categoryId: string;
  readonly deliveryMethod: 'onPremise' | 'saas' | 'both';
  readonly website?: string;
}

const MANUFACTURERS: readonly ManufacturerSeed[] = [
  { id: 'mfr-figma', name: 'Figma Inc.', website: 'https://www.figma.com' },
  {
    id: 'mfr-microsoft',
    name: 'Microsoft',
    website: 'https://www.microsoft.com',
  },
  { id: 'mfr-adobe', name: 'Adobe', website: 'https://www.adobe.com' },
  {
    id: 'mfr-jetbrains',
    name: 'JetBrains',
    website: 'https://www.jetbrains.com',
  },
  { id: 'mfr-zoom', name: 'Zoom', website: 'https://www.zoom.com' },
  { id: 'mfr-openai', name: 'OpenAI', website: 'https://openai.com' },
];

const PRODUCTS: readonly SoftwareProductSeed[] = [
  {
    id: 'sp-figma',
    name: 'Figma',
    manufacturerId: 'mfr-figma',
    categoryId: 'cat-sw-design',
    deliveryMethod: 'saas',
    website: 'https://www.figma.com',
  },
  {
    id: 'sp-adobe-creative-cloud',
    name: 'Adobe Creative Cloud',
    manufacturerId: 'mfr-adobe',
    categoryId: 'cat-sw-design',
    deliveryMethod: 'saas',
    website: 'https://www.adobe.com/creativecloud.html',
  },
  {
    id: 'sp-microsoft-365',
    name: 'Microsoft 365',
    manufacturerId: 'mfr-microsoft',
    categoryId: 'cat-sw-productivity',
    deliveryMethod: 'saas',
    website: 'https://www.microsoft.com/microsoft-365',
  },
  {
    id: 'sp-office-ltsc-2024',
    name: 'Microsoft Office LTSC 2024',
    manufacturerId: 'mfr-microsoft',
    categoryId: 'cat-sw-productivity',
    deliveryMethod: 'onPremise',
  },
  {
    id: 'sp-windows-11-pro',
    name: 'Windows 11 Pro',
    manufacturerId: 'mfr-microsoft',
    categoryId: 'cat-sw-os',
    deliveryMethod: 'onPremise',
    website: 'https://www.microsoft.com/windows',
  },
  {
    id: 'sp-intellij-idea',
    name: 'IntelliJ IDEA Ultimate',
    manufacturerId: 'mfr-jetbrains',
    categoryId: 'cat-sw-development',
    deliveryMethod: 'both',
    website: 'https://www.jetbrains.com/idea/',
  },
  {
    id: 'sp-chatgpt',
    name: 'ChatGPT',
    manufacturerId: 'mfr-openai',
    categoryId: 'cat-sw-productivity',
    deliveryMethod: 'saas',
    website: 'https://chatgpt.com',
  },
  {
    id: 'sp-zoom-workplace',
    name: 'Zoom Workplace',
    manufacturerId: 'mfr-zoom',
    categoryId: 'cat-sw-collaboration',
    deliveryMethod: 'saas',
    website: 'https://www.zoom.com',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609150002_seed_itam_software_products',

  async run({ query }) {
    const now = new Date();
    const manufacturerIds = new Map<string, string>();
    for (const manufacturer of MANUFACTURERS) {
      const existing = await query
        .selectFrom('manufacturers')
        .select('id')
        .where((eb) =>
          eb.or([
            eb('id', '=', manufacturer.id),
            eb('name', '=', manufacturer.name),
          ]),
        )
        .executeTakeFirst<{ id: string }>();
      if (existing) {
        manufacturerIds.set(manufacturer.id, existing.id);
        continue;
      }
      await query
        .insertInto('manufacturers')
        .values({
          id: manufacturer.id,
          name: manufacturer.name,
          website: manufacturer.website ?? null,
          supportPhone: null,
          supportEmail: null,
          supportUrl: null,
          notes: null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      manufacturerIds.set(manufacturer.id, manufacturer.id);
    }
    for (const product of PRODUCTS) {
      const existing = await query
        .selectFrom('softwareProducts')
        .select('id')
        .where((eb) =>
          eb.or([eb('id', '=', product.id), eb('name', '=', product.name)]),
        )
        .executeTakeFirst();
      if (existing) continue;
      const category = await query
        .selectFrom('categories')
        .select('id')
        .where('id', '=', product.categoryId)
        .executeTakeFirst();
      // A category tree edited before this seed ran may lack the category.
      if (!category) continue;
      await query
        .insertInto('softwareProducts')
        .values({
          id: product.id,
          name: product.name,
          manufacturerId:
            manufacturerIds.get(product.manufacturerId) ??
            product.manufacturerId,
          categoryId: product.categoryId,
          deliveryMethod: product.deliveryMethod,
          description: null,
          website: product.website ?? null,
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
