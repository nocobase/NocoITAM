import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// Common manufacturers and models so a fresh installation can register
// assets without typing the catalogue first. Each record is written only when
// its id is absent; a manufacturer whose name already exists (names are
// unique) is reused rather than duplicated. Specifications are data written
// once in the deployment's default language, like the category names.
//
// Every model gets a picture the same way an upload stores one: the bytes go
// to the file plugin's local disk (`<storage>/objects/<id>.<ext>`, the
// `storage/` directory unless `APP_STORAGE_DIR` says otherwise) and a row to
// `itamFiles`, and the model's `imageFileId` points at that row. The pictures
// live in `assets/models/` next to this seed; `CREDITS.md` there lists the
// photos' licenses, which `imageCredit` repeats on the model page.

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


interface ManufacturerSeed {
  readonly id: string;
  readonly name: string;
  readonly website?: string;
}

interface ModelSeed {
  readonly id: string;
  readonly name: string;
  readonly manufacturerId: string;
  readonly categoryId: string;
  readonly code?: string;
  readonly specification?: string;
  readonly warrantyMonths?: number;
  /** File name under `assets/models/`. */
  readonly image: string;
  /** Attribution the picture's license requires; none for our own drawings. */
  readonly imageCredit?: string;
}

/** Fixed file ids so a repeated run finds its pictures instead of adding them. */
const PICTURE_FILE_IDS: Readonly<Record<string, string>> = {
  'laptop.svg': '352aed01-d257-59b2-85d0-8dcebb263cb8',
  'desktop.svg': '53a59a2b-781b-5db5-9a72-9fa080d06477',
  'monitor.svg': 'ea3a6843-b16b-5692-9a48-a0b18fb9bf60',
  'server.svg': 'f84af49a-e4e6-5184-84c3-eef620f02bc6',
  'network.svg': 'd7c3ae10-353d-5d96-9bff-17a44e3ef7c0',
  'phone.svg': 'cabcdf09-99f2-549c-90d6-5a2a496fb04b',
  'printer.svg': '70a07617-1091-5f64-b624-a09abbf57924',
  'virtual.svg': '26531faf-37da-567f-97d1-28efb18cb208',
  'mouse.svg': '45ed46d1-1ecc-5352-ad43-d9f875748618',
  'keyboard.svg': 'a4dbb661-6448-5e31-a178-ad054510fd32',
  'dock.svg': '27995f2d-8017-54e8-ad11-7ca00a6fcefe',
  'toner.svg': '335dc32c-7c0c-5dc3-98a0-d16e3e6324d8',
  'disk.svg': '1b61195f-bb60-5bfe-a804-20226cfe92aa',
  'memory.svg': 'fea00f16-4f83-5af6-b8d6-c69ddf120823',
  'headset.svg': 'f0ba82b1-9f09-5af2-a220-dc8467946dfb',
  'cable.svg': '64c8e8c7-7dba-57d7-9dbc-3157f6f98e21',
  'battery.svg': 'dfb62c27-051e-5729-988f-645e9ebb3b19',
  'macbook-pro-14-m3.jpg': '419aaaa2-bf99-515c-b4ae-78dbe21e061e',
  'macbook-air-13-m3.jpg': 'f6052130-a7ea-5f17-b613-43e11def712b',
  'thinkpad-t14.jpg': '287c9828-3e32-5202-b14c-7465548bac62',
  'iphone-15.jpg': 'f47e6880-c469-51d3-b092-79488ba10e30',
  'mx-master-3s.jpg': '7d42559e-4eb3-5da7-ad9b-f5e8382e0c30',
  'mx-keys.jpg': '27d4635a-c65a-5532-af12-77a98e59f77c',
};

const MANUFACTURERS: readonly ManufacturerSeed[] = [
  { id: 'mfr-apple', name: 'Apple', website: 'https://www.apple.com' },
  { id: 'mfr-dell', name: 'Dell', website: 'https://www.dell.com' },
  { id: 'mfr-lenovo', name: 'Lenovo', website: 'https://www.lenovo.com' },
  { id: 'mfr-hp', name: 'HP', website: 'https://www.hp.com' },
  { id: 'mfr-cisco', name: 'Cisco', website: 'https://www.cisco.com' },
  { id: 'mfr-logitech', name: 'Logitech', website: 'https://www.logitech.com' },
  { id: 'mfr-vmware', name: 'VMware', website: 'https://www.vmware.com' },
  { id: 'mfr-samsung', name: 'Samsung', website: 'https://www.samsung.com' },
  { id: 'mfr-crucial', name: 'Crucial', website: 'https://www.crucial.com' },
];

const MODELS: readonly ModelSeed[] = [
  {
    id: 'model-macbook-pro-14-m3',
    image: 'macbook-pro-14-m3.jpg',
    imageCredit: 'Kyu3a, CC BY-SA 4.0, Wikimedia Commons',
    name: 'MacBook Pro 14 M3',
    manufacturerId: 'mfr-apple',
    categoryId: 'cat-laptop',
    code: 'MRX33CH/A',
    specification: '14-inch, M3, 16 GB memory, 512 GB SSD',
    warrantyMonths: 36,
  },
  {
    id: 'model-macbook-air-13-m3',
    image: 'macbook-air-13-m3.jpg',
    imageCredit: 'KKPCW（Kyu3）, CC BY-SA 4.0, Wikimedia Commons',
    name: 'MacBook Air 13 M3',
    manufacturerId: 'mfr-apple',
    categoryId: 'cat-laptop',
    code: 'MRXV3CH/A',
    specification: '13-inch, M3, 16 GB memory, 256 GB SSD',
    warrantyMonths: 36,
  },
  {
    id: 'model-thinkpad-t14-gen5',
    image: 'thinkpad-t14.jpg',
    imageCredit: 'Edvard10, CC0, Wikimedia Commons',
    name: 'ThinkPad T14 Gen 5',
    manufacturerId: 'mfr-lenovo',
    categoryId: 'cat-laptop',
    code: '21ML000ECD',
    specification: '14-inch, Core Ultra 5 125U, 16 GB memory, 512 GB SSD',
    warrantyMonths: 36,
  },
  {
    id: 'model-latitude-5440',
    image: 'laptop.svg',
    name: 'Latitude 5440',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-laptop',
    code: '210-BFZY',
    specification: '14-inch, Core i5-1335U, 16 GB memory, 512 GB SSD',
    warrantyMonths: 36,
  },
  {
    id: 'model-optiplex-7010',
    image: 'desktop.svg',
    name: 'OptiPlex 7010',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-desktop',
    code: '210-BFXR',
    specification: 'Core i5-13500, 16 GB memory, 512 GB SSD',
    warrantyMonths: 36,
  },
  {
    id: 'model-u2723qe',
    image: 'monitor.svg',
    name: 'U2723QE',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-monitor',
    code: '210-BDPF',
    specification: '27-inch 4K IPS, USB-C 90 W power delivery',
    warrantyMonths: 36,
  },
  {
    id: 'model-poweredge-r760',
    image: 'server.svg',
    name: 'PowerEdge R760',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-server',
    code: '210-BDZY',
    specification: '2U, dual Xeon Silver 4410Y, 256 GB memory',
    warrantyMonths: 60,
  },
  {
    id: 'model-catalyst-9200-48p',
    image: 'network.svg',
    name: 'Catalyst 9200-48P',
    manufacturerId: 'mfr-cisco',
    categoryId: 'cat-network',
    code: 'C9200-48P-E',
    specification: '48-port PoE+ gigabit access switch',
    warrantyMonths: 60,
  },
  {
    id: 'model-iphone-15',
    image: 'iphone-15.jpg',
    imageCredit: 'ThePhotoGraphIc, CC BY-SA 4.0, Wikimedia Commons',
    name: 'iPhone 15',
    manufacturerId: 'mfr-apple',
    categoryId: 'cat-phone',
    code: 'MTLH3CH/A',
    specification: '128 GB, black',
    warrantyMonths: 12,
  },
  {
    id: 'model-laserjet-pro-m428',
    image: 'printer.svg',
    name: 'LaserJet Pro M428',
    manufacturerId: 'mfr-hp',
    categoryId: 'cat-printer',
    code: 'W1A31A',
    specification: 'Monochrome laser multifunction printer, duplex',
    warrantyMonths: 12,
  },
  // Consumables and components are bought by model too: the toner of the
  // seeded printer, and the parts the demo installs.
  {
    id: 'model-hp-58a',
    image: 'toner.svg',
    name: 'HP 58A toner',
    manufacturerId: 'mfr-hp',
    categoryId: 'cat-toner',
    code: 'CF258A',
    specification: 'Black toner cartridge, about 3,000 pages',
    warrantyMonths: 12,
  },
  {
    id: 'model-zone-vibe-100',
    image: 'headset.svg',
    name: 'Zone Vibe 100',
    manufacturerId: 'mfr-logitech',
    categoryId: 'cat-headset',
    code: '981-001256',
    specification: 'Wireless headset, graphite',
    warrantyMonths: 24,
  },
  {
    id: 'model-usb-c-cable-1m',
    image: 'cable.svg',
    name: 'USB-C Cable 1 m',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-cable',
    code: '470-AGMM',
    specification: 'USB-C to USB-C, 100 W, 1 m',
  },
  {
    id: 'model-latitude-5440-battery',
    image: 'battery.svg',
    name: 'Latitude 5440 Battery',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-battery',
    code: '451-BCVH',
    specification: '54 Wh, 3-cell replacement battery',
    warrantyMonths: 12,
  },
  {
    id: 'model-980-pro-1tb',
    image: 'disk.svg',
    name: '980 PRO 1 TB',
    manufacturerId: 'mfr-samsung',
    categoryId: 'cat-disk',
    code: 'MZ-V8P1T0B',
    specification: 'NVMe M.2 SSD, PCIe 4.0, 1 TB',
    warrantyMonths: 60,
  },
  {
    id: 'model-ddr5-32gb-sodimm',
    image: 'memory.svg',
    name: 'DDR5-5600 32 GB SO-DIMM',
    manufacturerId: 'mfr-crucial',
    categoryId: 'cat-memory',
    code: 'CT32G56C46S5',
    specification: '32 GB DDR5-5600 SO-DIMM, CL46',
    warrantyMonths: 120,
  },
  {
    id: 'model-vsphere-vm',
    image: 'virtual.svg',
    name: 'vSphere VM',
    manufacturerId: 'mfr-vmware',
    categoryId: 'cat-virtual',
  },
  {
    id: 'model-mx-master-3s',
    image: 'mx-master-3s.jpg',
    imageCredit: 'Hayden Schiff, CC BY 4.0, Wikimedia Commons',
    name: 'MX Master 3S',
    manufacturerId: 'mfr-logitech',
    categoryId: 'cat-mouse',
    code: '910-006559',
    specification: 'Wireless mouse, graphite',
  },
  {
    id: 'model-mx-keys',
    image: 'mx-keys.jpg',
    imageCredit: 'TaurusEmerald, CC BY-SA 4.0, Wikimedia Commons',
    name: 'MX Keys',
    manufacturerId: 'mfr-logitech',
    categoryId: 'cat-keyboard',
    code: '920-009295',
    specification: 'Wireless keyboard, graphite',
  },
  {
    id: 'model-wd22tb4',
    image: 'dock.svg',
    name: 'WD22TB4',
    manufacturerId: 'mfr-dell',
    categoryId: 'cat-dock',
    code: '210-BDPZ',
    specification: 'Thunderbolt 4 dock, 130 W power delivery',
  },
];

/** Specifications by model id for locales other than English. */
const SPECIFICATIONS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'zh-CN': {
    'model-macbook-pro-14-m3': '14 英寸，M3，16 GB 内存，512 GB SSD',
    'model-macbook-air-13-m3': '13 英寸，M3，16 GB 内存，256 GB SSD',
    'model-thinkpad-t14-gen5':
      '14 英寸，Core Ultra 5 125U，16 GB 内存，512 GB SSD',
    'model-latitude-5440': '14 英寸，Core i5-1335U，16 GB 内存，512 GB SSD',
    'model-optiplex-7010': 'Core i5-13500，16 GB 内存，512 GB SSD',
    'model-u2723qe': '27 英寸 4K IPS，USB-C 90 W 供电',
    'model-poweredge-r760': '2U，双路 Xeon Silver 4410Y，256 GB 内存',
    'model-catalyst-9200-48p': '48 口 PoE+ 千兆接入交换机',
    'model-iphone-15': '128 GB，黑色',
    'model-laserjet-pro-m428': '黑白激光多功能一体机，双面打印',
    'model-mx-master-3s': '无线鼠标，石墨色',
    'model-mx-keys': '无线键盘，石墨色',
    'model-wd22tb4': '雷电 4 扩展坞，130 W 供电',
    'model-zone-vibe-100': '无线耳机，石墨色',
    'model-usb-c-cable-1m': 'USB-C 转 USB-C，100 W，1 米',
    'model-latitude-5440-battery': '54 Wh，3 芯替换电池',
  },
};

const localizedSpecification = (
  model: ModelSeed,
  locale: string,
): string | null =>
  SPECIFICATIONS[locale]?.[model.id] ?? model.specification ?? null;

const seed: SeedDefinition = defineSeed({
  name: '202609150001_seed_itam_manufacturers_models',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
    const now = new Date();
    // Seed id → the id to reference (an existing manufacturer of that name
    // keeps its own id).
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
    const assetsDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      'assets/models',
    );
    const storageDir = process.env.APP_STORAGE_DIR
      ? path.resolve(process.env.APP_STORAGE_DIR)
      : path.resolve(process.cwd(), 'storage');
    /** The file row for a picture, created with its bytes when absent. */
    const pictureFile = async (image: string): Promise<string> => {
      const id = PICTURE_FILE_IDS[image];
      if (!id) throw new Error(`No file id for seed picture ${image}`);
      const existing = await query
        .selectFrom('itamFiles')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) return id;
      const ext = path.extname(image).slice(1);
      const key = `objects/${id}.${ext}`;
      const bytes = readFileSync(path.join(assetsDir, image));
      const target = path.join(storageDir, key);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      // The file plugin writes datetimes as ISO strings without the zone.
      const stamp = now.toISOString().slice(0, -1);
      await query
        .insertInto('itamFiles')
        .values({
          id,
          disk: 'local',
          key,
          filename: image,
          ext,
          mimeType: ext === 'svg' ? 'image/svg+xml' : 'image/jpeg',
          size: bytes.byteLength,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .execute();
      return id;
    };
    for (const model of MODELS) {
      const existing = await query
        .selectFrom('models')
        .select(['id', 'imageFileId'])
        .where('id', '=', model.id)
        .executeTakeFirst<{ id: string; imageFileId: string | null }>();
      if (existing) {
        // A model seeded before pictures existed gets one now.
        if (existing.imageFileId === null)
          await query
            .updateTable('models')
            .set({
              imageFileId: await pictureFile(model.image),
              imageCredit: model.imageCredit ?? null,
            })
            .where('id', '=', model.id)
            .execute();
        continue;
      }
      const category = await query
        .selectFrom('categories')
        .select('id')
        .where('id', '=', model.categoryId)
        .executeTakeFirst();
      // A category tree edited before this seed ran may lack the category.
      if (!category) continue;
      await query
        .insertInto('models')
        .values({
          id: model.id,
          name: model.name,
          categoryId: model.categoryId,
          manufacturerId:
            manufacturerIds.get(model.manufacturerId) ?? model.manufacturerId,
          code: model.code ?? null,
          specification: localizedSpecification(model, locale),
          imageFileId: await pictureFile(model.image),
          imageCredit: model.imageCredit ?? null,
          warrantyMonths: model.warrantyMonths ?? null,
          releaseDate: null,
          eolDate: null,
          eosDate: null,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
