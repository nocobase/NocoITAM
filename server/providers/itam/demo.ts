import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService, OperationContext } from './devices.js';
import type { ObservedDevice } from './device-sources.js';
import type { DeviceSyncService } from './device-sync.js';
import { writeDemoSuggestions, type DemoAgents } from './demo-suggestions.js';
import type { AuditService, CountInput } from './audits.js';
import type { CommentService } from './comments.js';
import { unrestricted } from './authz-filter.js';
import { asText, decodeRow, type Row } from './collection-query.js';
import type { DisposalService } from './disposals.js';
import { BusinessRuleError } from './errors.js';
import type { EntitlementService } from './entitlements.js';
import type { NumberingService } from './numbering.js';
import type { MasterDataService } from './master-data.js';
import type {
  LineInput,
  LineItemType,
  ProcurementService,
} from './procurement.js';
import type { REPAIR_FAULT_CATEGORIES, RepairService } from './repairs.js';
import type { StockService } from './stock.js';
import { addDays, dbDateTime, isoDate } from './dates.js';

/**
 * Demo data for a first look: a fictional company ("Demo Co.") with the
 * main chain — purchase, receipt, assignment, fault, repair, audit,
 * disposal — and deliberate problem records (expired warranty, idle stock,
 * over-allocated entitlement, unused seats, a leaver still holding devices,
 * unaudited devices, one batch expiring together). Everything is written
 * through the services, every id is tracked in `demoRecords`, and dates are
 * offsets from the day it runs. No notification leaves the system.
 */
/** The languages the demo is written in: the same company, translated. */
export const DEMO_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type DemoLanguage = (typeof DEMO_LANGUAGES)[number];

/** A sign-in the demo creates, as the settings page lists it. */
export interface DemoAccountSummary {
  readonly username: string;
  readonly name: string;
  /** The permission set it is given, which names its role. */
  readonly role: string;
  readonly password: string;
}

export interface DemoSummary {
  readonly generated: boolean;
  readonly counts: Readonly<Record<string, number>>;
  /** Records the demo created, accounts included. */
  readonly records: number;
  /** When it was generated, or null when there is none. */
  readonly createdAt: string | null;
  /** The language it was generated in, read back from its people. */
  readonly language: DemoLanguage | null;
  /** The sign-ins of the demo present, or of each language before there is one. */
  readonly accounts: readonly DemoAccountSummary[];
  readonly accountsByLanguage: Readonly<
    Record<DemoLanguage, readonly DemoAccountSummary[]>
  >;
  /** An import under way in this process: how far it has got, 0 to 100. */
  readonly importing: { readonly percent: number } | null;
  /** Why the last import started in the background stopped, if it did. */
  readonly failure: { readonly code?: string; readonly message: string } | null;
}

/**
 * How far the import this process runs has got, 0 to 100, for the progress
 * bar the settings tab and the banner show while it runs (after NocoCRM's);
 * undefined while none runs here (2026-10-16).
 */
let importPercent: number | undefined;
/** Why the last import `start` began failed; cleared by the next one. */
let importFailure: DemoSummary['failure'] = null;

export interface DemoService {
  status(): Promise<DemoSummary>;
  /** Without a language, the demo follows the deployment's default locale. */
  generate(actorId: string, language?: DemoLanguage): Promise<DemoSummary>;
  /**
   * Starts `generate` without waiting for it (2026-10-16): the import takes
   * minutes on a slow disk, longer than a proxy in front of the application
   * holds a request open (Studio answered 502 and the page never learned how
   * it ended). Refuses as `generate` does; afterwards `status()` tells how
   * far it got, and `failure` why it stopped.
   */
  start(actorId: string, language?: DemoLanguage): Promise<DemoSummary>;
  clear(actorId: string): Promise<DemoSummary>;
}

/** One sign-in the demo creates, with the Permission Set it is given. */
export interface DemoAccountSpec {
  readonly username: string;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly permissionSet: string;
}

/**
 * Accounts belong to the authentication and users plugins, not to this
 * application, so the demo reaches them through this pair rather than the
 * `user` table. A harness assembled without those plugins passes nothing and
 * the demo runs without sign-ins.
 */
export interface DemoAccounts {
  create(spec: DemoAccountSpec): Promise<string>;
  remove(userId: string, actorId: string): Promise<void>;
  /**
   * Gives an existing account a Permission Set: the assignment's id, or
   * null when it held the set already (2026-10-16, the importing account).
   */
  grant(userId: string, permissionSet: string): Promise<string | null>;
  /** Takes back an assignment `grant` made. */
  revoke(assignmentId: string): Promise<void>;
  /** The account's own name and address, for the person record behind it. */
  describe(
    userId: string,
  ): Promise<{ readonly name: string; readonly email: string } | undefined>;
}

/**
 * The IT staff the demo signs in as: two asset managers and one IT support
 * engineer, each a person in IT with their own account (2026-10-05). They
 * are people with names, not role accounts — `manager` and `support` went —
 * so the trail of every request reads as a colleague. With the leaver, who
 * is IT support too, they are the only people with accounts; the rest are
 * employees, who do not sign in. The account that generated the demo is
 * the system administrator and no employee: it gets no person record and
 * answers for no record — the demo is written as 吴静 (`writerId`).
 * A password is the username and 123: this is demonstration data, and
 * clearing it removes the accounts.
 */
/** What each staff sign-in does in the demo, whatever it is called. */
type StaffKey = 'approver' | 'writer' | 'support';

/** A staff sign-in, with the person record behind it. */
interface StaffSpec extends DemoAccountSpec {
  readonly key: StaffKey;
  readonly position: string;
}

const staff = (
  key: StaffKey,
  username: string,
  name: string,
  mail: string,
  position: string,
): StaffSpec => ({
  key,
  username,
  name,
  email: `${mail}@northbridge.example`,
  password: `${username}123`,
  position,
  permissionSet: key === 'support' ? 'itam-it-support' : 'itam-asset-manager',
});

/**
 * The staff sign-ins by language (2026-10-06): the Chinese demo's IT people
 * have Chinese names and pinyin usernames, the English demo's English names
 * and usernames — not the same people romanised. In each, the first asset
 * manager decides the requests (`approver`), the second writes the demo
 * (`writer`) and IT support carries the repairs and the counts (`support`).
 */
export const DEMO_STAFF: Readonly<Record<DemoLanguage, readonly StaffSpec[]>> =
  {
    'zh-CN': [
      staff('approver', 'sunqiang', '孙强', 'sun.qiang', 'IT 资产经理'),
      staff('writer', 'wujing', '吴静', 'wu.jing', 'IT 资产经理'),
      staff('support', 'zhouyu', '周宇', 'zhou.yu', 'IT 支持工程师'),
    ],
    'en-US': [
      staff(
        'approver',
        'daniel',
        'Daniel Brooks',
        'daniel.brooks',
        'IT Asset Manager',
      ),
      staff(
        'writer',
        'emily',
        'Emily Carter',
        'emily.carter',
        'IT Asset Manager',
      ),
      staff(
        'support',
        'ryan',
        'Ryan Mitchell',
        'ryan.mitchell',
        'IT Support Engineer',
      ),
    ],
  };

/** The role accounts the demo created until 2026-10-05, removed by name. */
const RETIRED_DEMO_USERNAMES = ['manager', 'support'] as const;

/**
 * The sign-ins the demo creates in a language, as the settings page lists
 * them: the staff, then the leaver, who is IT support. Names follow the
 * language; usernames and passwords do not.
 */
export function demoAccountsIn(
  language: DemoLanguage,
): readonly DemoAccountSummary[] {
  const leaver = (PERSON_NAMES[language] ?? PERSON_NAMES['en-US'] ?? [])[
    LEAVER_INDEX
  ];
  return [
    ...(DEMO_STAFF[language] ?? DEMO_STAFF['en-US']).map((spec) => ({
      username: spec.username,
      name: spec.name,
      role: spec.permissionSet,
      password: spec.password,
    })),
    ...(leaver?.username
      ? [
          {
            username: leaver.username,
            name: leaver.name,
            // IT support who leaves on import, which disables the sign-in:
            // listed so the account behind their records is not a mystery.
            role: 'leaver',
            password: `${leaver.username}123`,
          },
        ]
      : []),
  ];
}

/**
 * Every username the demo owns. `pnpm data:reset` wipes `demoRecords` with
 * the rest of the ITAM tables, which is where the demo tracks its accounts,
 * so the command removes them by name instead.
 */
export function demoAccountUsernames(): readonly string[] {
  return [
    ...new Set([
      ...DEMO_LANGUAGES.flatMap((language) =>
        demoAccountsIn(language).map((account) => account.username),
      ),
      // A database generated before 2026-10-05 still holds these, and one
      // generated before 2026-10-06 the pinyin usernames of the English
      // demo.
      ...RETIRED_DEMO_USERNAMES,
      'sunqiang',
      'wujing',
      'zhouyu',
      'chenjie',
    ]),
  ];
}

export const demoServiceToken: ServiceToken<DemoService> =
  createServiceToken<DemoService>('itam/demo-service');

const DAY = 86_400_000;
const daysFromNow = (days: number): string =>
  isoDate(new Date(Date.now() + days * DAY));

/** Tables whose rows hang off a demo record, deleted with it. */
const DEPENDENTS: readonly { table: string; column: string }[] = [
  { table: 'historyEvents', column: 'subjectId' },
  { table: 'changeLogs', column: 'subjectId' },
  { table: 'allocations', column: 'subjectId' },
  { table: 'attachmentLinks', column: 'ownerId' },
  { table: 'reminders', column: 'subjectId' },
  { table: 'stockHoldings', column: 'stockItemId' },
  { table: 'stockMovements', column: 'stockItemId' },
  { table: 'entitlementSeats', column: 'entitlementId' },
  { table: 'purchaseOrderLines', column: 'purchaseOrderId' },
  { table: 'purchaseReceipts', column: 'purchaseOrderId' },
  { table: 'approvals', column: 'subjectId' },
  { table: 'auditItems', column: 'auditTaskId' },
  { table: 'disposalDevices', column: 'disposalId' },
  { table: 'repairs', column: 'deviceId' },
  // Asset Steward's background suggestions for the demo's joiners.
  { table: 'onboardingRuns', column: 'personId' },
  // The agents' runs on the demo's records (2026-10-16): the approval
  // assistant's suggestions outlived their requests and showed in 收件箱
  // under a bare id once the demo was cleared.
  { table: 'itamAgentRuns', column: 'subjectId' },
  // 忽略 on the demo's differences (device sync, 2026-10-15).
  { table: 'deviceSyncDismissals', column: 'deviceId' },
  // 不需要纳管 on the demo's test phone (2026-10-15).
  { table: 'deviceSyncExemptions', column: 'deviceId' },
  // The lifecycle log of the demo's disposals (2026-10-18): the moves they
  // made, and the notifications those owed.
  { table: 'lifecycleEffectRuns', column: 'recordId' },
  { table: 'lifecycleTransitions', column: 'recordId' },
];

/** Deleted in dependency order: children before the master data they reference. */
const ORDER: readonly string[] = [
  // The work agents' suggestions the demo wrote (2026-10-16): the plans,
  // then the runs that proposed them.
  'itamPlans',
  'itamAgentRuns',
  // Comments the demo wrote on records it did not make (seeded categories).
  'historyEvents',
  // What the demo's Intune reported (device sync, 2026-10-14).
  'managedDevices',
  'deviceSyncRuns',
  'disposals',
  'auditTasks',
  'repairs',
  'purchaseOrders',
  'entitlements',
  'stockItems',
  'devices',
  'people',
  'onboardingKits',
  'softwareProducts',
  'models',
  'departments',
  'locations',
  'categories',
  'vendors',
  'manufacturers',
];

/** Demo vendor names by locale. */
const VENDOR_NAMES: Readonly<
  Record<
    string,
    Record<
      'reseller' | 'repair' | 'recycler',
      { name: string; contact: string }
    >
  >
> = {
  'en-US': {
    reseller: { name: 'Northbridge IT Supply', contact: 'Peter Grant' },
    repair: { name: 'Northbridge Repair Center', contact: 'Helen Ward' },
    recycler: { name: 'GreenLoop Recycling', contact: 'Sam Fischer' },
  },
  'zh-CN': {
    reseller: { name: '北桥 IT 供应有限公司', contact: '孙强' },
    repair: { name: '北桥维修中心', contact: '周磊' },
    recycler: { name: '绿环回收', contact: '徐萍' },
  },
};

/** Free text of the demo's records, in the deployment's language. */
/**
 * The pictures the model seed stores for every database (2026-10-20), by
 * the seed's own file ids (`PICTURE_FILE_IDS` in
 * `database/main/seeds/202609150001_seed_itam_manufacturers_models.ts`), so
 * the demo's models have a picture without writing a file of their own.
 * Shared, never the demo's: clearing the demo leaves them.
 */
const DEMO_PICTURES = {
  'laptop.svg': '352aed01-d257-59b2-85d0-8dcebb263cb8',
  'desktop.svg': '53a59a2b-781b-5db5-9a72-9fa080d06477',
  'monitor.svg': 'ea3a6843-b16b-5692-9a48-a0b18fb9bf60',
  'network.svg': 'd7c3ae10-353d-5d96-9bff-17a44e3ef7c0',
  'phone.svg': 'cabcdf09-99f2-549c-90d6-5a2a496fb04b',
  'printer.svg': '70a07617-1091-5f64-b624-a09abbf57924',
  'mouse.svg': '45ed46d1-1ecc-5352-ad43-d9f875748618',
  'keyboard.svg': 'a4dbb661-6448-5e31-a178-ad054510fd32',
  'dock.svg': '27995f2d-8017-54e8-ad11-7ca00a6fcefe',
  'disk.svg': '1b61195f-bb60-5bfe-a804-20226cfe92aa',
  'memory.svg': 'fea00f16-4f83-5af6-b8d6-c69ddf120823',
  'battery.svg': 'dfb62c27-051e-5729-988f-645e9ebb3b19',
  'webcam.svg': '575d22ad-fa25-57a2-8417-dd3397dc8200',
  'paper.svg': '5e30baa7-65e8-5850-8a28-f7d233d83fc0',
  'iphone-15-pro.jpg': 'df65e991-bad7-51b0-9e33-cbbe61b22007',
  'studio-display.jpg': '26d984e7-df22-5709-b983-df16ef578703',
  'galaxy-s24.jpg': '95d3bc1d-4930-5149-8439-f95c28e476ae',
  'macbook-pro-16.jpg': '17b0d68e-1962-5301-8777-eae37b9ddb5e',
  'mac-mini.jpg': '7e6dcb73-62ab-52ef-832b-42eb0bc419c4',
  'duracell-aa.jpg': '9cb9d9fb-5dea-5725-9fc7-3846c23c549b',
  '990-pro.jpg': '558e9198-a718-560f-9545-9eac73a2c025',
} as const;
/** The credit a photo's license asks for, shown under it (`CREDITS.md`). */
const DEMO_PICTURE_CREDITS: Partial<Record<DemoPicture, string>> = {
  'iphone-15-pro.jpg': 'IPHONE 15, CC BY-SA 4.0, Wikimedia Commons',
  'studio-display.jpg': 'Seasider53, CC BY 4.0, Wikimedia Commons',
  'galaxy-s24.jpg': 'メイド理世, CC BY-SA 4.0, Wikimedia Commons',
  // A neighbouring generation of the same exterior (2026-10-21): the 2021
  // MacBook Pro 16 and M1 Mac mini, a 4 TB 990 PRO, Duracell's AA.
  'macbook-pro-16.jpg': 'Premeditated, CC BY-SA 4.0, Wikimedia Commons',
  'mac-mini.jpg': 'Gerd Fahrenhorst, CC BY 4.0, Wikimedia Commons',
  'duracell-aa.jpg': 'Mygoodsweaties, public domain, Wikimedia Commons',
  '990-pro.jpg': 'Dinkun Chen, CC BY-SA 4.0, Wikimedia Commons',
};
type DemoPicture = keyof typeof DEMO_PICTURES;

/**
 * Models the company has bought or looked at besides the ones its devices
 * and stock use (2026-10-20), so 型号 reads as a real catalogue: the newer
 * laptops IT now orders, a desktop and monitors for the design team, the
 * phones and printer on the next refresh, an access point and the small
 * kit people ask for. Entered through the master-data service on the day
 * each came in, tracked, and cleared with the demo. Since 2026-10-21 each
 * has assets behind it (`CATALOGUE_ASSETS`), so no model in the catalogue
 * stands empty. Seed ids, which the demo checks are there.
 */
const CATALOGUE_MODELS: readonly {
  readonly name: string;
  readonly categoryId: string;
  readonly manufacturerId: string;
  /** The manufacturer's part number. */
  readonly code: string;
  /** A picture from the model seed's library. */
  readonly image: DemoPicture;
  readonly warrantyMonths: number;
  readonly day: number;
  readonly spec: Readonly<Record<DemoLanguage, string>>;
}[] = [
  {
    name: 'MacBook Pro 16 M3 Pro',
    code: 'MRW13CH/A',
    image: 'macbook-pro-16.jpg',
    categoryId: 'cat-laptop',
    manufacturerId: 'mfr-apple',
    warrantyMonths: 36,
    day: -330,
    spec: {
      'zh-CN':
        '16.2 英寸 Liquid Retina XDR，M3 Pro，18 GB 内存，512 GB 固态硬盘',
      'en-US': '16.2-inch Liquid Retina XDR, M3 Pro, 18 GB memory, 512 GB SSD',
    },
  },
  {
    name: 'ThinkPad X1 Carbon Gen 12',
    code: '21KC00A7US',
    image: 'laptop.svg',
    categoryId: 'cat-laptop',
    manufacturerId: 'mfr-lenovo',
    warrantyMonths: 36,
    day: -260,
    spec: {
      'zh-CN':
        '14 英寸 2.8K OLED，Core Ultra 7 155U，32 GB 内存，512 GB 固态硬盘',
      'en-US': '14-inch 2.8K OLED, Core Ultra 7 155U, 32 GB memory, 512 GB SSD',
    },
  },
  {
    name: 'EliteBook 840 G11',
    code: 'A6SY7UT#ABA',
    image: 'laptop.svg',
    categoryId: 'cat-laptop',
    manufacturerId: 'mfr-hp',
    warrantyMonths: 36,
    day: -240,
    spec: {
      'zh-CN': '14 英寸 WUXGA，Core Ultra 5 125U，16 GB 内存，512 GB 固态硬盘',
      'en-US': '14-inch WUXGA, Core Ultra 5 125U, 16 GB memory, 512 GB SSD',
    },
  },
  {
    name: 'Surface Laptop 6',
    code: 'ZJQ-00001',
    image: 'laptop.svg',
    categoryId: 'cat-laptop',
    manufacturerId: 'mfr-microsoft',
    warrantyMonths: 12,
    day: -200,
    spec: {
      'zh-CN':
        '13.5 英寸 PixelSense 触屏，Core Ultra 5 135H，16 GB 内存，256 GB 固态硬盘',
      'en-US':
        '13.5-inch PixelSense touchscreen, Core Ultra 5 135H, 16 GB memory, 256 GB SSD',
    },
  },
  {
    name: 'Mac mini M2',
    code: 'MMFK3CH/A',
    image: 'mac-mini.jpg',
    categoryId: 'cat-desktop',
    manufacturerId: 'mfr-apple',
    warrantyMonths: 12,
    day: -420,
    spec: {
      'zh-CN': 'M2，8 GB 内存，512 GB 固态硬盘',
      'en-US': 'M2, 8 GB memory, 512 GB SSD',
    },
  },
  {
    name: 'ThinkCentre M90q Gen 4',
    code: '12EH000CGE',
    image: 'desktop.svg',
    categoryId: 'cat-desktop',
    manufacturerId: 'mfr-lenovo',
    warrantyMonths: 36,
    day: -310,
    spec: {
      'zh-CN': '迷你主机，Core i7-13700T，16 GB 内存，512 GB 固态硬盘',
      'en-US': 'Tiny desktop, Core i7-13700T, 16 GB memory, 512 GB SSD',
    },
  },
  {
    name: 'P2723DE',
    code: '210-BDEH',
    image: 'monitor.svg',
    categoryId: 'cat-monitor',
    manufacturerId: 'mfr-dell',
    warrantyMonths: 36,
    day: -380,
    spec: {
      'zh-CN': '27 英寸 QHD IPS，USB-C 扩展，90 W 供电',
      'en-US': '27-inch QHD IPS, USB-C hub with 90 W charging',
    },
  },
  {
    name: 'Studio Display',
    code: 'MK0U3CH/A',
    image: 'studio-display.jpg',
    categoryId: 'cat-monitor',
    manufacturerId: 'mfr-apple',
    warrantyMonths: 12,
    day: -415,
    spec: {
      'zh-CN': '27 英寸 5K 视网膜，1200 万像素摄像头，三麦克风阵列',
      'en-US': '27-inch 5K Retina, 12 MP camera, three-microphone array',
    },
  },
  {
    name: 'iPhone 15 Pro',
    code: 'MTQA3LL/A',
    image: 'iphone-15-pro.jpg',
    categoryId: 'cat-phone',
    manufacturerId: 'mfr-apple',
    warrantyMonths: 12,
    day: -150,
    spec: {
      'zh-CN': '6.1 英寸，A17 Pro，256 GB',
      'en-US': '6.1-inch, A17 Pro, 256 GB',
    },
  },
  {
    name: 'Galaxy S24',
    code: 'SM-S9210',
    image: 'galaxy-s24.jpg',
    categoryId: 'cat-phone',
    manufacturerId: 'mfr-samsung',
    warrantyMonths: 12,
    day: -140,
    spec: {
      'zh-CN': '6.2 英寸，8 GB 内存，256 GB',
      'en-US': '6.2-inch, 8 GB memory, 256 GB',
    },
  },
  {
    name: 'Color LaserJet Pro MFP M479fdw',
    code: 'W1A80A',
    image: 'printer.svg',
    categoryId: 'cat-printer',
    manufacturerId: 'mfr-hp',
    warrantyMonths: 12,
    day: -180,
    spec: {
      'zh-CN': '彩色激光多功能一体机，打印、扫描、复印、传真，自动双面，Wi-Fi',
      'en-US':
        'Colour laser multifunction: print, scan, copy and fax, duplex, Wi-Fi',
    },
  },
  {
    name: 'Catalyst 9120AXI',
    code: 'C9120AXI-H',
    image: 'network.svg',
    categoryId: 'cat-network',
    manufacturerId: 'mfr-cisco',
    warrantyMonths: 60,
    day: -450,
    spec: {
      'zh-CN': 'Wi-Fi 6 无线接入点，4x4 MU-MIMO，内置天线',
      'en-US': 'Wi-Fi 6 access point, 4x4 MU-MIMO, internal antennas',
    },
  },
  {
    name: 'MX Anywhere 3S',
    code: '910-006958',
    image: 'mouse.svg',
    categoryId: 'cat-mouse',
    manufacturerId: 'mfr-logitech',
    warrantyMonths: 12,
    day: -120,
    spec: {
      'zh-CN': '便携无线鼠标，8000 DPI，静音按键，蓝牙',
      'en-US': 'Compact wireless mouse, 8,000 DPI, quiet clicks, Bluetooth',
    },
  },
  {
    name: 'MX Keys Mini',
    code: '920-010505',
    image: 'keyboard.svg',
    categoryId: 'cat-keyboard',
    manufacturerId: 'mfr-logitech',
    warrantyMonths: 12,
    day: -120,
    spec: {
      'zh-CN': '紧凑型背光无线键盘，蓝牙，USB-C 充电',
      'en-US': 'Compact backlit wireless keyboard, Bluetooth, USB-C charging',
    },
  },
  {
    name: 'ThinkPad Thunderbolt 4 Dock',
    code: '40B00135CN',
    image: 'dock.svg',
    categoryId: 'cat-dock',
    manufacturerId: 'mfr-lenovo',
    warrantyMonths: 36,
    day: -255,
    spec: {
      'zh-CN': '雷电 4，双 4K 显示，100 W 供电，2.5G 网口',
      'en-US': 'Thunderbolt 4, two 4K displays, 100 W charging, 2.5 GbE',
    },
  },
  {
    name: '870 EVO 1 TB',
    code: 'MZ-77E1T0BW',
    image: 'disk.svg',
    categoryId: 'cat-disk',
    manufacturerId: 'mfr-samsung',
    warrantyMonths: 60,
    day: -90,
    spec: {
      'zh-CN': '2.5 英寸 SATA 固态硬盘，读取最高 560 MB/s',
      'en-US': '2.5-inch SATA SSD, reads up to 560 MB/s',
    },
  },
];

/**
 * What the catalogue's models have on the books (2026-10-21), bought a few
 * weeks after each was entered: devices — spares and evaluation units in
 * the warehouse, shared machines placed at a location — and for an
 * accessory or a component, a stock item.
 */
const CATALOGUE_ASSETS: Readonly<
  Record<
    string,
    | {
        readonly devices: readonly {
          readonly name: string;
          readonly serialNo: string;
          /** Placed here (shared equipment); else a spare in the warehouse. */
          readonly at?: 'floor3' | 'serverRoom' | 'japan';
          readonly attributes?: Readonly<Record<string, unknown>>;
        }[];
        readonly price: number;
      }
    | {
        readonly stock: {
          readonly name: string;
          readonly kind: 'accessory' | 'component';
          readonly quantity: number;
          readonly minimum: number;
        };
      }
  >
> = {
  'MacBook Pro 16 M3 Pro': {
    price: 23999,
    devices: [
      {
        name: 'SG-LT-201',
        serialNo: 'FVFZM3P16A01',
        attributes: { os: 'macOS 15.6', hostname: 'SG-LT-201' },
      },
    ],
  },
  'ThinkPad X1 Carbon Gen 12': {
    price: 14999,
    devices: [
      {
        name: 'SG-LT-202',
        serialNo: 'PF5X1C12A0',
        attributes: { os: 'Windows 11 24H2', hostname: 'SG-LT-202' },
      },
    ],
  },
  'EliteBook 840 G11': {
    price: 9999,
    devices: [
      {
        name: 'SG-LT-203',
        serialNo: '5CG4280E11',
        attributes: { os: 'Windows 11 24H2', hostname: 'SG-LT-203' },
      },
    ],
  },
  'Surface Laptop 6': {
    price: 10888,
    devices: [
      {
        name: 'SG-LT-204',
        serialNo: '0F33A2R24093',
        attributes: { os: 'Windows 11 24H2', hostname: 'SG-LT-204' },
      },
    ],
  },
  'Mac mini M2': {
    price: 5999,
    devices: [
      {
        name: 'SG-DT-201',
        serialNo: 'H9VM2MINI01',
        at: 'floor3',
        attributes: { os: 'macOS 15.6', hostname: 'SG-DT-201' },
      },
    ],
  },
  'ThinkCentre M90q Gen 4': {
    price: 7299,
    devices: [
      {
        name: 'SG-DT-202',
        serialNo: 'MJ0K90Q4A1',
        at: 'floor3',
        attributes: { os: 'Windows 11 24H2', hostname: 'SG-DT-202' },
      },
    ],
  },
  P2723DE: {
    price: 2299,
    devices: [
      { name: 'SG-MON-201', serialNo: 'CN0P2723DE01', at: 'floor3' },
      { name: 'SG-MON-202', serialNo: 'CN0P2723DE02' },
    ],
  },
  'Studio Display': {
    price: 11499,
    devices: [{ name: 'SG-MON-203', serialNo: 'C02STDISP01' }],
  },
  'iPhone 15 Pro': {
    price: 8999,
    devices: [{ name: 'SG-PH-201', serialNo: 'F4QIP15PRO01' }],
  },
  'Galaxy S24': {
    price: 5999,
    devices: [{ name: 'SG-PH-202', serialNo: 'R5CXS24A001' }],
  },
  'Color LaserJet Pro MFP M479fdw': {
    price: 6499,
    devices: [
      {
        name: 'SG-PRN-JP-01',
        serialNo: 'VNB3M479A1',
        at: 'japan',
        attributes: { ipAddress: '10.20.0.50' },
      },
    ],
  },
  'Catalyst 9120AXI': {
    price: 7800,
    devices: [
      {
        name: 'SG-AP-3F-01',
        serialNo: 'FJC2501AP01',
        at: 'floor3',
        attributes: { managementIp: '10.0.3.11' },
      },
      {
        name: 'SG-AP-3F-02',
        serialNo: 'FJC2501AP02',
        at: 'floor3',
        attributes: { managementIp: '10.0.3.12' },
      },
    ],
  },
  'ThinkPad Thunderbolt 4 Dock': {
    stock: {
      name: 'ThinkPad Thunderbolt 4 Dock',
      kind: 'accessory',
      quantity: 4,
      minimum: 1,
    },
  },
  'MX Keys Mini': {
    stock: {
      name: 'Logitech MX Keys Mini',
      kind: 'accessory',
      quantity: 6,
      minimum: 2,
    },
  },
  'MX Anywhere 3S': {
    stock: {
      name: 'Logitech MX Anywhere 3S',
      kind: 'accessory',
      quantity: 6,
      minimum: 2,
    },
  },
  '870 EVO 1 TB': {
    stock: {
      name: 'Samsung 870 EVO 1 TB',
      kind: 'component',
      quantity: 3,
      minimum: 1,
    },
  },
};

const TEXTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'en-US': {
    onboardingBatch: 'Onboarding batch',
    approval: 'Approved, go ahead and order',
    officeLicense: 'Office LTSC 2024',
    ideLicense: 'IntelliJ IDEA Ultimate',
    replacementOrder: 'Laptop refresh for R&D',
    monitorOrder: 'Monitors for the sales floor',
    dockOrder: 'Docking station stock',
    keyboardOrder: 'Keyboards for the new desks',
    officeOrder: 'Office LTSC device licenses',
    ideOrder: 'IntelliJ IDEA seats for R&D',
    tonerOrder: 'Toner for the third-floor printer',
    repairKeyboard: 'Several keys do not respond',
    repairPanel: 'Panel shows a vertical line',
    repairScreen: 'Cracked screen; replace the panel',
    commentMonitorAsk:
      '@{importer} Three new starters join sales next Monday. Could the monitors be approved this week?',
    commentMonitorBudget:
      "Sales still has budget left this quarter, it's fine to approve.",
    commentAuditProgress:
      'East side of floor 3 is done; the west desks continue Thursday afternoon. @{importer} could you confirm where the two meeting-room devices are?',
    commentAuditReply: "Sure, I'll check them before Wednesday.",
    commentPrinter:
      'The vendor has fixed the paper jam three times and says the board is ageing — not worth another repair.',
    commentSwollen:
      'Battery is swollen. Unplugged and locked in the warehouse cabinet — do not lend it out.',
    commentSwollenReply: 'Noted, I have raised a disposal for it.',
    commentExpired:
      'Out of warranty, so this repair is charged to the IT budget.',
    commentLeaver:
      '@{importer} {leaver} leaves next Friday and still has devices and a draft disposal in their name. Please plan the handover.',
    commentLaptopCycle:
      'Laptops are replaced every four years; the 2023 MacBook Pro batch comes due together next year, so budget for it in Q1.',
    commentMonitorRule:
      'From now on monitors of 27 inches and up are bought with USB-C, so one cable to the dock does it.',
    commentPhoneRule:
      'Company phones go to sales and management only; everyone else claims a monthly allowance.',
    commentWebcamCategory:
      'Webcams are lent from the meeting rooms first; only people who present every day get one of their own.',
    commentWebcamCategoryReply: 'Agreed — I set the count cycle to a year.',
    repairFan: 'Fan grinds under load; clean it and replace if worn',
    repairNotes: 'Replaced under warranty',
    repairFault: 'Battery swollen; replace battery',
    defaultKit: '{name} standard kit',
    spareKeyboard: 'Keyboard drops keys now and then; repaired twice',
    spareDeadPixel: 'One dead pixel in the lower right corner',
    auditName: 'Q3 count · 3F',
    auditNotes: 'Quarterly count',
    leaverAuditName: 'Q3 count · warehouse',
    leaverAuditNotes: 'Warehouse stock, run by IT support',
    disposalDescription: 'Cracked panel',
    disposalEndOfLife: 'Past its replacement date; sold to the recycler',
    disposalPrinter: 'Out of warranty and jamming; scrap it',
    leaverDisposal: 'Battery swollen and out of warranty; scrap it',
    disposalApproval: 'Approved: end of life',
    memoryOrder: 'Memory upgrade kits for R&D',
    headsetOrder: 'Headsets for the sales floor',
    internOrder: 'Laptops for the winter interns',
    internRejection: 'Not in this quarter’s budget; raise it again in Q1',
    extraDockOrder: 'Second batch of docking stations',
    extraDockCancel: 'Covered by the stock already on hand',
    syncMeetingRoom:
      'Meeting room computer run by Administration; not on the IT register',
    syncContractor: 'Li Gong (contractor)',
    syncTestPhone: 'Test phone, wiped for every release; not enrolled in MDM',
    historicalOrder: 'Bought before the register; entered with it',
    itSpareOrder: 'Spare laptops for IT',
    salesPhoneOrder: 'Phones for the new sales hires',
    airOrder: 'MacBook Air for the R&D hires',
    switchOrder: 'Second core switch for the server room',
    printerReplaceOrder: 'Replacement printer for the third floor',
    mouseOrder: 'Mouse stock',
    ssdOrder: 'Spare SSDs',
    desktopOrder: 'Three new sales desks, everything they need',
    serverOrder: 'Two more file servers',
    serverRejection: 'Size the virtual capacity first, then ask again',
    headsetRestockOrder: 'Headset stock',
    headsetCancel: 'The vendor is out of stock; buy next quarter',
    q4AuditName: 'Q4 count · 3F',
    q4AuditNotes: 'Quarterly count',
    japanAuditName: 'Annual count · Japan office',
    japanAuditNotes: 'Counted on the next visit',
    diffAuditName: 'Q3 count · desktops and phones',
    serverRoomAuditName: 'Q2 count · server room',
    monitorAuditName: 'Q2 count · monitors',
    spotAuditName: 'Spot check · warehouse',
    spotAuditCancel: 'Covered by the Q3 warehouse count',
    webcamCategory: 'Webcam',
    hubItem: 'Dell DA310 USB-C hub',
    hubSpec: 'USB-C to HDMI, DisplayPort, USB-A, USB-C and Ethernet',
    webcamItem: 'Logitech Brio 4K webcam',
    webcamSpec: '4K webcam with HDR and a privacy shutter',
    paperItem: 'A4 copy paper, 80 g',
    paperSpec: 'A4, 80 g/m², 500 sheets a ream',
    batteryItem: 'AA alkaline batteries',
    batterySpec: 'AA alkaline, 1.5 V',
    ssdSpec: 'NVMe M.2 SSD, PCIe 4.0, 2 TB',
    ramSpec: '16 GB DDR5-5600 SO-DIMM, CL46',
    m365License: 'Microsoft 365 Business Standard',
    adobeLicense: 'Adobe Creative Cloud for teams',
    chatgptLicense: 'ChatGPT Team',
    windowsLicense: 'Windows 11 Pro upgrades',
    zoomYearlyLicense: 'Zoom Workplace Pro (annual)',
    figmaTrialLicense: 'Figma Professional (trial)',
    m365Growth: 'Four more seats for this year’s new hires',
    tonerTopUp: 'Bought locally while the order was on its way',
    paperDelivery: 'Quarterly paper delivery',
    miceDamaged: 'Scroll wheel broken; not worth repairing',
    returnedGood: 'Good condition; wiped and back on the shelf',
    returnedLoan: 'Back from the customer visit, all accessories present',
    itManagerKit: 'IT asset manager kit',
    salesManagerKit: 'Sales manager kit',
    resellerContact: 'Laura Chen',
    repairShopNotes:
      'Collects on Tuesdays and Fridays; quotes first for anything out of warranty',
    recyclerNotes: 'Issues a data destruction certificate with every batch',
    webcamSpecUpdated:
      '4K webcam with HDR, a privacy shutter and a 2 m USB-C cable',
    commentResellerContact:
      '{contact} has moved to their enterprise team. {newContact} looks after our account from now on; orders still go to the same address.',
    commentResellerReply:
      'Good to know, thanks. I will change the contact here.',
    commentRecycler:
      'The data destruction certificate for the laptop we sold them came in; it is filed with the disposal.',
    commentHubEnd:
      'Dell stops selling this hub next quarter. If we want spares, order them before then.',
    commentWebcam:
      'In the meeting room set it to 1080p: the room computer crops a 4K picture.',
  },
  'zh-CN': {
    onboardingBatch: '新员工入职配备',
    approval: '同意，按计划采购',
    officeLicense: 'Office LTSC 2024',
    ideLicense: 'IntelliJ IDEA Ultimate',
    replacementOrder: '研发部笔记本换新',
    monitorOrder: '销售部显示器扩容',
    dockOrder: '扩展坞补货',
    keyboardOrder: '新工位键盘',
    officeOrder: 'Office LTSC 设备授权',
    ideOrder: '研发部 IntelliJ IDEA 席位',
    tonerOrder: '3 楼打印机硒鼓',
    repairKeyboard: '键盘部分按键失灵',
    repairPanel: '面板出现竖线',
    repairScreen: '屏幕碎裂，更换面板',
    commentMonitorAsk:
      '@{importer} 销售部下周一有三位新人到岗，显示器能否这周批下来？',
    commentMonitorBudget: '销售部这个季度的预算还有余量，可以批。',
    commentAuditProgress:
      '3 楼东区已盘完，西区工位周四下午继续。@{importer} 会议室那两台设备麻烦帮忙确认一下位置。',
    commentAuditReply: '好的，周三前确认。',
    commentPrinter: '厂家已经修过三次卡纸，说主板老化，不建议再修。',
    commentSwollen: '电池鼓包，已断电放进仓库隔离柜，不要再借出。',
    commentSwollenReply: '收到，已经提了报废单。',
    commentExpired: '已过保，这次维修费用走 IT 部门预算。',
    commentLeaver:
      '@{importer} {leaver} 下周五最后一天，名下还有设备和一张报废草稿，记得安排交接。',
    commentLaptopCycle:
      '笔记本按 4 年更换，2023 年那批 MacBook Pro 明年会集中到期，一季度预算要留出来。',
    commentMonitorRule:
      '以后 27 寸及以上的显示器统一买带 USB-C 的，一根线接扩展坞。',
    commentPhoneRule: '公司手机只配给销售和管理层，其他岗位按月报销话费。',
    commentWebcamCategory:
      '摄像头先从会议室借，只有每天要做演示的同事才单独配。',
    commentWebcamCategoryReply: '同意，盘点周期我改成一年了。',
    repairFan: '高负载时风扇异响，清灰，磨损则更换',
    repairNotes: '保内更换',
    defaultKit: '{name}标准配置',
    spareKeyboard: '键盘偶发失灵，已两次返修',
    spareDeadPixel: '屏幕右下角有一个坏点',
    repairFault: '电池鼓包，需更换电池',
    auditName: '三季度盘点 · 3 楼',
    auditNotes: '季度例行盘点',
    leaverAuditName: '三季度盘点 · 仓库',
    leaverAuditNotes: '仓库库存，由 IT 支持执行',
    disposalDescription: '屏幕碎裂',
    disposalEndOfLife: '已过更换周期，出售给回收商',
    disposalPrinter: '已过保且频繁卡纸，申请销毁',
    leaverDisposal: '电池鼓包且已过保，申请报废',
    disposalApproval: '同意报废：已到使用年限',
    memoryOrder: '研发部内存条补货',
    headsetOrder: '销售部耳机采购',
    internOrder: '实习生笔记本采购',
    internRejection: '本季度预算已用完，下季度再提',
    extraDockOrder: '扩展坞第二批',
    extraDockCancel: '现有库存已够用，无需再采购',
    syncMeetingRoom: '会议室公用电脑，由行政部管理，不入 IT 资产台账',
    syncContractor: '李工（外包）',
    syncTestPhone: '研发测试机，每次发版都要刷机，不注册 MDM',
    historicalOrder: '上线前的采购，随台账一起录入',
    itSpareOrder: 'IT 备用笔记本',
    salesPhoneOrder: '销售新员工手机',
    airOrder: '研发新员工 MacBook Air',
    switchOrder: '机房第二台核心交换机',
    printerReplaceOrder: '3 楼打印机更换',
    mouseOrder: '鼠标补货',
    ssdOrder: '固态硬盘备件',
    desktopOrder: '销售部新增三个工位，整套配齐',
    serverOrder: '新增两台文件服务器',
    serverRejection: '先评估虚拟化资源，再决定是否采购',
    headsetRestockOrder: '耳机补货',
    headsetCancel: '供应商缺货，改到下季度采购',
    q4AuditName: '四季度盘点 · 3 楼',
    q4AuditNotes: '季度例行盘点',
    japanAuditName: '年度盘点 · 日本办公室',
    japanAuditNotes: '下次出差时清点',
    diffAuditName: '三季度盘点 · 台式机与手机',
    serverRoomAuditName: '二季度盘点 · 机房',
    monitorAuditName: '二季度盘点 · 显示器',
    spotAuditName: '临时抽盘 · 仓库',
    spotAuditCancel: '已并入三季度仓库盘点',
    webcamCategory: '摄像头',
    hubItem: 'Dell DA310 USB-C 扩展器',
    hubSpec: 'USB-C 转 HDMI、DisplayPort、USB-A、USB-C 和网口',
    webcamItem: 'Logitech Brio 4K 摄像头',
    webcamSpec: '4K 摄像头，支持 HDR，带隐私挡板',
    paperItem: 'A4 复印纸 80g',
    paperSpec: 'A4，80 克，每包 500 张',
    batteryItem: 'AA 碱性电池',
    batterySpec: 'AA 碱性电池，1.5 V',
    ssdSpec: 'NVMe M.2 固态硬盘，PCIe 4.0，2 TB',
    ramSpec: '16 GB DDR5-5600 笔记本内存，CL46',
    m365License: 'Microsoft 365 商业标准版',
    adobeLicense: 'Adobe Creative Cloud 团队版',
    chatgptLicense: 'ChatGPT Team',
    windowsLicense: 'Windows 11 专业版升级授权',
    zoomYearlyLicense: 'Zoom Workplace Pro（年付）',
    figmaTrialLicense: 'Figma Professional（试用）',
    m365Growth: '为今年的新员工增加 4 个席位',
    tonerTopUp: '订单未到，先在本地采购应急',
    paperDelivery: '每季度纸张配送',
    miceDamaged: '滚轮损坏，不值得维修',
    returnedGood: '完好，已清除数据并放回库存',
    returnedLoan: '客户拜访归来，配件齐全',
    itManagerKit: 'IT 资产经理配置',
    salesManagerKit: '销售经理配置',
    resellerContact: '梁晓',
    repairShopNotes: '每周二、周五上门取件；保外维修先报价',
    recyclerNotes: '每批回收都出具数据销毁证明',
    webcamSpecUpdated: '4K 摄像头，支持 HDR，带隐私挡板，附 2 米 USB-C 线',
    commentResellerContact:
      '{contact} 调去了他们的大客户部，以后由{newContact}对接我们，下单地址不变。',
    commentResellerReply: '好的，我把这边的联系人改一下。',
    commentRecycler:
      '卖给他们的那台笔记本，数据销毁证明已经收到，归档在报废单里。',
    commentHubEnd: 'Dell 下个季度停售这款扩展器，需要备件的话在那之前下单。',
    commentWebcam: '会议室里请设成 1080p：会议室电脑接 4K 会裁切画面。',
  },
};

/**
 * The person who leaves in the demo, on the day it is imported (2026-10-05:
 * until then the demo only set them up and left 标记离职 to be done by hand,
 * so the 离职交接 to-do was empty until somebody thought to).
 *
 * They are IT, and so they sign in: leaving is only half a
 * story while the register has nothing of theirs to hand over. A salesperson
 * answers for none of its records, so the one who leaves is the IT support
 * engineer — their devices, their repairs and the orders they raised all
 * need somebody else's name on them, which is the part of offboarding no
 * return button settles. Leaving disables their sign-in, as it does for
 * anybody (`leaver-accounts.ts`).
 */
const LEAVER_INDEX = 3;

/**
 * Demo people by locale: display name, mailbox and position; the leaver has
 * a username too, being IT and signing in. The English demo's people have
 * English names (2026-10-06), not the Chinese ones romanised.
 */
const PERSON_NAMES: Readonly<
  Record<
    string,
    readonly {
      name: string;
      mail: string;
      position: string;
      username?: string;
    }[]
  >
> = {
  'en-US': [
    {
      name: 'Olivia Bennett',
      mail: 'olivia.bennett',
      position: 'Frontend Engineer',
    },
    { name: 'Ethan Brown', mail: 'ethan.brown', position: 'Backend Engineer' },
    { name: 'Sophia Turner', mail: 'sophia.turner', position: 'Sales Manager' },
    {
      name: 'Mark Taylor',
      mail: 'mark.taylor',
      position: 'IT Support Engineer',
      username: 'mark',
    },
    { name: 'Lucas Martin', mail: 'lucas.martin', position: 'QA Engineer' },
    {
      name: 'Chloe Adams',
      mail: 'chloe.adams',
      position: 'Presales Consultant',
    },
  ],
  'zh-CN': [
    { name: '李娜', mail: 'li.na', position: '前端工程师' },
    { name: '张伟', mail: 'zhang.wei', position: '后端工程师' },
    { name: '王芳', mail: 'wang.fang', position: '销售经理' },
    {
      name: '陈杰',
      mail: 'chen.jie',
      position: 'IT 支持工程师',
      username: 'chenjie',
    },
    { name: '刘洋', mail: 'liu.yang', position: '测试工程师' },
    { name: '赵敏', mail: 'zhao.min', position: '售前顾问' },
  ],
};

/**
 * Two people joining in the coming days with nothing prepared yet, so 入职准备
 * and 入职配备 have someone to show (2026-10-05): one in R&D, who takes the
 * department's default kit, and a designer in Product, whose position has a
 * kit of its own.
 */
const JOINER_NAMES: Readonly<
  Record<string, readonly { name: string; mail: string; position: string }[]>
> = {
  'en-US': [
    { name: 'Noah Harris', mail: 'noah.harris', position: 'Frontend Engineer' },
    { name: 'Grace Lee', mail: 'grace.lee', position: 'Designer' },
  ],
  'zh-CN': [
    { name: '孙浩', mail: 'sun.hao', position: '前端工程师' },
    { name: '林雪', mail: 'lin.xue', position: '设计师' },
  ],
};

/**
 * What a department's 入职配置 asks for, as the seeds write it
 * (`202610050001_seed_itam_onboarding_kits`): engineering (R&D, QA and
 * 技术部, whose kit the demo adds), product, marketing, the customer-facing
 * teams and the office teams.
 */
type CrewKit = 'engineering' | 'product' | 'marketing' | 'field' | 'office';
const CREW_KITS: Readonly<Record<string, CrewKit>> = {
  'dept-tech': 'engineering',
  'dept-rd': 'engineering',
  'dept-qa': 'engineering',
  'dept-product': 'product',
  'dept-marketing': 'marketing',
  'dept-sales': 'field',
  'dept-customer': 'field',
  'dept-hr': 'office',
  'dept-finance': 'office',
  'dept-admin': 'office',
};

/** One of the rest of the company: name, mailbox and position by language. */
interface CrewSpec {
  readonly department: string;
  /** Days ago they started. */
  readonly hired: number;
  /** Days ago they left, everything handed back: a former employee. */
  readonly left?: number;
  /** Works at the Japan branch rather than on the third floor. */
  readonly japan?: boolean;
  /** Product's designers have a kit of their own (Adobe on top). */
  readonly designer?: boolean;
  /**
   * The index in `CREW` of a former employee whose laptop and monitor or
   * phone they took over when they started.
   */
  readonly inherits?: number;
  readonly 'en-US': readonly [string, string, string];
  readonly 'zh-CN': readonly [string, string, string];
}

/**
 * The rest of the company (2026-10-16): the demo had six employees and its
 * IT staff, so the register read as a team of twelve. These fill the seeded
 * departments with people who joined over six years — in the order they
 * started, which is the order of their employee numbers — each with a
 * position from their department's list, and two who left long ago with
 * everything handed back, whose laptops went on to the people who replaced
 * them. Everybody still here is equipped as their department's 入职配置
 * asks, on the days they started.
 */
const CREW: readonly CrewSpec[] = [
  {
    department: 'dept-tech',
    hired: 2350,
    'en-US': ['Henry Walsh', 'henry.walsh', 'Technical Director'],
    'zh-CN': ['郑涛', 'zheng.tao', '技术总监'],
  },
  {
    department: 'dept-finance',
    hired: 2200,
    'en-US': ['Rachel Moore', 'rachel.moore', 'Finance Manager'],
    'zh-CN': ['何丽', 'he.li', '财务经理'],
  },
  {
    department: 'dept-hr',
    hired: 2000,
    'en-US': ['Megan Price', 'megan.price', 'HR Business Partner'],
    'zh-CN': ['高婷', 'gao.ting', 'HRBP'],
  },
  {
    department: 'dept-admin',
    hired: 1900,
    'en-US': ['Laura Hughes', 'laura.hughes', 'Office Administrator'],
    'zh-CN': ['罗丹', 'luo.dan', '行政专员'],
  },
  {
    department: 'dept-rd',
    hired: 1820,
    'en-US': ['Jacob Foster', 'jacob.foster', 'Backend Engineer'],
    'zh-CN': ['马超', 'ma.chao', '后端工程师'],
  },
  {
    department: 'dept-qa',
    hired: 1700,
    'en-US': ['Andrew Collins', 'andrew.collins', 'QA Manager'],
    'zh-CN': ['胡斌', 'hu.bin', '质量经理'],
  },
  {
    department: 'dept-product',
    hired: 1450,
    'en-US': ['Nathan Reed', 'nathan.reed', 'Product Manager'],
    'zh-CN': ['林峰', 'lin.feng', '产品经理'],
  },
  // Left a year ago; Dylan Cooper (程亮) took over the laptop and phone.
  {
    department: 'dept-sales',
    hired: 1400,
    left: 385,
    'en-US': ['Hannah Scott', 'hannah.scott', 'Sales Representative'],
    'zh-CN': ['朱琳', 'zhu.lin', '销售代表'],
  },
  {
    department: 'dept-marketing',
    hired: 1380,
    'en-US': ['Victoria Hayes', 'victoria.hayes', 'Marketing Manager'],
    'zh-CN': ['郭静', 'guo.jing', '市场经理'],
  },
  {
    department: 'dept-sales',
    hired: 1280,
    'en-US': ['Tyler Morgan', 'tyler.morgan', 'Sales Representative'],
    'zh-CN': ['黄磊', 'huang.lei', '销售代表'],
  },
  {
    department: 'dept-customer',
    hired: 1150,
    'en-US': ['Amelia Clarke', 'amelia.clarke', 'Customer Success Manager'],
    'zh-CN': ['宋佳', 'song.jia', '客户成功经理'],
  },
  // Left in the spring; Logan Hall (叶帆) took over the laptop and monitor.
  {
    department: 'dept-rd',
    hired: 1010,
    left: 205,
    'en-US': ['Owen Parker', 'owen.parker', 'Mobile Engineer'],
    'zh-CN': ['唐宁', 'tang.ning', '移动端工程师'],
  },
  {
    department: 'dept-rd',
    hired: 980,
    'en-US': ['Isaac Rivera', 'isaac.rivera', 'Mobile Engineer'],
    'zh-CN': ['许晨', 'xu.chen', '移动端工程师'],
  },
  {
    department: 'dept-finance',
    hired: 900,
    'en-US': ['Emma Lewis', 'emma.lewis', 'Accountant'],
    'zh-CN': ['冯悦', 'feng.yue', '会计'],
  },
  {
    department: 'dept-product',
    hired: 880,
    designer: true,
    'en-US': ['Zoe Campbell', 'zoe.campbell', 'Designer'],
    'zh-CN': ['曹颖', 'cao.ying', '设计师'],
  },
  {
    department: 'dept-sales',
    hired: 760,
    'en-US': ['Caleb Russell', 'caleb.russell', 'Presales Consultant'],
    'zh-CN': ['彭飞', 'peng.fei', '售前顾问'],
  },
  {
    department: 'dept-marketing',
    hired: 690,
    'en-US': ['Lily Evans', 'lily.evans', 'Content Marketer'],
    'zh-CN': ['董琪', 'dong.qi', '内容运营'],
  },
  {
    department: 'dept-rd',
    hired: 640,
    'en-US': ['Samuel Young', 'samuel.young', 'Frontend Engineer'],
    'zh-CN': ['袁博', 'yuan.bo', '前端工程师'],
  },
  {
    department: 'dept-customer',
    hired: 560,
    japan: true,
    'en-US': ['Haruto Sato', 'sato.haruto', 'Support Specialist'],
    'zh-CN': ['佐藤阳翔', 'sato.haruto', '技术支持'],
  },
  {
    department: 'dept-product',
    hired: 520,
    'en-US': ['Ava Robinson', 'ava.robinson', 'Product Manager'],
    'zh-CN': ['蒋欣', 'jiang.xin', '产品经理'],
  },
  {
    department: 'dept-qa',
    hired: 410,
    'en-US': ['Leo Bailey', 'leo.bailey', 'QA Engineer'],
    'zh-CN': ['韩冰', 'han.bing', '测试工程师'],
  },
  {
    department: 'dept-sales',
    hired: 370,
    inherits: 7,
    'en-US': ['Dylan Cooper', 'dylan.cooper', 'Sales Representative'],
    'zh-CN': ['程亮', 'cheng.liang', '销售代表'],
  },
  {
    department: 'dept-hr',
    hired: 330,
    'en-US': ['Ella Richardson', 'ella.richardson', 'Recruiter'],
    'zh-CN': ['魏然', 'wei.ran', '招聘专员'],
  },
  {
    department: 'dept-admin',
    hired: 260,
    'en-US': ['Mia Howard', 'mia.howard', 'Receptionist'],
    'zh-CN': ['姚瑶', 'yao.yao', '前台'],
  },
  {
    department: 'dept-marketing',
    hired: 210,
    'en-US': ['Ruby Graham', 'ruby.graham', 'Content Marketer'],
    'zh-CN': ['邓莉', 'deng.li', '内容运营'],
  },
  {
    department: 'dept-rd',
    hired: 150,
    inherits: 11,
    'en-US': ['Logan Hall', 'logan.hall', 'Mobile Engineer'],
    'zh-CN': ['叶帆', 'ye.fan', '移动端工程师'],
  },
  {
    department: 'dept-sales',
    hired: 95,
    japan: true,
    'en-US': ['Yui Tanaka', 'tanaka.yui', 'Sales Representative'],
    'zh-CN': ['田中结衣', 'tanaka.yui', '销售代表'],
  },
  {
    department: 'dept-rd',
    hired: 75,
    'en-US': ['Jack Simmons', 'jack.simmons', 'Backend Engineer'],
    'zh-CN': ['潘越', 'pan.yue', '后端工程师'],
  },
  {
    department: 'dept-customer',
    hired: 40,
    'en-US': ['Ivy Coleman', 'ivy.coleman', 'Support Specialist'],
    'zh-CN': ['钟慧', 'zhong.hui', '技术支持'],
  },
];

export function createDemoService(dependencies: {
  database: DatabaseManager;
  masterData: MasterDataService;
  devices: DeviceService;
  stock: StockService;
  entitlements: EntitlementService;
  procurement: ProcurementService;
  repairs: RepairService;
  audits: AuditService;
  disposals: DisposalService;
  /** The deployment's default locale; demo names follow it where they read as prose. */
  locale?: () => string;
  /**
   * A signed-in account other than the one generating the data, to stand in
   * as the colleague who decides the demo's requests. Nobody may decide their
   * own request, so without a second account the demo falls back to an id
   * that belongs to no one and its open request cannot be decided by hand.
   */
  otherUser?: (actorId: string) => Promise<string | undefined>;
  /** Creates and removes the demo's own sign-ins; absent in a bare harness. */
  accounts?: DemoAccounts;
  /** Rewinds the number sequences once the demo's records are gone. */
  numbering?: NumberingService;
  /** What the demo's Intune reports goes through the real matching. */
  deviceSync?: DeviceSyncService;
  /** Writes the demo's comment threads; absent in a bare harness. */
  comments?: CommentService;
  /**
   * The work agents, for the suggestions the demo comes with instead of
   * asking a model (2026-10-16); absent in a bare harness.
   */
  agents?: DemoAgents;
}): DemoService {
  const {
    database,
    masterData,
    devices,
    stock,
    entitlements,
    procurement,
    repairs,
    audits,
    disposals,
  } = dependencies;

  const counts = async (): Promise<Record<string, number>> => {
    const rows = await database
      .query()
      .selectFrom('demoRecords')
      .select(['collection'])
      .execute<{ collection: string }>();
    const result: Record<string, number> = {};
    for (const row of rows)
      result[row.collection] = (result[row.collection] ?? 0) + 1;
    return result;
  };

  const accountsByLanguage = Object.fromEntries(
    DEMO_LANGUAGES.map((language) => [language, demoAccountsIn(language)]),
  ) as Record<DemoLanguage, readonly DemoAccountSummary[]>;

  return {
    async status() {
      const importing =
        importPercent === undefined ? null : { percent: importPercent };
      const result = await counts();
      const generated = Object.keys(result).length > 0;
      if (!generated)
        return {
          generated,
          counts: result,
          records: 0,
          createdAt: null,
          language: null,
          accounts: [],
          accountsByLanguage,
          importing,
          failure: importFailure,
        };
      const first = await database
        .query()
        .selectFrom('demoRecords')
        .select('createdAt')
        .orderBy('createdAt', 'asc')
        .executeTakeFirst<{ createdAt: unknown }>();
      // The language is not stored: the demo's people say it, since each
      // language names them differently.
      const names = new Set(
        (
          await database
            .query()
            .selectFrom('people')
            .innerJoin('demoRecords', 'demoRecords.recordId', 'people.id')
            .select('people.name')
            .execute<{ name: string }>()
        ).map((row) => row.name),
      );
      const language =
        DEMO_LANGUAGES.find((candidate) =>
          (PERSON_NAMES[candidate] ?? []).some((entry) =>
            names.has(entry.name),
          ),
        ) ?? null;
      return {
        generated,
        counts: result,
        records: Object.values(result).reduce((sum, n) => sum + n, 0),
        createdAt: asText(first?.createdAt) ?? null,
        language,
        // Only when it created sign-ins: a harness without the accounts
        // plugins generates none.
        accounts:
          language && result.accounts ? accountsByLanguage[language] : [],
        accountsByLanguage,
        importing,
        failure: importFailure,
      };
    },

    async start(actorId, language) {
      if (importPercent !== undefined)
        throw new BusinessRuleError(
          'Demo data is being imported',
          'DEMO_IMPORTING',
        );
      if ((await this.status()).generated)
        throw new BusinessRuleError(
          'Demo data already exists; clear it first',
          'DEMO_EXISTS',
        );
      importFailure = null;
      void this.generate(actorId, language).catch((error: unknown) => {
        importFailure = {
          ...(error instanceof BusinessRuleError ? { code: error.rule } : {}),
          message: error instanceof Error ? error.message : String(error),
        };
      });
      // `generate` marks itself running after its own first query; the
      // answer says so already, so the page polls from the first moment.
      return { ...(await this.status()), importing: { percent: 0 } };
    },

    async generate(actorId, language) {
      const locale = language ?? dependencies.locale?.() ?? 'en-US';
      if (importPercent !== undefined)
        throw new BusinessRuleError(
          'Demo data is being imported',
          'DEMO_IMPORTING',
        );
      if ((await this.status()).generated)
        throw new BusinessRuleError(
          'Demo data already exists; clear it first',
          'DEMO_EXISTS',
        );
      importPercent = 0;
      // Each step's progress, and a turn of the event loop: the database
      // driver is synchronous, so without it the status requests the page
      // polls with wait until the whole import is over.
      const reached = async (percent: number): Promise<void> => {
        importPercent = percent;
        await new Promise<void>((done) => setImmediate(done));
      };
      try {
        const all = (collection: string, action: string) =>
          unrestricted(collection, action);
        const track = async (collection: string, row: Row): Promise<Row> => {
          await database
            .query()
            .insertInto('demoRecords')
            .values({
              collection,
              recordId: String(row.id),
              createdAt: new Date(),
            })
            .execute();
          return row;
        };
        // The demo's clock (2026-10-16). The services stamp every history
        // line, movement, assignment period and seat with the moment they
        // run, so an import used to read as one afternoon: every timeline
        // said 今天. `on(day)` dates what the operations after it write —
        // until the next `on()` or `off()` — on that day (days from now,
        // negative in the past): each row written since keeps its order and
        // moves to that day at office hours, a millisecond of the import
        // becoming a second. A laptop bought three years ago then reads as
        // bought, issued, repaired and counted across those three years,
        // and a stock item's movements run over the months they took. Only
        // rows written while a day is set move, so nothing the demo did not
        // write is touched; what is written after `off()` keeps today.
        const DATED: readonly (readonly [string, string])[] = [
          ['historyEvents', 'createdAt'],
          ['changeLogs', 'createdAt'],
          ['stockMovements', 'createdAt'],
          ['stockHoldings', 'createdAt'],
          ['stockHoldings', 'updatedAt'],
          ['allocations', 'createdAt'],
          ['allocations', 'endedAt'],
          ['entitlementSeats', 'assignedAt'],
          ['entitlementSeats', 'releasedAt'],
          ['approvals', 'requestedAt'],
          ['approvals', 'decidedAt'],
          ['purchaseReceipts', 'createdAt'],
          ['auditItems', 'countedAt'],
          ['auditItems', 'resolvedAt'],
          ['auditTasks', 'createdAt'],
          ['auditTasks', 'startedAt'],
          ['auditTasks', 'completedAt'],
          ['devices', 'createdAt'],
          ['devices', 'assignedAt'],
          ['devices', 'lastAuditedAt'],
          ['stockItems', 'createdAt'],
          ['entitlements', 'createdAt'],
          ['purchaseOrders', 'createdAt'],
          ['repairs', 'createdAt'],
          ['disposals', 'createdAt'],
          ['people', 'createdAt'],
          ['vendors', 'createdAt'],
        ];
        const instant = (value: unknown): number =>
          value instanceof Date ? value.getTime() : Date.parse(String(value));
        // When a day's first entry is made: between nine and five, varying
        // with the day so the timelines do not all read 09:00.
        const officeHours = (day: number): number => {
          const at = new Date(Date.now() + day * DAY);
          const spread = Math.abs(Math.round(day));
          at.setHours(9 + ((spread * 5) % 8), (spread * 17) % 60, 0, 0);
          return at.getTime();
        };
        // How far into each day the entries already dated reach, so a second
        // `on()` for the same day follows the first instead of overlapping it.
        const dayEnds = new Map<string, number>();
        let clock:
          | { readonly since: string; readonly sinceMs: number; base: number }
          | undefined;
        const off = async (): Promise<void> => {
          if (!clock) return;
          const { since, sinceMs, base } = clock;
          clock = undefined;
          let latest = base;
          for (const [table, column] of DATED) {
            const rows = await database
              .query()
              .selectFrom(table)
              .select(['id', column])
              .where(column, '>=', since)
              .execute<Row>();
            for (const row of rows) {
              const at = Math.min(
                base + Math.max(0, instant(row[column]) - sinceMs) * 1000,
                Date.now() - 60_000,
              );
              latest = Math.max(latest, at);
              await database
                .query()
                .updateTable(table)
                .set({ [column]: new Date(at) })
                .where('id', '=', String(row.id))
                .execute();
            }
          }
          const key = isoDate(new Date(base));
          dayEnds.set(key, Math.max(dayEnds.get(key) ?? 0, latest));
        };
        const on = async (day: number): Promise<void> => {
          await off();
          const start = officeHours(day);
          const before = dayEnds.get(isoDate(new Date(start)));
          const now = new Date();
          clock = {
            since: dbDateTime(now),
            sinceMs: now.getTime(),
            base:
              before === undefined ? start : Math.max(start, before + 300_000),
          };
        };
        /** Days from today to a YYYY-MM-DD date. */
        const dayOf = (date: unknown): number =>
          Math.round(
            (Date.parse(
              `${date instanceof Date ? isoDate(date) : String(date).slice(0, 10)}T12:00:00`,
            ) -
              Date.parse(`${isoDate(new Date())}T12:00:00`)) /
              DAY,
          );
        // The demo's own sign-ins, so every role can be tried straight away.
        // Each is tracked like any other demo record and removed when the demo
        // is cleared.
        const account = async (
          spec: DemoAccountSpec,
        ): Promise<string | undefined> => {
          if (!dependencies.accounts) return undefined;
          const id = await dependencies.accounts.create(spec);
          await track('accounts', { id });
          return id;
        };
        const staffSpecs =
          DEMO_STAFF[locale as DemoLanguage] ?? DEMO_STAFF['en-US'];
        const staffUserIds = await Promise.all(
          staffSpecs.map((spec) => account(spec)),
        );
        const [managerUserId, deskManagerUserId, supportUserId] = staffUserIds;
        // Who decides the demo's requests: the first asset manager, who holds
        // `approve`, so the approval trail reads as a colleague and the order
        // left waiting can actually be decided by signing in as them. Without
        // the accounts plugins the demo falls back to any other real account,
        // then to a stand-in id whose request nobody can decide.
        const approverId =
          managerUserId ??
          (await dependencies.otherUser?.(actorId)) ??
          'demo-approver';
        // Who writes the demo: the second asset manager, so the records read
        // as the IT team's work — she raises the requests the first manager
        // decides, and is the creator, requester or 负责人 wherever a service
        // takes the actor for one. The account that generated the demo only
        // stands in for her when the accounts plugins are missing (tests, a
        // reset); it answers for its own share of the to-dos below.
        const writerId = deskManagerUserId ?? actorId;
        // The account importing the demo — the system administrator, which
        // holds no ITAM grant of its own — is an asset manager while the demo
        // is there (2026-10-16, as NocoCRM's importer is its sales manager):
        // it may be named an approver or a 负责人 and work the register as the
        // demo's managers do. Taken back when the demo is cleared, unless it
        // held the set before.
        if (dependencies.accounts && managerUserId) {
          const granted = await dependencies.accounts
            .grant(actorId, 'itam-asset-manager')
            .catch(() => null);
          if (granted) await track('importerGrants', { id: granted });
        }
        // The importer's share of the work (2026-10-16): whoever imports the
        // demo opens 待办 → 我负责的 on something of every kind — a request
        // to decide, orders to receive, a repair, a count and a disposal to
        // carry out — rather than an empty board. Only once it is an asset
        // manager; otherwise those records stay with the demo's staff.
        const importerId =
          dependencies.accounts && managerUserId ? actorId : undefined;
        const context: OperationContext = {
          actorId: writerId,
          sourceType: 'demo',
        };
        // The route schemas add these defaults; the service expects them
        // present. 在职状态 is not among them — the service derives it from the
        // leave date, and stating it is refused.
        const MASTER_DEFAULTS: Readonly<Record<string, Row>> = {
          categories: {
            requiresSerial: false,
            assignableToPerson: true,
            sort: 0,
          },
          locations: { sort: 0 },
          departments: { sort: 0 },
        };
        // The master data the demo created itself, as opposed to a seeded or
        // existing record it reuses: only these may be given a history,
        // since clearing the demo removes the history of its own records
        // and would leave anybody else's changed.
        const demoMade = new Set<string>();
        const md = async (collection: string, input: Row) => {
          const created = await track(
            collection,
            await masterData.create(
              collection,
              { ...MASTER_DEFAULTS[collection], ...input },
              writerId,
              all(collection, 'create'),
            ),
          );
          demoMade.add(String(created.id));
          return created;
        };
        /** A later change to master data the demo made, dated by `on()`. */
        const revise = async (collection: string, row: Row, input: Row) => {
          if (!demoMade.has(String(row.id))) return;
          await masterData.update(
            collection,
            String(row.id),
            input,
            writerId,
            all(collection, 'update'),
          );
        };

        await reached(5);
        // Master data
        // Vendors are fictional companies; their names read in the
        // deployment's language and keep the demo marker. They were on the
        // books long before the oldest device.
        await on(-1950);
        const vendorNames = VENDOR_NAMES[locale] ?? VENDOR_NAMES['en-US'];
        const texts = TEXTS[locale] ?? TEXTS['en-US'];
        const reseller = await md('vendors', {
          name: vendorNames.reseller.name,
          types: ['equipment', 'softwareReseller'],
          contactName: vendorNames.reseller.contact,
          phone: '021-5000 1001',
          email: 'sales@demo-reseller.example',
        });
        const repairShop = await md('vendors', {
          name: vendorNames.repair.name,
          types: ['repairProvider'],
          contactName: vendorNames.repair.contact,
          phone: '021-5000 2002',
          email: 'service@demo-repair.example',
        });
        const recycler = await md('vendors', {
          name: vendorNames.recycler.name,
          types: ['recycler'],
          contactName: vendorNames.recycler.contact,
          phone: '021-5000 3003',
          email: 'recycle@demo-greenloop.example',
        });
        // Their records changed since (2026-10-16), so a vendor's history
        // reads as years of dealing with it rather than one line saying it
        // was created: the reseller moved to a new switchboard and later
        // handed the account to somebody else, the repair shop set its
        // pick-up days, the recycler started certifying destruction.
        await on(-1180);
        await revise('vendors', reseller, { phone: '021-5000 1888' });
        await on(-610);
        await revise('vendors', reseller, {
          contactName: texts.resellerContact,
          email: 'accounts@demo-reseller.example',
        });
        await on(-430);
        await revise('vendors', repairShop, {
          phone: '021-5000 2266',
          notes: texts.repairShopNotes,
        });
        await on(-300);
        await revise('vendors', recycler, { notes: texts.recyclerNotes });
        // Categories, manufacturers, models, software products, locations and
        // departments come from the seeds (`202609120002_seed_itam_categories`,
        // `202609150001_seed_itam_manufacturers_models`,
        // `202609150002_seed_itam_software_products`,
        // `202609150003_seed_itam_locations`,
        // `202609150004_seed_itam_departments`): the demo shows the standard
        // catalogue rather than a parallel one.
        const seededIn = async (collection: string, id: string) => {
          const row = await database
            .query()
            .selectFrom(collection)
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst<Row>();
          if (!row)
            throw new BusinessRuleError(
              `Seed record ${collection}/${id} is missing; run the seeds before generating demo data`,
              'DEMO_SEED_MISSING',
            );
          return row;
        };
        const seeded = (id: string) => seededIn('categories', id);
        const seededModel = async (
          id: string,
        ): Promise<Row & { readonly manufacturer: Row }> => {
          const model = await seededIn('models', id);
          // A manufacturer of the seeded name may predate the seed under its
          // own id; the model already points at that one.
          return {
            ...model,
            manufacturer: await seededIn(
              'manufacturers',
              String(model.manufacturerId),
            ),
          };
        };
        // Master data the demo needs that the seeds do not carry — a webcam
        // category, the models of a few stock items — is created and tracked,
        // unless a record of that name is there already, which is used as it
        // is and left alone on clearing.
        const named = async (collection: string, input: Row): Promise<Row> =>
          (await database
            .query()
            .selectFrom(collection)
            .selectAll()
            .where('name', '=', String(input.name))
            .executeTakeFirst<Row>()) ?? (await md(collection, input));
        // A picture for a model the demo enters (`DEMO_PICTURES`), with
        // its credit, when the model seed stored it: a database seeded
        // before the seed kept every picture gets the model without one.
        const picture = async (image: DemoPicture): Promise<Row> =>
          (await database
            .query()
            .selectFrom('itamFiles')
            .select('id')
            .where('id', '=', DEMO_PICTURES[image])
            .executeTakeFirst())
            ? {
                imageFileId: DEMO_PICTURES[image],
                ...(DEMO_PICTURE_CREDITS[image]
                  ? { imageCredit: DEMO_PICTURE_CREDITS[image] }
                  : {}),
              }
            : {};
        const mouseCat = await seeded('cat-mouse');
        const keyboardCat = await seeded('cat-keyboard');
        const tonerCat = await seeded('cat-toner');
        const printSuppliesCat = await seeded('cat-print-supplies');
        const ramCat = await seeded('cat-memory');
        const dockCat = await seeded('cat-dock');
        const headsetCat = await seeded('cat-headset');
        const cableCat = await seeded('cat-cable');
        const batteryCat = await seeded('cat-battery');
        const diskCat = await seeded('cat-disk');
        const mbp = await seededModel('model-macbook-pro-14-m3');
        const air = await seededModel('model-macbook-air-13-m3');
        const thinkpad = await seededModel('model-thinkpad-t14-gen5');
        const latitude = await seededModel('model-latitude-5440');
        const u2723 = await seededModel('model-u2723qe');
        const dock = await seededModel('model-wd22tb4');
        const optiplex = await seededModel('model-optiplex-7010');
        const poweredge = await seededModel('model-poweredge-r760');
        const catalyst = await seededModel('model-catalyst-9200-48p');
        const iphone = await seededModel('model-iphone-15');
        const laserjet = await seededModel('model-laserjet-pro-m428');
        const vmModel = await seededModel('model-vsphere-vm');
        const mxMaster = await seededModel('model-mx-master-3s');
        const mxKeys = await seededModel('model-mx-keys');
        const wd22 = await seededModel('model-wd22tb4');
        const hpToner = await seededModel('model-hp-58a');
        const ssdModel = await seededModel('model-980-pro-1tb');
        const zoneVibe = await seededModel('model-zone-vibe-100');
        const usbCable = await seededModel('model-usb-c-cable-1m');
        const laptopBattery = await seededModel('model-latitude-5440-battery');
        const ramModel = await seededModel('model-ddr5-32gb-sodimm');
        const figma = await seededIn('softwareProducts', 'sp-figma');
        const zoom = await seededIn('softwareProducts', 'sp-zoom-workplace');
        const office = await seededIn(
          'softwareProducts',
          'sp-office-ltsc-2024',
        );
        const intellij = await seededIn('softwareProducts', 'sp-intellij-idea');
        const floor3 = await seededIn('locations', 'loc-hq-floor-3');
        const warehouse = await seededIn('locations', 'loc-hq-warehouse');
        const serverRoom = await seededIn('locations', 'loc-hq-server-room');
        const japan = await seededIn('locations', 'loc-japan');
        const rnd = await seededIn('departments', 'dept-rd');
        const sales = await seededIn('departments', 'dept-sales');
        const people = [] as Row[];
        // Names read in the deployment's language; the e-mail keeps the
        // romanised form so it stays a valid address.
        const personNames = PERSON_NAMES[locale] ?? PERSON_NAMES['en-US'];
        const itDept = await seededIn('departments', 'dept-it');
        // The leaver is IT support; the rest are the two business teams.
        const departmentsByIndex = [rnd, rnd, sales, itDept, rnd, sales];
        // When each joined (2026-10-16): the first four were there when the
        // 2023 laptop batch came in, the QA engineer and the presales
        // consultant came later and took over equipment others had used.
        // Each person is entered a few days before they start.
        const HIRED_DAYS_AGO = [1150, 1120, 1610, 1560, 290, 330];
        for (const [index, entry] of personNames.entries()) {
          const hiredDaysAgo = HIRED_DAYS_AGO[index] ?? 400;
          await on(-hiredDaysAgo - 3);
          // Only the leaver signs in: they are IT, and a person who has left
          // still owns the records that name them, which point at a sign-in.
          // The others are employees, who are people in the register and not
          // accounts (2026-10-05).
          const userId =
            index === LEAVER_INDEX && entry.username
              ? await account({
                  username: entry.username,
                  name: entry.name,
                  email: `${entry.mail}@northbridge.example`,
                  password: `${entry.username}123`,
                  permissionSet: 'itam-it-support',
                })
              : undefined;
          people.push(
            await md('people', {
              name: entry.name,
              employeeNo: `EMP-${String(index + 101).padStart(3, '0')}`,
              email: `${entry.mail}@northbridge.example`,
              phone: `138 0013 0${String(index + 101).padStart(3, '0')}`,
              position: entry.position,
              departmentId: departmentsByIndex[index]?.id,
              locationId: floor3.id,
              hireDate: daysFromNow(-hiredDaysAgo),
              ...(userId ? { userId } : {}),
            }),
          );
        }
        const [liNa, zhangWei, wangFang, chenJie, liuYang, zhaoMin] =
          people as [Row, Row, Row, Row, Row, Row];
        // The rest of the company (2026-10-16, `CREW`), numbered on from the
        // employees above in the order they started. Each is entered a few
        // days before their first day, like everybody, so each is measured
        // against their department's 入职配置 — and is equipped to it below.
        const crew: Row[] = [];
        for (const [index, spec] of CREW.entries()) {
          const [name, mail, position] =
            locale === 'zh-CN' ? spec['zh-CN'] : spec['en-US'];
          const number = String(index + 107).padStart(3, '0');
          await on(-spec.hired - 3);
          crew.push(
            await md('people', {
              name,
              employeeNo: `EMP-${number}`,
              email: `${mail}@northbridge.example`,
              phone: spec.japan
                ? `+81 90 5521 0${number}`
                : `138 0013 0${number}`,
              position,
              departmentId: (await seededIn('departments', spec.department)).id,
              locationId: spec.japan ? japan.id : floor3.id,
              hireDate: daysFromNow(-spec.hired),
            }),
          );
        }
        /** What a crew member's department kit asks for. */
        const crewKit = (spec: CrewSpec): CrewKit =>
          CREW_KITS[spec.department] ?? 'office';
        const crewWants = {
          monitor: (spec: CrewSpec) =>
            ['engineering', 'product'].includes(crewKit(spec)),
          phone: (spec: CrewSpec) => crewKit(spec) === 'field',
          dock: (spec: CrewSpec) => crewKit(spec) === 'engineering',
          keyboard: (spec: CrewSpec) =>
            ['engineering', 'office'].includes(crewKit(spec)),
          mouse: (spec: CrewSpec) => crewKit(spec) !== 'field',
          headset: (spec: CrewSpec) => crewKit(spec) === 'field',
          intellij: (spec: CrewSpec) => crewKit(spec) === 'engineering',
          zoom: (spec: CrewSpec) =>
            ['engineering', 'product', 'field'].includes(crewKit(spec)),
          figma: (spec: CrewSpec) =>
            ['product', 'marketing'].includes(crewKit(spec)),
          adobe: (spec: CrewSpec) =>
            crewKit(spec) === 'marketing' || spec.designer === true,
        } as const;
        /** How many still here want something: what stock and seats must cover. */
        const crewCount = (wants: (spec: CrewSpec) => boolean) =>
          CREW.filter((spec) => spec.left === undefined && wants(spec)).length;

        // The staff sign-ins get a person record of their own, in IT, so the
        // equipment they are issued has somebody to be assigned to.
        const itDepartment = itDept;
        const staff = new Map<StaffKey, Row>();
        const STAFF_HIRED_DAYS_AGO = [1700, 1400, 1100];
        for (const [index, spec] of staffSpecs.entries()) {
          const hiredDaysAgo = STAFF_HIRED_DAYS_AGO[index] ?? 900;
          await on(-hiredDaysAgo - 3);
          staff.set(
            spec.key,
            await md('people', {
              name: spec.name,
              // EMP-001 belongs to a seeded person, and EMP-1xx to the demo
              // employees above.
              employeeNo: `EMP-${String(index + 201).padStart(3, '0')}`,
              email: spec.email,
              phone: `138 0013 0${String(index + 201)}`,
              position: spec.position,
              departmentId: itDepartment.id,
              locationId: floor3.id,
              hireDate: daysFromNow(-hiredDaysAgo),
              ...(staffUserIds[index] ? { userId: staffUserIds[index] } : {}),
            }),
          );
        }

        // What the leaver answers for. Returning equipment is only half of
        // offboarding: the records naming them as 负责人 keep naming
        // them until somebody takes them over, and nothing but a person can do
        // that. The demo gives them a few so the handover half has something
        // to show.
        const leaverUserId = asText(chenJie.userId) ?? writerId;

        // Devices: a batch of laptops bought together (same warranty), monitors, and problem records.
        // Each is entered on the day it was bought.
        const device = async (input: Row) => {
          if (input.purchaseDate) await on(dayOf(input.purchaseDate));
          return track(
            'devices',
            await devices.create(
              {
                ...input,
                locationId: asText(input.locationId) ?? String(floor3.id),
              },
              context,
              all('devices', 'create'),
            ),
          );
        };
        // Extended fields follow the seeded laptop template (os, cpu, memory,
        // storage, macAddress, hostname, screenSize) so the device pages show
        // filled-in values.
        const macFor = (index: number) =>
          `a4:83:e7:1${index}:2${index}:3${index}`;
        const laptops: Row[] = [];
        for (let index = 0; index < 5; index += 1) {
          laptops.push(
            await device({
              modelId: mbp.id,
              serialNo: `C02XK1A0${index}MD6T`,
              name: `SG-LT-00${index + 1}`,
              departmentId: index < 3 ? rnd.id : sales.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-1060),
              purchasePrice: 15999,
              warrantyEndDate: daysFromNow(20 + index * 2),
              // The last two are the leaver's to answer for; their holders
              // keep them, so these are purely a handover.
              ...(index >= 3 ? { ownerId: leaverUserId } : {}),
              attributes: {
                os: 'macOS 15.6',
                macAddress: macFor(index),
                hostname: `SG-LT-00${index + 1}`,
              },
            }),
          );
        }
        // The laptop the leaver holds answers to IT support, not to 吴静, who
        // writes the demo: a leaver's things belong to more
        // than one person, which is the whole reason the recovery lists every
        // item and counts only the reader's own.
        const expiredLaptop = await device({
          modelId: latitude.id,
          serialNo: '7YQ2K73',
          name: 'SG-LT-006',
          departmentId: sales.id,
          vendorId: reseller.id,
          ownerId: supportUserId ?? writerId,
          purchaseDate: daysFromNow(-1500),
          purchasePrice: 8999,
          warrantyEndDate: daysFromNow(-100),
          attributes: {
            os: 'Windows 11 23H2',
            macAddress: 'b0:4f:13:20:01:01',
            hostname: 'SG-LT-006',
          },
        });
        const idleLaptop = await device({
          modelId: latitude.id,
          serialNo: '7YQ2K74',
          name: 'SG-LT-007',
          locationId: warehouse.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-700),
          purchasePrice: 8999,
          warrantyEndDate: daysFromNow(400),
          // Upgraded after purchase: what its model says is not what it has,
          // so it states its own processor, memory and disk.
          attributes: {
            os: 'Windows 11 24H2',
            cpu: 'Intel Core i7-1355U',
            memory: '32 GB',
            storage: '1 TB',
            macAddress: 'b0:4f:13:20:02:02',
            hostname: 'SG-LT-007',
          },
        });
        const airs: Row[] = [];
        for (let index = 0; index < 2; index += 1) {
          airs.push(
            await device({
              modelId: air.id,
              serialNo: `C02YH2B1${index}Q6LR`,
              name: `SG-LT-01${index}`,
              // The second one was never issued, so it is in the warehouse.
              locationId: index === 1 ? warehouse.id : floor3.id,
              departmentId: sales.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-150),
              purchasePrice: 9999,
              warrantyEndDate: daysFromNow(945),
              attributes: {
                os: 'macOS 15.6',
                macAddress: `a4:83:e7:2${index}:2${index}:2${index}`,
                hostname: `SG-LT-01${index}`,
              },
            }),
          );
        }
        const thinkpads: Row[] = [];
        for (let index = 0; index < 2; index += 1) {
          thinkpads.push(
            await device({
              modelId: thinkpad.id,
              serialNo: `PF4R7C${index}X`,
              name: `SG-LT-02${index}`,
              locationId: index === 1 ? warehouse.id : floor3.id,
              departmentId: rnd.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-60),
              purchasePrice: 8499,
              warrantyEndDate: daysFromNow(1035),
              attributes: {
                os: 'Windows 11 24H2',
                macAddress: `b0:4f:13:3${index}:3${index}:3${index}`,
                hostname: `SG-LT-02${index}`,
              },
            }),
          );
        }
        const monitors: Row[] = [];
        for (let index = 0; index < 3; index += 1) {
          monitors.push(
            await device({
              modelId: u2723.id,
              serialNo: `CN0F5K7Y${3000 + index}`,
              name: `SG-MON-00${index + 1}`,
              locationId: index === 2 ? warehouse.id : floor3.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-300),
              purchasePrice: 4299,
              warrantyEndDate: daysFromNow(795),
            }),
          );
        }
        await reached(15);
        // Spares in stock for the joiners, where choosing is not obvious
        // (2026-10-06): the rule takes the joiner's own floor first and then
        // the longest warranty, which lands on SG-LT-050 — the one whose
        // keyboard has been repaired twice — and on SG-MON-006, with its dead
        // pixel. Asset Steward reads the repairs, the notes and the replacement dates
        // and picks otherwise, with a reason the 入职负责人 can check:
        // SG-LT-051 for the first joiner, the clean warehouse SG-LT-052 for
        // the second (051 being held for the first), never SG-LT-053, which
        // is due for replacement within months.
        const spare = (
          name: string,
          serialNo: string,
          index: number,
          input: Row,
        ) =>
          device({
            modelId: mbp.id,
            serialNo,
            name,
            vendorId: reseller.id,
            purchasePrice: 15999,
            ...input,
            attributes: {
              os: 'macOS 15.6',
              macAddress: `a4:83:e7:3${index}:3${index}:3${index}`,
              hostname: name,
            },
          });
        const repairedSpare = await spare('SG-LT-050', 'C02ZK3A00MD6T', 0, {
          purchaseDate: daysFromNow(-420),
          warrantyEndDate: daysFromNow(675),
          notes: texts.spareKeyboard,
        });
        await spare('SG-LT-051', 'C02ZK3A01MD6T', 1, {
          purchaseDate: daysFromNow(-400),
          warrantyEndDate: daysFromNow(655),
        });
        await spare('SG-LT-052', 'C02ZK3A02MD6T', 2, {
          locationId: warehouse.id,
          purchaseDate: daysFromNow(-390),
          warrantyEndDate: daysFromNow(665),
        });
        await spare('SG-LT-053', 'C02ZK3A03MD6T', 3, {
          // Four years old next spring: the laptop cycle is 48 months.
          purchaseDate: daysFromNow(-1400),
          warrantyEndDate: daysFromNow(25),
        });
        for (const [index, notes] of [texts.spareDeadPixel, null].entries())
          await device({
            modelId: u2723.id,
            serialNo: `CN0F5K7Y${3003 + index}`,
            name: `SG-MON-00${index + 6}`,
            vendorId: reseller.id,
            purchaseDate: daysFromNow(-200 + index * 30),
            purchasePrice: 4299,
            // The flawed one has the longer warranty, so the rule takes it.
            warrantyEndDate: daysFromNow(900 - index * 30),
            ...(notes ? { notes } : {}),
          });

        await reached(20);
        // One of everything else the seeded categories describe, each with its
        // extended fields filled in.
        const deskPc = await device({
          modelId: optiplex.id,
          serialNo: '8HN3L94',
          name: 'SG-DT-001',
          departmentId: sales.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-500),
          purchasePrice: 5999,
          warrantyEndDate: daysFromNow(595),
          attributes: {
            os: 'Windows 11 24H2',
            macAddress: 'b0:4f:13:40:01:01',
            hostname: 'SG-DT-001',
          },
        });
        const rack = await device({
          modelId: poweredge.id,
          serialNo: 'JQ7M2B3',
          name: 'SG-SRV-FILE-01',
          locationId: serverRoom.id,
          departmentId: rnd.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-800),
          purchasePrice: 68000,
          warrantyEndDate: daysFromNow(1025),
          attributes: {
            managementIp: '10.0.0.21',
            rackPosition: 'A1-U12',
          },
        });
        const coreSwitch = await device({
          modelId: catalyst.id,
          serialNo: 'FOC2437L1AB',
          name: 'SG-SW-CORE-01',
          locationId: serverRoom.id,
          departmentId: rnd.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-900),
          purchasePrice: 24000,
          warrantyEndDate: daysFromNow(925),
          attributes: {
            managementIp: '10.0.0.2',
            firmware: '17.9.4',
          },
        });
        const mobile = await device({
          modelId: iphone.id,
          serialNo: 'F2LVX4Q9PLJN',
          name: 'SG-PH-001',
          departmentId: sales.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-200),
          purchasePrice: 5999,
          warrantyEndDate: daysFromNow(165),
          attributes: {
            imei: '356789104512345',
            phoneNumber: '138 0000 0001',
            carrier: 'China Mobile',
          },
        });
        const officePrinter = await device({
          modelId: laserjet.id,
          serialNo: 'PHBNC12345',
          name: 'SG-PRN-3F-01',
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-600),
          purchasePrice: 2599,
          warrantyEndDate: daysFromNow(-235),
          attributes: {
            ipAddress: '10.0.3.50',
          },
        });
        const vm = await device({
          modelId: vmModel.id,
          name: 'SG-VM-BUILD-01',
          locationId: serverRoom.id,
          departmentId: rnd.id,
          purchaseDate: daysFromNow(-100),
          attributes: {
            hostname: 'demo-build-01',
            ipAddress: '10.0.1.15',
          },
        });

        // The IT staff hold equipment of their own, like everybody: a laptop
        // each for the first manager and IT support, and the second manager
        // the desk below.
        const staffLaptops = new Map<StaffKey, Row>();
        for (const [index, key] of (
          ['approver', 'support'] as const
        ).entries()) {
          if (!staff.has(key)) continue;
          staffLaptops.set(
            key,
            await device({
              modelId: index === 0 ? mbp.id : thinkpad.id,
              serialNo: index === 0 ? 'C02XK1A05MD6T' : 'PF4ZTQ07',
              // 00x / 01x / 02x are the employees' machines and 03x the ones
              // received from the demo purchase order, so IT's own start at 04x.
              name: `SG-LT-04${index}`,
              departmentId: itDepartment.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-300),
              purchasePrice: index === 0 ? 15999 : 9899,
              warrantyEndDate: daysFromNow(795),
              attributes:
                index === 0
                  ? {
                      os: 'macOS 15.6',
                      cpu: 'Apple M3',
                      memory: '16 GB',
                      storage: '512 GB',
                      macAddress: 'a4:83:e7:15:25:35',
                      hostname: 'SG-LT-040',
                      screenSize: '14',
                    }
                  : {
                      os: 'Windows 11 Pro',
                      cpu: 'Intel Core Ultra 5 125U',
                      memory: '32 GB',
                      storage: '1 TB',
                      macAddress: 'a4:83:e7:16:26:36',
                      hostname: 'SG-LT-041',
                      screenSize: '14',
                    },
            }),
          );
        }

        // A laptop, a monitor and a phone: a real desk rather than a single
        // row.
        const deskOwner = staff.get('writer');
        const deskDevices: Row[] = [];
        if (deskOwner) {
          deskDevices.push(
            await device({
              modelId: mbp.id,
              serialNo: 'C02XK1A06MD6T',
              name: 'SG-LT-042',
              departmentId: itDepartment.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-420),
              purchasePrice: 15999,
              warrantyEndDate: daysFromNow(675),
              attributes: {
                os: 'macOS 15.6',
                cpu: 'Apple M3',
                memory: '32 GB',
                storage: '1 TB',
                macAddress: 'a4:83:e7:17:27:37',
                hostname: 'SG-LT-042',
                screenSize: '14',
              },
            }),
            await device({
              modelId: u2723.id,
              serialNo: 'CN0F5K7Y3010',
              name: 'SG-MON-004',
              departmentId: itDepartment.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-420),
              purchasePrice: 4299,
              warrantyEndDate: daysFromNow(675),
              attributes: {
                screenSize: '27',
                resolution: '3840×2160',
                inputs: 'HDMI, DisplayPort, USB-C',
              },
            }),
            await device({
              modelId: iphone.id,
              serialNo: 'F2LVX4Q9PLK0',
              name: 'SG-PH-002',
              departmentId: itDepartment.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-260),
              purchasePrice: 5999,
              warrantyEndDate: daysFromNow(105),
              attributes: {
                imei: '356789104512346',
                phoneNumber: '138 0000 0002',
                carrier: 'China Mobile',
              },
            }),
          );
        }

        // What the kits ask of the people above that they did not have yet
        // (2026-10-16): a monitor each for the backend engineer, the QA
        // engineer, the first asset manager and IT support, bought with the
        // third floor's monitors, and a phone for the sales manager.
        const monitorAttributes = {
          screenSize: '27',
          resolution: '3840×2160',
          inputs: 'HDMI, DisplayPort, USB-C',
        };
        const deskMonitors: Row[] = [];
        for (let index = 0; index < 4; index += 1)
          deskMonitors.push(
            await device({
              modelId: u2723.id,
              serialNo: `CN0F5K7Y${3020 + index}`,
              name: `SG-MON-01${index}`,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(-300),
              purchasePrice: 4299,
              warrantyEndDate: daysFromNow(795),
              attributes: monitorAttributes,
            }),
          );
        const salesPhone = await device({
          modelId: iphone.id,
          serialNo: 'HG7Q2X01PLM',
          name: 'SG-PH-003',
          departmentId: sales.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-1100),
          purchasePrice: 5999,
          warrantyEndDate: daysFromNow(-370),
          attributes: {
            imei: '356789104512347',
            phoneNumber: '138 0000 0003',
            carrier: 'China Mobile',
          },
        });

        // The crew's own equipment, bought ahead of their first day in the
        // batch that covered it (two-monthly), or — for those who started
        // before the model was sold — in the refresh that brought it. Their
        // serials sort after the devices above, so the MDM situations the
        // demo picks by position keep their devices.
        const crewDevices = new Map<number, Row[]>();
        const boughtFor = (spec: CrewSpec, earliest: number) =>
          Math.max(Math.floor((-spec.hired - 7) / 60) * 60, earliest);
        // A warranty does not end inside the 30-day window by accident: the
        // ones ending soon are the demo's chosen few.
        const warrantyFrom = (day: number, length: number) => {
          const end = day + length;
          return daysFromNow(end >= -3 && end <= 35 ? end + 60 : end);
        };
        const hex = (value: number) => value.toString(16).padStart(2, '0');
        let computerNo = 0;
        let monitorNo = 0;
        let phoneNo = 0;
        for (const [index, spec] of CREW.entries()) {
          const kit = crewKit(spec);
          const own: Row[] = [];
          const departmentId = (await seededIn('departments', spec.department))
            .id;
          const locationId = spec.japan ? japan.id : floor3.id;
          // A successor takes over their predecessor's, below.
          if (spec.inherits === undefined) {
            computerNo += 1;
            const n = String(computerNo).padStart(2, '0');
            const name = `SG-LT-1${n}`;
            const laptop =
              kit === 'engineering' || kit === 'product'
                ? {
                    model: mbp,
                    earliest: -1050,
                    serialNo: `XQ7C${n}MD6T`,
                    price: 15999,
                    os: 'macOS 15.6',
                    mac: `a4:83:e7:60:${hex(computerNo)}:01`,
                    warrantyDays: 1095,
                  }
                : kit === 'office'
                  ? {
                      model: thinkpad,
                      earliest: -880,
                      serialNo: `R90${n}K7T`,
                      price: 8499,
                      os: 'Windows 11 24H2',
                      mac: `b0:4f:13:60:${hex(computerNo)}:03`,
                      // The office ThinkPads came with Lenovo's one-year
                      // warranty and were never extended (2026-10-20), so
                      // the older ones are in use out of warranty, as old
                      // laptops are in most companies.
                      warrantyDays: 365,
                    }
                  : {
                      model: air,
                      earliest: -940,
                      serialNo: `XR2H${n}Q6LR`,
                      price: 9999,
                      os: 'macOS 15.6',
                      mac: `a4:83:e7:60:${hex(computerNo)}:02`,
                      warrantyDays: 1095,
                    };
            const day = boughtFor(spec, laptop.earliest);
            own.push(
              await device({
                modelId: laptop.model.id,
                serialNo: laptop.serialNo,
                name,
                departmentId,
                locationId,
                vendorId: reseller.id,
                purchaseDate: daysFromNow(day),
                purchasePrice: laptop.price,
                warrantyEndDate: warrantyFrom(day, laptop.warrantyDays),
                attributes: {
                  os: laptop.os,
                  macAddress: laptop.mac,
                  hostname: name,
                },
              }),
            );
            if (crewWants.monitor(spec)) {
              monitorNo += 1;
              const m = String(monitorNo).padStart(2, '0');
              const bought = boughtFor(spec, -1450);
              own.push(
                await device({
                  modelId: u2723.id,
                  serialNo: `CN0F5K7Y31${m}`,
                  name: `SG-MON-1${m}`,
                  departmentId,
                  locationId,
                  vendorId: reseller.id,
                  purchaseDate: daysFromNow(bought),
                  purchasePrice: 4299,
                  warrantyEndDate: warrantyFrom(bought, 1095),
                  attributes: monitorAttributes,
                }),
              );
            }
            if (crewWants.phone(spec)) {
              phoneNo += 1;
              const p = String(phoneNo).padStart(2, '0');
              const bought = boughtFor(spec, -1100);
              own.push(
                await device({
                  modelId: iphone.id,
                  serialNo: `HG7R${p}Q9PLM`,
                  name: `SG-PH-1${p}`,
                  departmentId,
                  locationId,
                  vendorId: reseller.id,
                  purchaseDate: daysFromNow(bought),
                  purchasePrice: 5999,
                  warrantyEndDate: warrantyFrom(bought, 730),
                  attributes: {
                    imei: `3567891046${String(10000 + phoneNo * 37)}`,
                    phoneNumber: spec.japan
                      ? `+81 90 7310 02${p}`
                      : `138 0000 01${p}`,
                    carrier: spec.japan ? 'NTT docomo' : 'China Mobile',
                  },
                }),
              );
            }
          }
          crewDevices.set(index, own);
        }

        // The orders those devices came in on (2026-10-16): they were on the
        // books before ITAM, bought in batches, so each batch — one vendor,
        // one day — is a completed order with a line per model and a receipt
        // per device, and a device names its order as one received here does.
        // Numbered before the demo's own orders, as the older ones.
        if (dependencies.numbering) {
          const tracked = (
            await database
              .query()
              .selectFrom('demoRecords')
              .select('recordId')
              .where('collection', '=', 'devices')
              .execute<{ recordId: string }>()
          ).map((row) => row.recordId);
          const unordered = tracked.length
            ? await database
                .query()
                .selectFrom('devices')
                .select([
                  'id',
                  'modelId',
                  'vendorId',
                  'departmentId',
                  'purchaseDate',
                  'purchasePrice',
                  'currency',
                ])
                .where('id', 'in', tracked)
                .where('purchaseOrderId', 'is', null)
                .where('vendorId', 'is not', null)
                .where('purchaseDate', 'is not', null)
                .execute<Row>()
            : [];
          const batches = new Map<string, Row[]>();
          for (const row of unordered) {
            const key = `${String(row.vendorId)}|${String(row.purchaseDate)}`;
            batches.set(key, [...(batches.get(key) ?? []), row]);
          }
          // Oldest first, so the numbers run with the dates.
          const ordered = [...batches.values()].sort((a, b) =>
            String(a[0]?.purchaseDate).localeCompare(
              String(b[0]?.purchaseDate),
            ),
          );
          for (const batch of ordered) {
            const first = batch[0];
            const day = String(first.purchaseDate);
            const at = new Date(`${day}T09:00:00`);
            const orderId = crypto.randomUUID();
            await database
              .query()
              .insertInto('purchaseOrders')
              .values({
                id: orderId,
                orderNo: await dependencies.numbering.next('purchaseOrder'),
                reason: 'other',
                description: texts.historicalOrder,
                departmentId: asText(first.departmentId) ?? null,
                vendorId: String(first.vendorId),
                estimatedTotal: batch.reduce(
                  (sum, row) => sum + Number(row.purchasePrice ?? 0),
                  0,
                ),
                currency: asText(first.currency) ?? null,
                status: 'completed',
                orderedAt: day,
                expectedAt: day,
                receivedAt: day,
                ownerId: writerId,
                createdById: writerId,
                createdAt: at,
                updatedAt: at,
              })
              .execute();
            await track('purchaseOrders', { id: orderId });
            const byModel = new Map<string, Row[]>();
            for (const row of batch)
              byModel.set(String(row.modelId), [
                ...(byModel.get(String(row.modelId)) ?? []),
                row,
              ]);
            let sort = 0;
            for (const [modelId, rows] of byModel) {
              const lineId = crypto.randomUUID();
              await database
                .query()
                .insertInto('purchaseOrderLines')
                .values({
                  id: lineId,
                  purchaseOrderId: orderId,
                  itemType: 'device',
                  modelId,
                  quantity: rows.length,
                  unitPrice: Number(rows[0]?.purchasePrice ?? 0),
                  receivedQuantity: rows.length,
                  sort: sort++,
                  createdAt: at,
                  updatedAt: at,
                })
                .execute();
              for (const row of rows) {
                await database
                  .query()
                  .insertInto('purchaseReceipts')
                  .values({
                    id: crypto.randomUUID(),
                    purchaseOrderId: orderId,
                    lineId,
                    quantity: 1,
                    generatedType: 'device',
                    generatedId: String(row.id),
                    notes: null,
                    actorId: writerId,
                    createdAt: at,
                  })
                  .execute();
              }
            }
            await database
              .query()
              .updateTable('devices')
              .set({ purchaseOrderId: orderId })
              .where(
                'id',
                'in',
                batch.map((row) => String(row.id)),
              )
              .execute();
          }
        }

        await reached(30);
        // Idle: bought long ago, never assigned — make its updatedAt old so the idle rule sees it.
        await database
          .query()
          .updateTable('devices')
          .set({ updatedAt: new Date(Date.now() - 200 * DAY) })
          .where('id', '=', String(idleLaptop.id))
          .execute();

        // Assignments, each on its day (2026-10-16): a device goes out a few
        // days after it is bought, or when the person it is for joins, and a
        // few changed hands on the way — so a three-year-old laptop's history
        // reads as three years of use.
        const assign = async (
          deviceId: unknown,
          personId: unknown,
          day?: number,
        ) => {
          if (day !== undefined) await on(day);
          return devices.assign(
            String(deviceId),
            {
              targetType: 'person',
              targetId: String(personId),
            },
            context,
            all('devices', 'assign'),
          );
        };
        const giveBack = async (deviceId: unknown, day: number) => {
          await on(day);
          return devices.return(
            String(deviceId),
            { condition: texts.returnedGood, locationId: String(warehouse.id) },
            context,
            all('devices', 'return'),
          );
        };
        const supportPerson = staff.get('support');
        await assign(laptops[0].id, liNa.id, -1055);
        await assign(laptops[1].id, zhangWei.id, -1055);
        // The third went to IT support first; it came back when he moved to
        // his ThinkPad, and went to the QA engineer who had just joined.
        if (supportPerson) {
          await assign(laptops[2].id, supportPerson.id, -1054);
          await giveBack(laptops[2].id, -296);
        }
        await assign(laptops[2].id, liuYang.id, -288);
        await assign(laptops[3].id, wangFang.id, -1054);
        await assign(airs[0].id, zhaoMin.id, -145);
        await assign(thinkpads[0].id, liuYang.id, -55);
        await assign(expiredLaptop.id, chenJie.id, -1495);
        // A second thing in the leaver's hands, this one answering to 吴静,
        // who writes the demo: their laptop is at the repair shop and answers
        // to IT support, so without this somebody signed in as an asset
        // manager has nothing on the recovery they can actually hand back.
        await assign(airs[1].id, chenJie.id, -140);
        await assign(monitors[0].id, liNa.id, -295);
        await assign(monitors[1].id, zhaoMin.id, -295);
        await assign(deskPc.id, wangFang.id, -495);
        await assign(mobile.id, zhaoMin.id, -195);
        for (const [key, laptop] of staffLaptops)
          await assign(
            laptop.id,
            staff.get(key)!.id,
            key === 'approver' ? -298 : -295,
          );
        if (deskOwner)
          for (const owned of deskDevices)
            await assign(owned.id, deskOwner.id, dayOf(owned.purchaseDate) + 2);
        // The monitors and the phone their kits asked for (2026-10-16).
        for (const [index, [holder, day]] of (
          [
            [zhangWei, -295],
            [liuYang, -287],
            [staff.get('approver'), -298],
            [supportPerson, -294],
          ] as const
        ).entries())
          if (holder) await assign(deskMonitors[index].id, holder.id, day);
        await assign(salesPhone.id, wangFang.id, -1097);
        // The crew's, on their first day — or a few days after a refresh
        // bought them — and a former employee's back on the day they left,
        // then on to whoever took their place.
        for (const [index, spec] of CREW.entries())
          for (const owned of crewDevices.get(index) ?? [])
            await assign(
              owned.id,
              crew[index].id,
              Math.max(dayOf(owned.purchaseDate) + 3, -spec.hired),
            );
        for (const [index, spec] of CREW.entries())
          if (spec.left !== undefined)
            for (const owned of crewDevices.get(index) ?? [])
              await giveBack(owned.id, -spec.left);
        for (const [index, spec] of CREW.entries())
          if (spec.inherits !== undefined)
            for (const owned of crewDevices.get(spec.inherits) ?? [])
              await assign(owned.id, crew[index].id, -spec.hired);
        // Shared equipment lives at its location rather than with a person.
        const assignTo = async (
          deviceId: unknown,
          locationId: unknown,
          day: number,
        ) => {
          await on(day);
          return devices.assign(
            String(deviceId),
            {
              targetType: 'location',
              targetId: String(locationId),
            },
            context,
            all('devices', 'assign'),
          );
        };
        await assignTo(rack.id, serverRoom.id, -797);
        await assignTo(coreSwitch.id, serverRoom.id, -897);
        await assignTo(vm.id, serverRoom.id, -99);
        await assignTo(officePrinter.id, floor3.id, -598);
        // A loan's due date. The service takes none in the past, so a loan
        // dated back is made due in three days and its date is corrected
        // afterwards: on the device, on the loan period and in the history
        // line that names it.
        const dueOn = async (deviceId: unknown, due: string) => {
          const id = String(deviceId);
          await database
            .query()
            .updateTable('devices')
            .set({ expectedReturnDate: due })
            .where('id', '=', id)
            .execute();
          const period = await database
            .query()
            .selectFrom('allocations')
            .select(['id'])
            .where('subjectId', '=', id)
            .where('action', '=', 'loan')
            .orderBy('createdAt', 'desc')
            .executeTakeFirst<Row>();
          if (period)
            await database
              .query()
              .updateTable('allocations')
              .set({ expectedReturnDate: due })
              .where('id', '=', String(period.id))
              .execute();
          const line = await database
            .query()
            .selectFrom('historyEvents')
            .select(['id', 'summary', 'payload'])
            .where('subjectId', '=', id)
            .where('type', '=', 'loan')
            .orderBy('createdAt', 'desc')
            .executeTakeFirst<Row>();
          if (line) {
            const payload = decodeRow(line, {
              jsonFields: ['payload'],
            }).payload;
            await database
              .query()
              .updateTable('historyEvents')
              .set({
                summary: String(line.summary).replace(/due \S*$/, `due ${due}`),
                payload: {
                  ...(payload && typeof payload === 'object' ? payload : {}),
                  expectedReturnDate: due,
                },
              })
              .where('id', '=', String(line.id))
              .execute();
          }
        };
        // The spare MacBook Pro lent out before: a week with the QA engineer
        // for a customer visit, back a day early.
        await on(-260);
        await devices.loan(
          String(laptops[4].id),
          {
            targetType: 'person',
            targetId: String(liuYang.id),
            expectedReturnDate: daysFromNow(3),
          },
          context,
          all('devices', 'loan'),
        );
        await dueOn(laptops[4].id, daysFromNow(-251));
        await on(-252);
        await devices.return(
          String(laptops[4].id),
          { condition: texts.returnedLoan },
          context,
          all('devices', 'return'),
        );
        // A loan overdue for a week: lent for a few days, then the return
        // date is moved into the past (the service refuses a past date).
        await on(-10);
        await devices.loan(
          String(laptops[4].id),
          {
            targetType: 'person',
            targetId: String(zhaoMin.id),
            expectedReturnDate: daysFromNow(3),
          },
          context,
          all('devices', 'loan'),
        );
        await dueOn(laptops[4].id, daysFromNow(-7));
        // Audited long ago: the batch was last counted 400 days back.
        await database
          .query()
          .updateTable('devices')
          .set({ lastAuditedAt: new Date(Date.now() - 400 * DAY) })
          .where(
            'id',
            'in',
            laptops.map((row) => String(row.id)),
          )
          .execute();
        // The equipment the kits added (2026-10-16) was counted at last
        // year's desk count, so 盘点逾期 keeps to the devices the demo means
        // to be overdue rather than every desk in the company; only what
        // was bought before it.
        const counted = [
          ...deskMonitors,
          salesPhone,
          ...[...crewDevices.values()].flat(),
        ]
          .filter((row) => dayOf(row.purchaseDate) < -100)
          .map((row) => String(row.id));
        if (counted.length > 0)
          await database
            .query()
            .updateTable('devices')
            .set({ lastAuditedAt: new Date(Date.now() - 96 * DAY) })
            .where('id', 'in', counted)
            .execute();

        // Stock (2026-10-16): each item was stocked one to three years ago
        // and has been issued, returned, used up and topped up since, so its
        // movement log and its holders' pages read as the months they took.
        // What it ends with is what the demo has always shown: one accessory
        // below its minimum, consumables used on the third floor, components
        // installed on laptops, an accessory and a seat in the leaver's hands.
        const stockItem = async (input: Row, day: number) => {
          await on(day);
          return track(
            'stockItems',
            await stock.create(
              { locationId: warehouse.id, ...input },
              context,
              all('stockItems', 'create'),
            ),
          );
        };
        type Holder = 'person' | 'location' | 'device';
        const issue = async (
          item: Row,
          holderType: Holder,
          holder: Row,
          quantity: number,
          day: number,
        ) => {
          await on(day);
          await stock.issue(
            String(item.id),
            { holderType, holderId: String(holder.id), quantity },
            context,
            all('stockItems', 'issue'),
          );
        };
        const takeBack = async (
          item: Row,
          holderType: Holder,
          holder: Row,
          day: number,
        ) => {
          await on(day);
          await stock.takeBack(
            String(item.id),
            { holderType, holderId: String(holder.id), quantity: 1 },
            context,
            all('stockItems', 'return'),
          );
        };
        const stockIn = async (
          item: Row,
          quantity: number,
          notes: string,
          day: number,
        ) => {
          await on(day);
          await stock.stockIn(
            String(item.id),
            { quantity, notes },
            context,
            all('stockItems', 'stockIn'),
          );
        };
        // One each for the crew the kits give one, on their first day or the
        // day after the item was stocked; a former employee's came back when
        // they left.
        const toCrew = async (
          item: Row,
          stockedOn: number,
          wants: (spec: CrewSpec) => boolean,
        ) => {
          for (const [index, spec] of CREW.entries()) {
            if (!wants(spec)) continue;
            const day = Math.max(-spec.hired + 1, stockedOn + 1);
            if (spec.left !== undefined && day > -spec.left - 60) continue;
            await issue(item, 'person', crew[index], 1, day);
            if (spec.left !== undefined)
              await takeBack(item, 'person', crew[index], -spec.left);
          }
        };
        const approver = staff.get('approver')!;
        const writer = staff.get('writer')!;
        const support = staff.get('support')!;
        // Below its minimum, as it has been for months: one broke, and the
        // reorder is still waiting to be placed.
        const mice = await stockItem(
          {
            kind: 'accessory',
            name: 'Logitech MX Master 3S',
            categoryId: mouseCat.id,
            modelId: mxMaster.id,
            manufacturerId: mxMaster.manufacturer.id,
            // Enough for everybody the kits give one (2026-10-16), and still
            // below the minimum at the end, as before.
            totalQuantity: 7 + crewCount(crewWants.mouse),
            minimumQuantity: 5,
          },
          -900,
        );
        await issue(mice, 'person', zhangWei, 1, -880);
        await issue(mice, 'person', liNa, 1, -870);
        await on(-300);
        await stock.adjust(
          String(mice.id),
          { quantity: -1, reason: 'damaged', notes: texts.miceDamaged },
          context,
          all('stockItems', 'update'),
        );
        await issue(mice, 'person', liuYang, 1, -285);
        await toCrew(mice, -900, crewWants.mouse);
        // Stock bought through an order: the order runs request → approval →
        // ordered → received, each on its day, so the item shows a purchase
        // record with the order's vendor and price. `into` is an item already
        // in stock the delivery joins.
        const purchasedStock = async (order: {
          readonly description: string;
          readonly itemType: 'accessory' | 'consumable' | 'component';
          readonly modelId: string;
          readonly quantity: number;
          readonly unitPrice: number;
          readonly orderedDaysAgo: number;
          readonly into?: Row;
          readonly name?: string;
          readonly minimumQuantity?: number;
        }): Promise<Row> => {
          await on(-order.orderedDaysAgo - 6);
          const created = await track(
            'purchaseOrders',
            await procurement.create(
              {
                reason: 'stockReplenishment',
                description: order.description,
                neededBy: daysFromNow(-order.orderedDaysAgo + 14),
                vendorId: reseller.id,
                departmentId: rnd.id,
              },
              context,
              all('purchaseOrders', 'create'),
            ),
          );
          const id = String(created.id);
          await procurement.setLines(
            id,
            [
              {
                itemType: order.itemType,
                modelId: order.modelId,
                quantity: order.quantity,
                unitPrice: order.unitPrice,
              },
            ],
            context,
            all('purchaseOrders', 'update'),
          );
          await procurement.submit(
            id,
            approverId,
            context,
            all('purchaseOrders', 'submit'),
          );
          await on(-order.orderedDaysAgo - 5);
          if (
            (await procurement.get(id, all('purchaseOrders', 'read')))
              ?.status === 'pendingApproval'
          )
            await procurement.decide(
              id,
              'approved',
              texts.approval,
              { actorId: approverId, sourceType: 'demo' },
              all('purchaseOrders', 'approve'),
            );
          await on(-order.orderedDaysAgo);
          await procurement.markOrdered(
            id,
            {
              orderedAt: daysFromNow(-order.orderedDaysAgo),
              expectedAt: daysFromNow(-order.orderedDaysAgo + 7),
            },
            context,
            all('purchaseOrders', 'order'),
          );
          const lines = await procurement.lines(id);
          // The day after it was due; the latest arrivals are moved again
          // below, with the rows the receipt wrote.
          await on(-order.orderedDaysAgo + 8);
          await procurement.receive(
            id,
            order.into
              ? {
                  lineId: String(lines[0].id),
                  quantity: order.quantity,
                  stockItemId: String(order.into.id),
                }
              : {
                  lineId: String(lines[0].id),
                  quantity: order.quantity,
                  locationId: String(warehouse.id),
                  extra: {
                    name: order.name,
                    minimumQuantity: order.minimumQuantity,
                  },
                },
            context,
            all('purchaseOrders', 'receive'),
          );
          if (order.into) return order.into;
          const itemId = (await procurement.generated(id)).find(
            (entry) => entry.type === 'stockItem',
          )?.id as string | undefined;
          if (!itemId) throw new Error(`${order.description}: no stock item`);
          return track('stockItems', { id: itemId });
        };
        await reached(40);
        // An entitlement bought through an order: the receipt is its purchase
        // record (the entitlement itself keeps no price).
        const purchasedEntitlement = async (order: {
          readonly description: string;
          readonly softwareProductId: string;
          readonly quantity: number;
          readonly unitPrice: number;
          readonly orderedDaysAgo: number;
          readonly extra: Row;
        }): Promise<Row> => {
          await on(-order.orderedDaysAgo - 6);
          const created = await track(
            'purchaseOrders',
            await procurement.create(
              {
                reason: 'other',
                description: order.description,
                neededBy: daysFromNow(-order.orderedDaysAgo + 14),
                vendorId: reseller.id,
                departmentId: rnd.id,
              },
              context,
              all('purchaseOrders', 'create'),
            ),
          );
          const id = String(created.id);
          await procurement.setLines(
            id,
            [
              {
                itemType: 'perpetual',
                softwareProductId: order.softwareProductId,
                quantity: order.quantity,
                unitPrice: order.unitPrice,
              },
            ],
            context,
            all('purchaseOrders', 'update'),
          );
          await procurement.submit(
            id,
            approverId,
            context,
            all('purchaseOrders', 'submit'),
          );
          await on(-order.orderedDaysAgo - 5);
          if (
            (await procurement.get(id, all('purchaseOrders', 'read')))
              ?.status === 'pendingApproval'
          )
            await procurement.decide(
              id,
              'approved',
              texts.approval,
              { actorId: approverId, sourceType: 'demo' },
              all('purchaseOrders', 'approve'),
            );
          await on(-order.orderedDaysAgo);
          await procurement.markOrdered(
            id,
            {
              orderedAt: daysFromNow(-order.orderedDaysAgo),
              expectedAt: daysFromNow(-order.orderedDaysAgo + 3),
            },
            context,
            all('purchaseOrders', 'order'),
          );
          const lines = await procurement.lines(id);
          await on(-order.orderedDaysAgo + 4);
          await procurement.receive(
            id,
            {
              lineId: String(lines[0].id),
              quantity: order.quantity,
              extra: order.extra,
            },
            context,
            all('purchaseOrders', 'receive'),
          );
          const entitlementId = (await procurement.generated(id)).find(
            (entry) => entry.type === 'entitlement',
          )?.id as string | undefined;
          if (!entitlementId)
            throw new Error(`${order.description}: no entitlement`);
          return track('entitlements', { id: entitlementId });
        };
        // Keyboards from the shelf for two years, topped up by an order for
        // the new desks a month ago.
        const keyboards = await stockItem(
          {
            kind: 'accessory',
            name: 'Logitech MX Keys',
            categoryId: keyboardCat.id,
            modelId: mxKeys.id,
            manufacturerId: mxKeys.manufacturer.id,
            totalQuantity: 5 + crewCount(crewWants.keyboard),
            minimumQuantity: 3,
          },
          -700,
        );
        await issue(keyboards, 'person', liNa, 1, -695);
        await issue(keyboards, 'person', wangFang, 1, -690);
        await issue(keyboards, 'person', writer, 1, -415);
        await purchasedStock({
          description: texts.keyboardOrder,
          itemType: 'accessory',
          modelId: String(mxKeys.id),
          quantity: 8,
          unitPrice: 799,
          orderedDaysAgo: 40,
          into: keyboards,
        });
        for (const holder of [zhangWei, liuYang])
          await issue(keyboards, 'person', holder, 1, -30);
        await toCrew(keyboards, -700, crewWants.keyboard);
        const docks = await stockItem(
          {
            kind: 'accessory',
            name: 'Dell WD22TB4 dock',
            categoryId: dockCat.id,
            modelId: wd22.id,
            manufacturerId: latitude.manufacturer.id,
            totalQuantity: 9 + crewCount(crewWants.dock),
            minimumQuantity: 2,
          },
          -800,
        );
        await issue(docks, 'person', liNa, 1, -795);
        await issue(docks, 'person', zhangWei, 1, -790);
        // The leaver holds one of these too: a dock goes back to stock, which
        // is a different answer from a device's 归还 and from a seat's 回收,
        // and the recovery has to show all three.
        await issue(docks, 'person', chenJie, 1, -700);
        // Docks went out and came back, so returns show in the history.
        await issue(docks, 'person', wangFang, 1, -600);
        await takeBack(docks, 'person', wangFang, -510);
        await issue(docks, 'person', liuYang, 1, -280);
        if (supportPerson) await issue(docks, 'person', supportPerson, 1, -294);
        await toCrew(docks, -800, crewWants.dock);
        const headsets = await stockItem(
          {
            kind: 'accessory',
            name: 'Logitech Zone Vibe 100',
            categoryId: headsetCat.id,
            modelId: zoneVibe.id,
            manufacturerId: mxMaster.manufacturer.id,
            totalQuantity: 11 + crewCount(crewWants.headset),
            minimumQuantity: 3,
          },
          -400,
        );
        await issue(headsets, 'person', wangFang, 1, -390);
        await issue(headsets, 'person', zhaoMin, 1, -325);
        await toCrew(headsets, -400, crewWants.headset);
        // A USB-C hub for travelling, lent for trips and back.
        // Each model and category the stock needs is entered just before
        // the stock that uses it (2026-10-16), not on whichever day the step
        // before ended.
        await on(-541);
        const hubModel = await named('models', {
          name: 'DA310',
          categoryId: dockCat.id,
          manufacturerId: latitude.manufacturer.id,
          code: '470-AEUP',
          ...(await picture('dock.svg')),
          specification: texts.hubSpec,
        });
        const hubs = await stockItem(
          {
            kind: 'accessory',
            name: texts.hubItem,
            categoryId: dockCat.id,
            modelId: hubModel.id,
            manufacturerId: latitude.manufacturer.id,
            totalQuantity: 8,
            minimumQuantity: 2,
          },
          -540,
        );
        await issue(hubs, 'person', wangFang, 1, -400);
        await takeBack(hubs, 'person', wangFang, -380);
        await issue(hubs, 'person', zhaoMin, 1, -320);
        await issue(hubs, 'person', approver, 1, -200);
        await issue(hubs, 'person', zhangWei, 1, -60);
        await takeBack(hubs, 'person', zhangWei, -45);
        // Webcams: one in the third-floor meeting room, the rest with people
        // who present.
        await on(-701);
        const webcamCat = await named('categories', {
          ...MASTER_DEFAULTS.categories,
          name: texts.webcamCategory,
          appliesTo: 'accessory',
        });
        const webcamModel = await named('models', {
          name: 'Brio 4K',
          categoryId: webcamCat.id,
          manufacturerId: mxMaster.manufacturer.id,
          code: '960-001105',
          ...(await picture('webcam.svg')),
          specification: texts.webcamSpec,
        });
        const webcams = await stockItem(
          {
            kind: 'accessory',
            name: texts.webcamItem,
            categoryId: webcamCat.id,
            modelId: webcamModel.id,
            manufacturerId: mxMaster.manufacturer.id,
            totalQuantity: 6,
            minimumQuantity: 1,
          },
          -700,
        );
        await issue(webcams, 'location', floor3, 1, -650);
        await issue(webcams, 'person', wangFang, 1, -640);
        await issue(webcams, 'person', writer, 1, -410);
        await issue(webcams, 'person', liuYang, 1, -280);
        await takeBack(webcams, 'person', liuYang, -100);
        // Consumables are used up where they go: the third floor's printer
        // and desks, a batch at a time.
        const toner = await stockItem(
          {
            kind: 'consumable',
            name: 'HP 58A toner',
            categoryId: tonerCat.id,
            modelId: hpToner.id,
            manufacturerId: hpToner.manufacturer.id,
            totalQuantity: 6,
            minimumQuantity: 4,
          },
          -720,
        );
        await issue(toner, 'location', floor3, 2, -650);
        await stockIn(toner, 6, texts.tonerTopUp, -600);
        for (const day of [-470, -300, -150])
          await issue(toner, 'location', floor3, 2, day);
        await purchasedStock({
          description: texts.tonerOrder,
          itemType: 'consumable',
          modelId: String(hpToner.id),
          quantity: 12,
          unitPrice: 280,
          orderedDaysAgo: 25,
          into: toner,
        });
        for (const day of [-20, -6])
          await issue(toner, 'location', floor3, 2, day);
        const cables = await stockItem(
          {
            kind: 'consumable',
            name: 'USB-C cable 1 m',
            categoryId: cableCat.id,
            modelId: usbCable.id,
            totalQuantity: 40,
            minimumQuantity: 10,
          },
          -500,
        );
        for (const [day, quantity] of [
          [-480, 6],
          [-300, 4],
          [-120, 5],
          [-15, 3],
        ] as const)
          await issue(cables, 'location', floor3, quantity, day);
        const batteries = await stockItem(
          {
            kind: 'consumable',
            name: 'Latitude 5440 battery',
            categoryId: batteryCat.id,
            modelId: laptopBattery.id,
            manufacturerId: latitude.manufacturer.id,
            totalQuantity: 4,
            minimumQuantity: 2,
          },
          -1000,
        );
        // For the Latitude the sales manager had then, and for IT support's.
        await issue(batteries, 'person', wangFang, 1, -600);
        await issue(batteries, 'person', chenJie, 1, -250);
        await on(-401);
        const paperModel = await named('models', {
          name: 'Office Paper A4 80 g',
          categoryId: printSuppliesCat.id,
          manufacturerId: hpToner.manufacturer.id,
          code: 'CHP110',
          ...(await picture('paper.svg')),
          specification: texts.paperSpec,
        });
        const paper = await stockItem(
          {
            kind: 'consumable',
            name: texts.paperItem,
            categoryId: printSuppliesCat.id,
            modelId: paperModel.id,
            manufacturerId: hpToner.manufacturer.id,
            totalQuantity: 40,
            minimumQuantity: 10,
          },
          -400,
        );
        for (const [day, quantity] of [
          [-390, 8],
          [-300, 8],
          [-200, 6],
        ] as const)
          await issue(paper, 'location', floor3, quantity, day);
        await stockIn(paper, 30, texts.paperDelivery, -190);
        for (const [day, quantity] of [
          [-120, 8],
          [-45, 6],
          [-10, 4],
        ] as const)
          await issue(paper, 'location', floor3, quantity, day);
        await on(-601);
        const duracell = await named('manufacturers', { name: 'Duracell' });
        const aaModel = await named('models', {
          name: 'Plus AA',
          categoryId: batteryCat.id,
          manufacturerId: duracell.id,
          code: 'MN1500',
          ...(await picture('duracell-aa.jpg')),
          specification: texts.batterySpec,
        });
        const aaBatteries = await stockItem(
          {
            kind: 'consumable',
            name: texts.batteryItem,
            categoryId: batteryCat.id,
            modelId: aaModel.id,
            manufacturerId: duracell.id,
            totalQuantity: 48,
            minimumQuantity: 12,
          },
          -600,
        );
        await issue(aaBatteries, 'person', zhangWei, 4, -500);
        await issue(aaBatteries, 'location', floor3, 12, -350);
        await issue(aaBatteries, 'person', wangFang, 4, -200);
        await issue(aaBatteries, 'location', floor3, 8, -60);
        const ssd = await stockItem(
          {
            kind: 'component',
            name: '1 TB NVMe SSD',
            categoryId: diskCat.id,
            modelId: ssdModel.id,
            manufacturerId: ssdModel.manufacturer.id,
            totalQuantity: 5,
            minimumQuantity: 2,
          },
          -600,
        );
        await issue(ssd, 'device', laptops[1], 1, -300);
        // A drive went into a laptop and came out again, so the component's
        // log shows an install and an uninstall.
        await issue(ssd, 'device', laptops[2], 1, -200);
        await takeBack(ssd, 'device', laptops[2], -180);
        // A component sits on the leaver's laptop. It is not theirs to give
        // back — a component belongs to the device it is installed on, and
        // goes wherever that goes — so the recovery lists the laptop and not
        // this; what it shows is that recovering a device recovers what is in
        // it.
        await issue(ssd, 'device', airs[1], 1, -100);
        const ram = await stockItem(
          {
            kind: 'component',
            name: '32 GB DDR5 SO-DIMM',
            categoryId: ramCat.id,
            modelId: ramModel.id,
            manufacturerId: ramModel.manufacturer.id,
            totalQuantity: 6,
            minimumQuantity: 2,
          },
          -1000,
        );
        await issue(ram, 'device', expiredLaptop, 1, -900);
        const supportLaptop = staffLaptops.get('support');
        if (supportLaptop) await issue(ram, 'device', supportLaptop, 1, -290);
        await on(-251);
        const bigSsdModel = await named('models', {
          name: '990 PRO 2 TB',
          categoryId: diskCat.id,
          manufacturerId: ssdModel.manufacturer.id,
          code: 'MZ-V9P2T0BW',
          ...(await picture('990-pro.jpg')),
          specification: texts.ssdSpec,
        });
        const bigSsd = await stockItem(
          {
            kind: 'component',
            name: '2 TB NVMe SSD',
            categoryId: diskCat.id,
            modelId: bigSsdModel.id,
            manufacturerId: ssdModel.manufacturer.id,
            totalQuantity: 4,
            minimumQuantity: 1,
          },
          -250,
        );
        await issue(bigSsd, 'device', deskPc, 1, -240);
        if (supportLaptop)
          await issue(bigSsd, 'device', supportLaptop, 1, -150);
        await issue(bigSsd, 'device', thinkpads[0], 1, -53);
        await takeBack(bigSsd, 'device', thinkpads[0], -51);
        await on(-351);
        const smallRamModel = await named('models', {
          name: 'DDR5-5600 16 GB SO-DIMM',
          categoryId: ramCat.id,
          manufacturerId: ramModel.manufacturer.id,
          code: 'CT16G56C46S5',
          ...(await picture('memory.svg')),
          specification: texts.ramSpec,
        });
        const smallRam = await stockItem(
          {
            kind: 'component',
            name: '16 GB DDR5 SO-DIMM',
            categoryId: ramCat.id,
            modelId: smallRamModel.id,
            manufacturerId: ramModel.manufacturer.id,
            totalQuantity: 8,
            minimumQuantity: 2,
          },
          -350,
        );
        await issue(smallRam, 'device', thinkpads[0], 1, -54);
        await issue(smallRam, 'device', thinkpads[1], 1, -54);
        await takeBack(smallRam, 'device', thinkpads[1], -20);
        // The rest of the catalogue (2026-10-20, `CATALOGUE_MODELS`), each
        // on the day it was entered.
        const catalogue: {
          entry: (typeof CATALOGUE_MODELS)[number];
          model: Row;
        }[] = [];
        for (const entry of CATALOGUE_MODELS) {
          await seeded(entry.categoryId);
          await seededIn('manufacturers', entry.manufacturerId);
          await on(entry.day);
          const model = await named('models', {
            name: entry.name,
            categoryId: entry.categoryId,
            manufacturerId: entry.manufacturerId,
            code: entry.code,
            ...(await picture(entry.image)),
            warrantyMonths: entry.warrantyMonths,
            specification:
              entry.spec[locale as DemoLanguage] ?? entry.spec['en-US'],
          });
          catalogue.push({ entry, model });
        }
        // Each catalogue model's assets (`CATALOGUE_ASSETS`), bought three
        // weeks after it was entered.
        const places = { floor3, serverRoom, japan };
        for (const { entry, model } of catalogue) {
          const assets = CATALOGUE_ASSETS[entry.name];
          if (!assets) continue;
          const bought = entry.day + 21;
          if ('stock' in assets) {
            const item = await stockItem(
              {
                kind: assets.stock.kind,
                name: assets.stock.name,
                categoryId: entry.categoryId,
                modelId: model.id,
                manufacturerId: entry.manufacturerId,
                totalQuantity: assets.stock.quantity,
                minimumQuantity: assets.stock.minimum,
              },
              bought,
            );
            // Used since, as all stock is: two went out, one came back. A
            // component goes into a desktop, an accessory to a person.
            const [holderType, firstHolder, secondHolder]: [Holder, Row, Row] =
              assets.stock.kind === 'component'
                ? ['device', deskPc, expiredLaptop]
                : ['person', liNa, zhangWei];
            await issue(item, holderType, firstHolder, 1, bought + 5);
            await issue(item, holderType, secondHolder, 1, bought + 30);
            await takeBack(item, holderType, firstHolder, bought + 60);
            continue;
          }
          for (const spec of assets.devices) {
            const made = await device({
              modelId: model.id,
              serialNo: spec.serialNo,
              name: spec.name,
              locationId: spec.at ? places[spec.at].id : warehouse.id,
              vendorId: reseller.id,
              purchaseDate: daysFromNow(bought),
              purchasePrice: assets.price,
              warrantyEndDate: daysFromNow(
                bought + Math.round(entry.warrantyMonths * 30.44),
              ),
              ...(spec.attributes ? { attributes: spec.attributes } : {}),
            });
            if (spec.at)
              await assignTo(made.id, places[spec.at].id, bought + 2);
          }
        }
        // The models and the maker the demo added have changed since too
        // (2026-10-16): Duracell's site was filled in, the webcam's
        // description now says what comes in the box, Samsung's five-year
        // warranty went on the 2 TB drive and Dell announced the end of the
        // hub. Only those the demo created (`revise`): one of the same name
        // that was there before is left as it was.
        await on(-590);
        await revise('manufacturers', duracell, {
          website: 'https://www.duracell.com',
        });
        // The webcam category the demo made gained a warranty and, once the
        // meeting rooms lent them, a yearly count (2026-10-16).
        await on(-660);
        await revise('categories', webcamCat, { warrantyMonths: 24 });
        await on(-649);
        await revise('categories', webcamCat, { auditCycleDays: 365 });
        await on(-300);
        await revise('models', webcamModel, {
          specification: texts.webcamSpecUpdated,
        });
        await on(-240);
        await revise('models', bigSsdModel, { warrantyMonths: 60 });
        await on(-90);
        await revise('models', hubModel, { eolDate: daysFromNow(75) });

        // Seats, each on its day: given out when the licence came in or the
        // person joined, and taken back when somebody stopped using one.
        const seatsTo = async (
          entitlement: Row,
          seats: readonly Row[],
          day: number,
        ) => {
          await on(day);
          await entitlements.assignSeats(
            String(entitlement.id),
            seats.map((holder) =>
              holder.deviceNo !== undefined
                ? { holderType: 'device', holderId: String(holder.id) }
                : {
                    holderType: 'person',
                    holderId: String(holder.id),
                    account: asText(holder.email) ?? null,
                  },
            ),
            context,
            all('entitlements', 'assignSeat'),
          );
        };
        const reclaimFrom = async (
          entitlement: Row,
          holder: Row,
          day: number,
        ) => {
          await on(day);
          const seat = (await entitlements.seats(String(entitlement.id))).find(
            (row) =>
              String(row.holderId) === String(holder.id) && !row.releasedAt,
          );
          if (seat)
            await entitlements.reclaimSeats(
              String(entitlement.id),
              [String(seat.id)],
              context,
              all('entitlements', 'assignSeat'),
            );
        };
        const subscription = async (input: Row, day: number) => {
          await on(day);
          return track(
            'entitlements',
            await entitlements.create(
              {
                kind: 'subscription',
                ownerId: managerUserId ?? writerId,
                ...input,
              },
              context,
              all('entitlements', 'create'),
            ),
          );
        };

        // Perpetual entitlements: one over-allocated. A subscription: seats
        // nobody uses.
        const officeLicense = await purchasedEntitlement({
          description: texts.officeOrder,
          softwareProductId: String(office.id),
          quantity: 4,
          unitPrice: 2450,
          orderedDaysAgo: 500,
          extra: {
            name: texts.officeLicense,
            licensingModel: 'perDevice',
            // The licence never expires; its maintenance does, in six weeks.
            // Inside the 30-day window, so 维保即将到期 has something to show.
            maintenanceExpiryDate: daysFromNow(20),
          },
        });
        await seatsTo(
          officeLicense,
          [laptops[0], laptops[1], laptops[2], laptops[3]],
          -490,
        );
        // Over-allocated: the seat count is reduced below what is assigned.
        await on(-120);
        await entitlements.update(
          String(officeLicense.id),
          { seatCount: 3 },
          context,
          all('entitlements', 'update'),
        );
        // A per-user perpetual entitlement, so a person's page shows every kind
        // of holding: devices, accessories, a seat and a subscription account.
        const ideLicense = await purchasedEntitlement({
          description: texts.ideOrder,
          softwareProductId: String(intellij.id),
          // Two to spare beyond the engineers who have one (2026-10-16).
          quantity: 5 + crewCount(crewWants.intellij),
          unitPrice: 700,
          orderedDaysAgo: 200,
          extra: {
            name: texts.ideLicense,
            licensingModel: 'perUser',
          },
        });
        await seatsTo(ideLicense, [liNa, zhangWei, liuYang], -195);
        // Seats for the crew their kits give one, on their first day or the
        // day the licence came in; a former employee's taken back when they
        // left.
        const seatsToCrew = async (
          entitlement: Row,
          from: number,
          wants: (spec: CrewSpec) => boolean,
        ) => {
          for (const [index, spec] of CREW.entries()) {
            if (!wants(spec)) continue;
            const day = Math.max(-spec.hired + 2, from);
            if (spec.left !== undefined && day > -spec.left - 60) continue;
            await seatsTo(entitlement, [crew[index]], day);
            if (spec.left !== undefined)
              await reclaimFrom(entitlement, crew[index], -spec.left);
          }
        };
        await seatsToCrew(ideLicense, -195, crewWants.intellij);
        // Two subscriptions whose dates fall inside the week: one that will
        // charge (yearly auto-renew) and one that will stop (nothing renews
        // it). They are opposite acts, and the workbench lists them apart.
        // The yearly one is where the kits' Zoom seats come from (2026-10-16):
        // one for everybody whose kit asks for one — but the backend
        // engineer, who still holds one on the plan that ended — and two to
        // spare for the joiners.
        const zoomYearly = await subscription(
          {
            name: texts.zoomYearlyLicense,
            softwareProductId: zoom.id,
            billingModel: 'perSeat',
            seatCount: 9 + crewCount(crewWants.zoom),
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            expiryDate: daysFromNow(5),
            autoRenew: true,
          },
          -360,
        );
        await seatsTo(
          zoomYearly,
          [liNa, wangFang, approver, writer, support],
          -358,
        );
        await seatsTo(zoomYearly, [zhaoMin], -328);
        await seatsTo(zoomYearly, [liuYang], -288);
        await seatsToCrew(zoomYearly, -358, crewWants.zoom);
        await subscription(
          {
            name: texts.figmaTrialLicense,
            softwareProductId: figma.id,
            billingModel: 'flat',
            billingCycle: 'year',
            unitPrice: 900,
            currency: 'USD',
            expiryDate: daysFromNow(6),
            autoRenew: false,
          },
          -24,
        );
        const figmaSub = await subscription(
          {
            name: 'Figma Organization',
            softwareProductId: figma.id,
            billingModel: 'perSeat',
            seatCount: 6 + crewCount(crewWants.figma),
            billingCycle: 'month',
            unitPrice: 45,
            currency: 'USD',
            expiryDate: daysFromNow(25),
            autoRenew: true,
          },
          -400,
        );
        await seatsTo(figmaSub, [liNa, zhangWei], -398);
        await seatsTo(figmaSub, [wangFang], -300);
        await seatsTo(figmaSub, [chenJie], -250);
        await seatsToCrew(figmaSub, -398, crewWants.figma);

        // A subscription the team stopped: not renewing, past its date, and
        // one seat never taken back — the "ended" reminder.
        const zoomSub = await subscription(
          {
            name: 'Zoom Workplace Pro',
            softwareProductId: zoom.id,
            billingModel: 'perSeat',
            seatCount: 3,
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            expiryDate: daysFromNow(-10),
            autoRenew: false,
          },
          -375,
        );
        await seatsTo(zoomSub, [zhangWei], -370);

        // Microsoft 365 for two years: renewed by hand each year, a few days
        // before it ran out, and grown by four seats at the last renewal.
        const m365 = await subscription(
          {
            name: texts.m365License,
            softwareProductId: (
              await seededIn('softwareProducts', 'sp-microsoft-365')
            ).id,
            billingModel: 'perSeat',
            // Everybody has one (2026-10-16), five to spare once it grew.
            seatCount: 9 + crewCount(() => true),
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            startDate: daysFromNow(-760),
            expiryDate: daysFromNow(-395),
            autoRenew: false,
          },
          -760,
        );
        await seatsTo(
          m365,
          [approver, writer, support, liNa, zhangWei, wangFang],
          -755,
        );
        await seatsToCrew(m365, -755, () => true);
        const renew = async (
          entitlement: Row,
          expiryDate: string,
          day: number,
        ) => {
          await on(day);
          await entitlements.update(
            String(entitlement.id),
            { expiryDate },
            context,
            all('entitlements', 'update'),
          );
        };
        await renew(m365, daysFromNow(-30), -400);
        await seatsTo(m365, [zhaoMin], -328);
        await seatsTo(m365, [liuYang], -288);
        await renew(m365, daysFromNow(335), -33);
        await on(-33);
        await entitlements.adjustSeats(
          String(m365.id),
          { quantity: 4, notes: texts.m365Growth },
          context,
          all('entitlements', 'update'),
        );
        // Adobe Creative Cloud: a seat that went unused was taken back and
        // given to the presales consultant; one is kept free for the designer
        // joining next week.
        const adobe = await subscription(
          {
            name: texts.adobeLicense,
            softwareProductId: (
              await seededIn('softwareProducts', 'sp-adobe-creative-cloud')
            ).id,
            billingModel: 'perSeat',
            seatCount: 3 + crewCount(crewWants.adobe),
            billingCycle: 'year',
            unitPrice: 1080,
            currency: 'USD',
            startDate: daysFromNow(-620),
            expiryDate: daysFromNow(110),
            autoRenew: true,
          },
          -620,
        );
        await seatsTo(adobe, [liNa, wangFang], -615);
        await reclaimFrom(adobe, liNa, -210);
        await seatsTo(adobe, [zhaoMin], -205);
        await seatsToCrew(adobe, -615, crewWants.adobe);
        // ChatGPT Team: the QA engineer's seat moved to presales.
        const chatgpt = await subscription(
          {
            name: texts.chatgptLicense,
            softwareProductId: (
              await seededIn('softwareProducts', 'sp-chatgpt')
            ).id,
            billingModel: 'perSeat',
            seatCount: 5,
            billingCycle: 'year',
            unitPrice: 300,
            currency: 'USD',
            startDate: daysFromNow(-280),
            expiryDate: daysFromNow(85),
            autoRenew: true,
          },
          -280,
        );
        await seatsTo(chatgpt, [approver, zhangWei, liuYang], -278);
        await reclaimFrom(chatgpt, liuYang, -90);
        await seatsTo(chatgpt, [zhaoMin], -88);
        // Windows 11 Pro upgrades, per device: the leaver's old Latitude gave
        // its licence up to the new ThinkPad.
        const windowsProduct = await seededIn(
          'softwareProducts',
          'sp-windows-11-pro',
        );
        await on(-520);
        const windows = await track(
          'entitlements',
          await entitlements.create(
            {
              kind: 'perpetual',
              name: texts.windowsLicense,
              softwareProductId: windowsProduct.id,
              licensingModel: 'perDevice',
              seatCount: 5,
              ownerId: managerUserId ?? writerId,
            },
            context,
            all('entitlements', 'create'),
          ),
        );
        await seatsTo(windows, [expiredLaptop], -515);
        await seatsTo(windows, [deskPc], -495);
        if (supportLaptop) await seatsTo(windows, [supportLaptop], -294);
        await reclaimFrom(windows, expiredLaptop, -58);
        await seatsTo(windows, [thinkpads[0]], -55);

        // The two who left long ago, once everything of theirs is back: a
        // leave date in the past marks them left on that day, the way
        // entering one does, with nothing left to hand over.
        for (const [index, spec] of CREW.entries())
          if (spec.left !== undefined) {
            await on(-spec.left);
            await masterData.update(
              'people',
              String(crew[index].id),
              { leaveDate: daysFromNow(-spec.left) },
              writerId,
              all('people', 'update'),
            );
          }

        // A purchase order that went through the chain and was received.
        await on(-36);
        const order = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'newHire',
              description: texts.onboardingBatch,
              neededBy: daysFromNow(-10),
              vendorId: reseller.id,
              departmentId: rnd.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(order.id),
          [
            {
              itemType: 'device',
              modelId: String(latitude.id),
              quantity: 2,
              unitPrice: 8999,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(order.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-35);
        const orderAfterSubmit = await procurement.get(
          String(order.id),
          all('purchaseOrders', 'read'),
        );
        if (orderAfterSubmit?.status === 'pendingApproval') {
          // A second actor approves: the demo generator raised the request, so
          // it cannot decide it.
          await procurement.decide(
            String(order.id),
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
        }
        await on(-33);
        await procurement.markOrdered(
          String(order.id),
          { orderedAt: daysFromNow(-20), expectedAt: daysFromNow(-5) },
          context,
          all('purchaseOrders', 'order'),
        );
        const lines = await procurement.lines(String(order.id));
        await reached(50);
        // Each device is its own record, so each is received on its own — the
        // receiving dialog takes one serial, name and keeper at a time.
        await on(-18);
        for (const [index, serial] of ['7YQ2K81', '7YQ2K82'].entries())
          await procurement.receive(
            String(order.id),
            {
              lineId: String(lines[0].id),
              quantity: 1,
              serialNos: [serial],
              locationId: String(warehouse.id),
              extra: {
                name: `SG-LT-03${index}`,
                warrantyEndDate: daysFromNow(1075),
                ownerId: writerId,
              },
            },
            context,
            all('purchaseOrders', 'receive'),
          );
        const generated = await procurement.generated(String(order.id));
        for (const entry of generated)
          if (entry.type === 'device') await track('devices', { id: entry.id });

        // A repair in progress on the expired laptop, IT support's: a repair
        // belongs to its 负责人, so the 维修中 card has something to show
        // when you sign in as IT support (`zhouyu`, or `ryan` in English). The
        // finished ones below are theirs too.
        await on(-3);
        await track(
          'repairs',
          await repairs.create(
            {
              deviceId: String(expiredLaptop.id),
              method: 'sendOut',
              vendorId: String(repairShop.id),
              faultDescription: texts.repairFault,
              faultCategory: 'battery',
              sentAt: daysFromNow(-3),
              expectedReturnAt: daysFromNow(4),
              ownerId: supportUserId ?? null,
            },
            context,
            all('repairs', 'create'),
          ),
        );

        // More repairs: two finished (one internal, one under warranty) and a
        // second one out at the shop, so the 维修 list and the vendor tab have
        // something to show.
        const finishedRepairs: readonly {
          readonly deviceId: string;
          readonly method: 'internal' | 'vendorWarranty';
          readonly vendorId?: string;
          readonly fault: string;
          readonly faultCategory: (typeof REPAIR_FAULT_CATEGORIES)[number];
          readonly sentDays: number;
          readonly returnDays: number;
          readonly cost: number;
          readonly notes?: string;
        }[] = [
          {
            deviceId: String(airs[1].id),
            method: 'internal',
            fault: texts.repairKeyboard,
            faultCategory: 'keyboard',
            sentDays: -25,
            returnDays: -22,
            cost: 380,
          },
          {
            deviceId: String(monitors[0].id),
            method: 'vendorWarranty',
            vendorId: String(reseller.id),
            fault: texts.repairPanel,
            faultCategory: 'screen',
            sentDays: -60,
            returnDays: -46,
            cost: 0,
            notes: texts.repairNotes,
          },
          // The spare laptop the rule would hand a joiner: its keyboard has
          // been back twice.
          {
            deviceId: String(repairedSpare.id),
            method: 'internal',
            fault: texts.repairKeyboard,
            faultCategory: 'keyboard',
            sentDays: -160,
            returnDays: -157,
            cost: 0,
          },
          {
            deviceId: String(repairedSpare.id),
            method: 'internal',
            fault: texts.repairKeyboard,
            faultCategory: 'keyboard',
            sentDays: -40,
            returnDays: -38,
            cost: 380,
          },
          // Two more of the 2023-11 MacBook Pro batch, same swollen battery:
          // a repair history with something in it, on devices that are still
          // in use.
          {
            deviceId: String(laptops[0].id),
            method: 'vendorWarranty',
            vendorId: String(reseller.id),
            fault: texts.repairFault,
            faultCategory: 'battery',
            sentDays: -44,
            returnDays: -37,
            cost: 0,
            notes: texts.repairNotes,
          },
          {
            deviceId: String(laptops[2].id),
            method: 'vendorWarranty',
            vendorId: String(reseller.id),
            fault: texts.repairFault,
            faultCategory: 'battery',
            sentDays: -19,
            returnDays: -12,
            cost: 0,
            notes: texts.repairNotes,
          },
        ];
        await reached(55);
        // Finished repairs are IT support's work: 周宇 is their 负责人, and only
        // a repair's 负责人 may complete it, so he completes them too.
        const supportContext: OperationContext = {
          actorId: supportUserId ?? writerId,
          sourceType: 'demo',
        };
        for (const entry of finishedRepairs) {
          await on(entry.sentDays);
          const repair = await track(
            'repairs',
            await repairs.create(
              {
                deviceId: entry.deviceId,
                method: entry.method,
                vendorId: entry.vendorId ?? null,
                faultDescription: entry.fault,
                faultCategory: entry.faultCategory,
                sentAt: daysFromNow(entry.sentDays),
                expectedReturnAt: daysFromNow(entry.returnDays),
                ownerId: supportUserId ?? writerId,
              },
              context,
              all('repairs', 'create'),
            ),
          );
          await on(entry.returnDays);
          await repairs.complete(
            String(repair.id),
            {
              result: 'repaired',
              disposition: 'return',
              actualReturnAt: daysFromNow(entry.returnDays),
              cost: entry.cost,
              notes: entry.notes ?? null,
            },
            supportContext,
            all('repairs', 'complete'),
          );
        }
        await on(-1);
        await track(
          'repairs',
          await repairs.create(
            {
              deviceId: String(laptops[3].id),
              method: 'sendOut',
              vendorId: String(repairShop.id),
              faultDescription: texts.repairScreen,
              faultCategory: 'screen',
              sentAt: daysFromNow(-1),
              expectedReturnAt: daysFromNow(6),
              // Raised by the leaver and still out at the shop: finishing it
              // is the owner's, so it has to change hands.
              ownerId: leaverUserId,
            },
            context,
            all('repairs', 'create'),
          ),
        );
        // The importer's repair: the spare ThinkPad back from a loan of RAM
        // with a noisy fan, looked at in house.
        if (importerId)
          await track(
            'repairs',
            await repairs.create(
              {
                deviceId: String(thinkpads[1].id),
                method: 'internal',
                vendorId: null,
                faultDescription: texts.repairFan,
                faultCategory: 'other',
                sentAt: daysFromNow(-1),
                expectedReturnAt: daysFromNow(2),
                ownerId: importerId,
              },
              context,
              all('repairs', 'create'),
            ),
          );

        await reached(60);
        // More purchase orders, one per stage: a draft, one waiting for
        // approval, and one ordered whose delivery is overdue.
        await on(-6);
        const draftOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'batchReplacement',
              description: texts.replacementOrder,
              neededBy: daysFromNow(30),
              vendorId: reseller.id,
              departmentId: rnd.id,
              // The leaver raised it and never submitted it: a draft nobody
              // owns is a request that quietly stops existing.
              ownerId: leaverUserId,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(draftOrder.id),
          [
            {
              itemType: 'device',
              modelId: String(mbp.id),
              quantity: 2,
              unitPrice: 15999,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await on(-5);
        const monitorOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'project',
              description: texts.monitorOrder,
              neededBy: daysFromNow(21),
              vendorId: reseller.id,
              departmentId: sales.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(monitorOrder.id),
          [
            {
              itemType: 'device',
              modelId: String(u2723.id),
              quantity: 5,
              unitPrice: 3299,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(monitorOrder.id),
          importerId ?? approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-15);
        const dockOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'stockReplenishment',
              description: texts.dockOrder,
              neededBy: daysFromNow(5),
              vendorId: reseller.id,
              departmentId: rnd.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(dockOrder.id),
          [
            {
              itemType: 'accessory',
              modelId: String(dock.id),
              quantity: 10,
              unitPrice: 299,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(dockOrder.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-14);
        if (
          (
            await procurement.get(
              String(dockOrder.id),
              all('purchaseOrders', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await procurement.decide(
            String(dockOrder.id),
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
        await on(-12);
        await procurement.markOrdered(
          String(dockOrder.id),
          { orderedAt: daysFromNow(-12), expectedAt: daysFromNow(-2) },
          context,
          all('purchaseOrders', 'order'),
        );

        // Approved and waiting to be placed with the vendor.
        await on(-7);
        const memoryOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'stockReplenishment',
              description: texts.memoryOrder,
              neededBy: daysFromNow(18),
              vendorId: reseller.id,
              departmentId: rnd.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(memoryOrder.id),
          [
            {
              itemType: 'component',
              modelId: String(ramModel.id),
              quantity: 10,
              unitPrice: 549,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(memoryOrder.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-6);
        if (
          (
            await procurement.get(
              String(memoryOrder.id),
              all('purchaseOrders', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await procurement.decide(
            String(memoryOrder.id),
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );

        // Half of it arrived: the rest is still outstanding on the line, and
        // what came in joined the headsets already in stock.
        await on(-11);
        const headsetOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'stockReplenishment',
              description: texts.headsetOrder,
              neededBy: daysFromNow(9),
              vendorId: reseller.id,
              departmentId: sales.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(headsetOrder.id),
          [
            {
              itemType: 'accessory',
              modelId: String(zoneVibe.id),
              quantity: 10,
              unitPrice: 699,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(headsetOrder.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-10);
        if (
          (
            await procurement.get(
              String(headsetOrder.id),
              all('purchaseOrders', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await procurement.decide(
            String(headsetOrder.id),
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
        await on(-8);
        await procurement.markOrdered(
          String(headsetOrder.id),
          { orderedAt: daysFromNow(-8), expectedAt: daysFromNow(6) },
          context,
          all('purchaseOrders', 'order'),
        );
        const headsetLines = await procurement.lines(String(headsetOrder.id));
        await on(-2);
        await procurement.receive(
          String(headsetOrder.id),
          {
            lineId: String(headsetLines[0].id),
            quantity: 4,
            stockItemId: String(headsets.id),
          },
          context,
          all('purchaseOrders', 'receive'),
        );

        // Asked for and refused: a rejected order is editable again, so the
        // list shows what a request looks like after it comes back.
        await on(-9);
        const internOrder = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'newHire',
              description: texts.internOrder,
              neededBy: daysFromNow(45),
              vendorId: reseller.id,
              departmentId: rnd.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(internOrder.id),
          [
            {
              itemType: 'device',
              modelId: String(thinkpad.id),
              quantity: 3,
              unitPrice: 8499,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(internOrder.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-8);
        if (
          (
            await procurement.get(
              String(internOrder.id),
              all('purchaseOrders', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await procurement.decide(
            String(internOrder.id),
            'rejected',
            texts.internRejection,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );

        // Approved, then called off before it was placed.
        await on(-20);
        const extraDocks = await track(
          'purchaseOrders',
          await procurement.create(
            {
              reason: 'stockReplenishment',
              description: texts.extraDockOrder,
              neededBy: daysFromNow(24),
              vendorId: reseller.id,
              departmentId: rnd.id,
            },
            context,
            all('purchaseOrders', 'create'),
          ),
        );
        await procurement.setLines(
          String(extraDocks.id),
          [
            {
              itemType: 'accessory',
              modelId: String(dock.id),
              quantity: 6,
              unitPrice: 299,
            },
          ],
          context,
          all('purchaseOrders', 'update'),
        );
        await procurement.submit(
          String(extraDocks.id),
          approverId,
          context,
          all('purchaseOrders', 'submit'),
        );
        await on(-19);
        if (
          (
            await procurement.get(
              String(extraDocks.id),
              all('purchaseOrders', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await procurement.decide(
            String(extraDocks.id),
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
        await on(-16);
        await procurement.cancel(
          String(extraDocks.id),
          texts.extraDockCancel,
          context,
          all('purchaseOrders', 'cancel'),
        );

        await reached(70);
        // More orders across the board (2026-10-05), so each column of the
        // procurement board holds a few and reads as a working queue rather
        // than a card per status. None is received: receiving creates devices
        // and stock, which the rest of the demo accounts for one by one.
        const queuedOrder = async (order: {
          readonly description: string;
          readonly reason: string;
          readonly departmentId: unknown;
          readonly neededInDays: number;
          readonly lines: readonly LineInput[];
          readonly stage:
            | 'draft'
            | 'pendingApproval'
            | 'approved'
            | 'ordered'
            | 'rejected'
            | 'cancelled';
          /** The rejection's comment, or the cancellation's reason. */
          readonly why?: string;
          /** When it was raised; it was decided the next day. */
          readonly raisedDaysAgo: number;
          /** Raised for, and decided by, the importer rather than the staff. */
          readonly ownerId?: string;
          readonly approverId?: string;
        }): Promise<string> => {
          await on(-order.raisedDaysAgo);
          const created = await track(
            'purchaseOrders',
            await procurement.create(
              {
                reason: order.reason,
                description: order.description,
                neededBy: daysFromNow(order.neededInDays),
                vendorId: reseller.id,
                departmentId: order.departmentId,
                ...(order.ownerId ? { ownerId: order.ownerId } : {}),
              },
              context,
              all('purchaseOrders', 'create'),
            ),
          );
          const id = String(created.id);
          await procurement.setLines(
            id,
            order.lines,
            context,
            all('purchaseOrders', 'update'),
          );
          if (order.stage === 'draft') return id;
          const decider = order.approverId ?? approverId;
          await procurement.submit(
            id,
            decider,
            context,
            all('purchaseOrders', 'submit'),
          );
          if (order.stage === 'pendingApproval') return id;
          await on(-order.raisedDaysAgo + 1);
          if (
            (await procurement.get(id, all('purchaseOrders', 'read')))
              ?.status === 'pendingApproval'
          )
            await procurement.decide(
              id,
              order.stage === 'rejected' ? 'rejected' : 'approved',
              order.stage === 'rejected' ? (order.why ?? '') : texts.approval,
              { actorId: decider, sourceType: 'demo' },
              all('purchaseOrders', 'approve'),
            );
          if (order.stage === 'rejected' || order.stage === 'approved')
            return id;
          if (order.stage === 'cancelled') {
            await procurement.cancel(
              id,
              order.why ?? '',
              context,
              all('purchaseOrders', 'cancel'),
            );
            return id;
          }
          await on(-3);
          await procurement.markOrdered(
            id,
            { orderedAt: daysFromNow(-3), expectedAt: daysFromNow(4) },
            context,
            all('purchaseOrders', 'order'),
          );
          return id;
        };
        const line = (
          itemType: LineItemType,
          model: Row,
          quantity: number,
          unitPrice: number,
        ): LineInput => ({
          itemType,
          modelId: String(model.id),
          quantity,
          unitPrice,
        });
        // The two drafts are the importer's (2026-10-16), so 比较报价 — offered
        // only to a draft's 负责人 or writer — is there to try.
        await queuedOrder({
          description: texts.itSpareOrder,
          reason: 'batchReplacement',
          departmentId: itDept.id,
          neededInDays: 45,
          lines: [line('device', thinkpad, 2, 9999)],
          stage: 'draft',
          raisedDaysAgo: 3,
          ownerId: importerId,
        });
        await queuedOrder({
          description: texts.salesPhoneOrder,
          reason: 'newHire',
          departmentId: sales.id,
          neededInDays: 20,
          lines: [line('device', iphone, 3, 5999)],
          stage: 'draft',
          raisedDaysAgo: 2,
          ownerId: importerId,
        });
        const airOrderId = await queuedOrder({
          description: texts.airOrder,
          reason: 'newHire',
          departmentId: rnd.id,
          neededInDays: 14,
          lines: [line('device', air, 4, 8999)],
          stage: 'pendingApproval',
          raisedDaysAgo: 5,
          approverId: importerId,
        });
        const switchOrderId = await queuedOrder({
          description: texts.switchOrder,
          reason: 'project',
          departmentId: itDept.id,
          neededInDays: 30,
          lines: [line('device', catalyst, 1, 23000)],
          stage: 'pendingApproval',
          raisedDaysAgo: 4,
        });
        await queuedOrder({
          description: texts.printerReplaceOrder,
          reason: 'faultReplacement',
          departmentId: itDept.id,
          neededInDays: 7,
          lines: [line('device', laserjet, 1, 2899)],
          stage: 'approved',
          raisedDaysAgo: 9,
          ownerId: importerId,
        });
        await queuedOrder({
          description: texts.mouseOrder,
          reason: 'stockReplenishment',
          departmentId: rnd.id,
          neededInDays: 10,
          lines: [line('accessory', mxMaster, 20, 599)],
          stage: 'approved',
          raisedDaysAgo: 7,
        });
        await queuedOrder({
          description: texts.ssdOrder,
          reason: 'stockReplenishment',
          departmentId: itDept.id,
          neededInDays: 5,
          lines: [line('component', ssdModel, 10, 899)],
          stage: 'ordered',
          raisedDaysAgo: 10,
          ownerId: importerId,
        });
        // Placed and waiting for delivery, with one line of every kind an
        // order can carry — a device, an accessory, a consumable, a
        // component, a perpetual licence and a subscription — so receiving it
        // (by hand or from a delivery note) shows every way goods arrive.
        const software = (
          itemType: 'perpetual' | 'subscription',
          product: Row,
          quantity: number,
          unitPrice: number,
        ): LineInput => ({
          itemType,
          softwareProductId: String(product.id),
          quantity,
          unitPrice,
        });
        await queuedOrder({
          description: texts.desktopOrder,
          reason: 'newHire',
          departmentId: sales.id,
          neededInDays: 12,
          lines: [
            line('device', optiplex, 3, 5299),
            line('accessory', mxKeys, 3, 799),
            line('consumable', hpToner, 4, 629),
            line('component', ramModel, 2, 899),
            software('perpetual', office, 3, 2450),
            software('subscription', zoom, 3, 1080),
          ],
          stage: 'ordered',
          raisedDaysAgo: 11,
        });
        await queuedOrder({
          description: texts.serverOrder,
          reason: 'project',
          departmentId: itDept.id,
          neededInDays: 60,
          lines: [line('device', poweredge, 2, 68000)],
          stage: 'rejected',
          raisedDaysAgo: 14,
          why: texts.serverRejection,
        });
        await queuedOrder({
          description: texts.headsetRestockOrder,
          reason: 'stockReplenishment',
          departmentId: sales.id,
          neededInDays: 15,
          lines: [line('accessory', zoneVibe, 15, 399)],
          stage: 'cancelled',
          raisedDaysAgo: 18,
          why: texts.headsetCancel,
        });

        await reached(78);
        // An audit in progress over the third floor.
        await on(-5);
        const audit = await track(
          'auditTasks',
          await audits.create(
            {
              name: texts.auditName,
              scope: { locationIds: [String(floor3.id)] },
              plannedStart: daysFromNow(-3),
              plannedEnd: daysFromNow(10),
              executorIds: [
                supportUserId ?? writerId,
                ...(importerId ? [importerId] : []),
              ],
              notes: texts.auditNotes,
            },
            context,
            all('auditTasks', 'create'),
          ),
        );
        await on(-3);
        await audits.start(
          String(audit.id),
          context,
          all('auditTasks', 'start'),
        );
        const items = await audits.items(String(audit.id));
        await on(-2);
        const first = items.find((item) => item.deviceId === laptops[0].id);
        if (first)
          await audits.count(
            String(audit.id),
            [{ itemId: String(first.id), result: 'matched' }],
            context,
            all('auditTasks', 'count'),
          );

        // A stocktake the leaver is running, and a disposal they raised.
        // Offboarding is not only equipment: a count named to somebody who has
        // gone is stalled until another name is on it, and so is a scrapping
        // nobody can submit. The demo gives the handover half one of each
        // beside the laptops they answer for.
        await on(-4);
        const leaverAudit = await track(
          'auditTasks',
          await audits.create(
            {
              name: texts.leaverAuditName,
              scope: { locationIds: [String(warehouse.id)] },
              plannedStart: daysFromNow(-2),
              plannedEnd: daysFromNow(12),
              executorIds: [leaverUserId],
              // And answers for it, so leaving hands it over like any other
              // record that still names them.
              ownerId: leaverUserId,
              notes: texts.leaverAuditNotes,
            },
            context,
            all('auditTasks', 'create'),
          ),
        );
        await on(-2);
        await audits.start(
          String(leaverAudit.id),
          context,
          all('auditTasks', 'start'),
        );

        // Audits in every other state (2026-10-05), so each column of the
        // audits board holds one. Their scopes keep off the laptops, whose
        // last count the demo dates 400 days back for the reminder: counting a
        // device matched stamps it audited today.
        const auditTask = async (task: {
          readonly name: string;
          readonly notes?: string;
          readonly scope: Row;
          readonly startIn: number;
          readonly endIn: number;
          /** When it was planned. */
          readonly createdIn: number;
        }): Promise<string> => {
          await on(task.createdIn);
          return String(
            (
              await track(
                'auditTasks',
                await audits.create(
                  {
                    name: task.name,
                    scope: task.scope,
                    plannedStart: daysFromNow(task.startIn),
                    plannedEnd: daysFromNow(task.endIn),
                    executorIds: [supportUserId ?? writerId],
                    notes: task.notes ?? null,
                  },
                  context,
                  all('auditTasks', 'create'),
                ),
              )
            ).id,
          );
        };
        const itemOf = async (taskId: string, deviceId: unknown) =>
          String(
            (await audits.items(taskId)).find(
              (item) => item.deviceId === String(deviceId),
            )?.id,
          );
        const countIn = (taskId: string, entries: readonly CountInput[]) =>
          audits.count(taskId, entries, context, all('auditTasks', 'count'));
        // Two planned for later.
        await auditTask({
          name: texts.q4AuditName,
          notes: texts.q4AuditNotes,
          scope: { locationIds: [String(floor3.id)] },
          startIn: 20,
          endIn: 30,
          createdIn: -8,
        });
        await auditTask({
          name: texts.japanAuditName,
          notes: texts.japanAuditNotes,
          scope: { locationIds: [String(japan.id)] },
          startIn: 40,
          endIn: 55,
          createdIn: -12,
        });
        // One finished with differences to settle: a phone found elsewhere,
        // and the printer nobody counted, which finishing marks not found.
        const diffAudit = await auditTask({
          name: texts.diffAuditName,
          scope: {
            deviceIds: [deskPc.id, mobile.id, officePrinter.id].map(String),
          },
          startIn: -6,
          endIn: -1,
          createdIn: -8,
        });
        await on(-6);
        await audits.start(diffAudit, context, all('auditTasks', 'start'));
        await on(-2);
        await countIn(diffAudit, [
          { itemId: await itemOf(diffAudit, deskPc.id), result: 'matched' },
          {
            itemId: await itemOf(diffAudit, mobile.id),
            result: 'mismatch',
            actualLocationId: String(serverRoom.id),
          },
        ]);
        await on(-1);
        await audits.finish(diffAudit, context, all('auditTasks', 'finish'));
        // Two completed last quarter: one all matched, one whose difference
        // was looked at and left as it was.
        const roomAudit = await auditTask({
          name: texts.serverRoomAuditName,
          scope: { locationIds: [String(serverRoom.id)] },
          startIn: -100,
          endIn: -90,
          createdIn: -105,
        });
        await on(-99);
        await audits.start(roomAudit, context, all('auditTasks', 'start'));
        await on(-95);
        await countIn(
          roomAudit,
          (await audits.items(roomAudit)).map((item) => ({
            itemId: String(item.id),
            result: 'matched',
          })),
        );
        await on(-92);
        await audits.finish(roomAudit, context, all('auditTasks', 'finish'));
        const monitorAudit = await auditTask({
          name: texts.monitorAuditName,
          scope: { deviceIds: monitors.map((row) => String(row.id)) },
          startIn: -95,
          endIn: -88,
          createdIn: -100,
        });
        await on(-94);
        await audits.start(monitorAudit, context, all('auditTasks', 'start'));
        const monitorItems = await audits.items(monitorAudit);
        await on(-90);
        await countIn(
          monitorAudit,
          monitorItems.map((item, index) =>
            index === 0
              ? {
                  itemId: String(item.id),
                  result: 'mismatch',
                  actualLocationId: String(serverRoom.id),
                }
              : { itemId: String(item.id), result: 'matched' },
          ),
        );
        await on(-89);
        await audits.finish(monitorAudit, context, all('auditTasks', 'finish'));
        await on(-88);
        await audits.resolve(
          monitorAudit,
          [{ itemId: String(monitorItems[0]?.id), resolution: 'markVerified' }],
          context,
          all('auditTasks', 'resolve'),
        );
        // The service stamps the start and the completion today; these two
        // ran last quarter, so their dates are moved back to it.
        for (const [taskId, startedDaysAgo, completedDaysAgo] of [
          [roomAudit, 99, 92],
          [monitorAudit, 94, 89],
        ] as const)
          await database
            .query()
            .updateTable('auditTasks')
            .set({
              startedAt: new Date(Date.now() - startedDaysAgo * DAY),
              completedAt: new Date(Date.now() - completedDaysAgo * DAY),
            })
            .where('id', '=', taskId)
            .execute();
        // And one called off part way: a task not yet started is deleted
        // rather than cancelled, so this one was started first.
        const spotAudit = await auditTask({
          name: texts.spotAuditName,
          scope: { locationIds: [String(warehouse.id)] },
          startIn: -4,
          endIn: -3,
          createdIn: -6,
        });
        await on(-4);
        await audits.start(spotAudit, context, all('auditTasks', 'start'));
        await on(-3);
        await audits.cancel(
          spotAudit,
          texts.spotAuditCancel,
          context,
          all('auditTasks', 'cancel'),
        );
        const swollenLaptop = await device({
          modelId: latitude.id,
          serialNo: '7YQ2K75',
          name: 'SG-LT-009',
          locationId: warehouse.id,
          departmentId: sales.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-1480),
          purchasePrice: 8999,
          warrantyEndDate: daysFromNow(-120),
          attributes: {
            os: 'Windows 11 23H2',
            cpu: 'Intel Core i5-1335U',
            memory: '16 GB',
            storage: '512 GB',
            macAddress: 'b0:4f:13:20:03:03',
            hostname: 'SG-LT-009',
            screenSize: '14',
          },
        });
        // The sales manager's laptop until her desktop came, then a spare.
        await assign(swollenLaptop.id, wangFang.id, -1475);
        await giveBack(swollenLaptop.id, -500);
        await on(-5);
        await track(
          'disposals',
          await disposals.create(
            {
              method: 'scrap',
              reason: 'damaged',
              requestedAt: daysFromNow(-5),
              description: texts.leaverDisposal,
              deviceIds: [String(swollenLaptop.id)],
              recipientVendorId: String(recycler.id),
              dataWipe: 'done',
              wipeMethod: 'software',
              // Raised by the leaver and never submitted: a request nobody
              // else may file or withdraw until it is handed over.
              ownerId: leaverUserId,
            },
            context,
            all('disposals', 'create'),
          ),
        );

        await reached(85);
        // A disposal draft for the last monitor.
        await on(-2);
        await track(
          'disposals',
          await disposals.create(
            {
              method: 'scrap',
              reason: 'damaged',
              requestedAt: daysFromNow(-2),
              description: texts.disposalDescription,
              deviceIds: [String(monitors[2].id)],
              recipientVendorId: String(recycler.id),
              // A monitor holds nothing to wipe.
              dataWipe: 'notRequired',
            },
            context,
            all('disposals', 'create'),
          ),
        );

        // A disposal waiting for a decision, so the 待我审批 view has
        // something in it: the old printer, past its warranty.
        await on(-4);
        const printerDisposal = await track(
          'disposals',
          await disposals.create(
            {
              method: 'scrap',
              reason: 'endOfLife',
              requestedAt: daysFromNow(-4),
              description: texts.disposalPrinter,
              deviceIds: [String(officePrinter.id)],
              recipientVendorId: String(recycler.id),
              dataWipe: 'notRequired',
            },
            context,
            all('disposals', 'create'),
          ),
        );
        await on(-3);
        await disposals.submit(
          String(printerDisposal.id),
          importerId ?? approverId,
          context,
          all('disposals', 'submit'),
        );

        // Approved and waiting to be carried out, which is the state the
        // 待执行报废 card reads. Without one the card is always empty and
        // the demo shows only half of the disposal's life.
        const brokenMonitor = await device({
          modelId: u2723.id,
          serialNo: 'CN0F5K7Y3009',
          name: 'SG-MON-009',
          locationId: warehouse.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-1400),
          purchasePrice: 4299,
          warrantyEndDate: daysFromNow(-305),
          attributes: {
            screenSize: '27',
            resolution: '3840×2160',
            inputs: 'HDMI, DisplayPort, USB-C',
          },
        });
        // On the R&D engineer's desk until her current monitor came.
        await assign(brokenMonitor.id, liNa.id, -1140);
        await giveBack(brokenMonitor.id, -296);
        await on(-9);
        const monitorDisposal = await track(
          'disposals',
          await disposals.create(
            {
              method: 'scrap',
              reason: 'damaged',
              requestedAt: daysFromNow(-9),
              description: texts.disposalDescription,
              deviceIds: [String(brokenMonitor.id)],
              recipientVendorId: String(recycler.id),
              dataWipe: 'notRequired',
              ...(importerId ? { ownerId: importerId } : {}),
            },
            context,
            all('disposals', 'create'),
          ),
        );
        await disposals.submit(
          String(monitorDisposal.id),
          approverId,
          context,
          all('disposals', 'submit'),
        );
        await on(-8);
        if (
          (
            await disposals.get(
              String(monitorDisposal.id),
              all('disposals', 'read'),
            )
          )?.status === 'pendingApproval'
        )
          await disposals.decide(
            String(monitorDisposal.id),
            'approved',
            texts.disposalApproval,
            { actorId: approverId, sourceType: 'demo' },
            all('disposals', 'approve'),
          );

        // A laptop whose life is over: sold to the recycler through a
        // disposal that went all the way — submitted, approved, executed —
        // so the register holds a device in its final state with the paper
        // trail behind it.
        const retiredLaptop = await device({
          modelId: latitude.id,
          serialNo: '7YQ2K60',
          name: 'SG-LT-008',
          locationId: warehouse.id,
          vendorId: reseller.id,
          purchaseDate: daysFromNow(-1900),
          purchasePrice: 7999,
          warrantyEndDate: daysFromNow(-805),
          attributes: {
            os: 'Windows 10 22H2',
            cpu: 'Intel Core i5-8265U',
            memory: '8 GB',
            storage: '256 GB',
            macAddress: 'b0:4f:13:20:01:08',
            hostname: 'SG-LT-008',
            screenSize: '14',
          },
        });
        // The second asset manager's laptop for four years, until her
        // MacBook Pro came.
        await assign(retiredLaptop.id, writer.id, -1395);
        await giveBack(retiredLaptop.id, -421);
        await on(-35);
        const sale = await track(
          'disposals',
          await disposals.create(
            {
              method: 'sale',
              reason: 'endOfLife',
              // Requested well before it was carried out, so the card reads
              // request → execution in order.
              requestedAt: daysFromNow(-35),
              description: texts.disposalEndOfLife,
              deviceIds: [String(retiredLaptop.id)],
              recipientVendorId: String(recycler.id),
            },
            context,
            all('disposals', 'create'),
          ),
        );
        const saleId = String(sale.id);
        await disposals.submit(
          saleId,
          approverId,
          context,
          all('disposals', 'submit'),
        );
        await on(-30);
        if (
          (await disposals.get(saleId, all('disposals', 'read')))?.status ===
          'pendingApproval'
        )
          await disposals.decide(
            saleId,
            'approved',
            texts.disposalApproval,
            { actorId: approverId, sourceType: 'demo' },
            all('disposals', 'approve'),
          );
        await on(-20);
        await disposals.execute(
          saleId,
          {
            disposedAt: daysFromNow(-20),
            proceeds: 800,
            recipientVendorId: String(recycler.id),
            dataWipe: 'wiped',
            wipeMethod: 'erase',
          },
          context,
          all('disposals', 'execute'),
        );

        // A few comment threads (2026-10-16), so the 动态 of the records
        // being worked on reads as a team talking, and the importer is
        // @-mentioned on two of them — which lands in its 通知 — and answers
        // one itself. Needs the sign-ins: a comment is written by an account.
        if (dependencies.comments && importerId) {
          const comments = dependencies.comments;
          const importerName =
            (await dependencies.accounts?.describe(actorId))?.name ??
            'nocobase';
          const say = (template: string): string =>
            template
              .replace('{importer}', importerName)
              .replace('{leaver}', asText(chenJie.name) ?? '');
          const comment = async (
            day: number,
            author: string | undefined,
            subjectType: string,
            subject: Row,
            body: string,
            options: { mention?: boolean; replyTo?: string } = {},
          ): Promise<string> => {
            await on(day);
            const written = await comments.add(author ?? writerId, {
              subjectType,
              subjectId: String(subject.id),
              body: say(body),
              ...(options.mention ? { mentions: [actorId] } : {}),
              ...(options.replyTo ? { replyToId: options.replyTo } : {}),
            });
            return String(written.id);
          };
          const monitorAsk = await comment(
            -14,
            writerId,
            'purchaseOrders',
            monitorOrder,
            texts.commentMonitorAsk,
            { mention: true },
          );
          await comment(
            -13,
            managerUserId,
            'purchaseOrders',
            monitorOrder,
            texts.commentMonitorBudget,
            { replyTo: monitorAsk },
          );
          const auditAsk = await comment(
            -2,
            supportUserId,
            'auditTasks',
            audit,
            texts.commentAuditProgress,
            { mention: true },
          );
          await comment(
            -2,
            actorId,
            'auditTasks',
            audit,
            texts.commentAuditReply,
            { replyTo: auditAsk },
          );
          await comment(
            -4,
            supportUserId,
            'disposals',
            printerDisposal,
            texts.commentPrinter,
          );
          const swollen = await comment(
            -6,
            supportUserId,
            'devices',
            swollenLaptop,
            texts.commentSwollen,
          );
          await comment(
            -5,
            writerId,
            'devices',
            swollenLaptop,
            texts.commentSwollenReply,
            { replyTo: swollen },
          );
          await comment(
            -3,
            writerId,
            'devices',
            expiredLaptop,
            texts.commentExpired,
          );
          await comment(-1, writerId, 'people', chenJie, texts.commentLeaver, {
            mention: true,
          });
          // And on the master data the demo made (2026-10-16): the reseller's
          // new account manager, the recycler's certificate, the end of the
          // hub and a tip for the webcam.
          const handover = await comment(
            -611,
            managerUserId,
            'vendors',
            reseller,
            texts.commentResellerContact
              .replace('{contact}', vendorNames.reseller.contact)
              .replace('{newContact}', texts.resellerContact),
          );
          await comment(
            -611,
            writerId,
            'vendors',
            reseller,
            texts.commentResellerReply,
            { replyTo: handover },
          );
          await comment(
            -18,
            supportUserId,
            'vendors',
            recycler,
            texts.commentRecycler,
          );
          if (demoMade.has(String(hubModel.id)))
            await comment(
              -89,
              writerId,
              'models',
              hubModel,
              texts.commentHubEnd,
            );
          if (demoMade.has(String(webcamModel.id)))
            await comment(
              -280,
              supportUserId,
              'models',
              webcamModel,
              texts.commentWebcam,
            );
          // On the categories (2026-10-16). The seeded ones are not the
          // demo's, so their comments are tracked one by one and go when the
          // demo is cleared; none mentions or answers anybody, which would
          // send a notification the clearing could not tell from others on
          // the same category. The webcam category, when the demo made it,
          // carries a thread like any record of its own.
          const onSeeded = async (day: number, id: string, body: string) =>
            track('historyEvents', {
              id: await comment(
                day,
                supportUserId,
                'categories',
                await seeded(id),
                body,
              ),
            });
          await onSeeded(-210, 'cat-laptop', texts.commentLaptopCycle);
          await onSeeded(-400, 'cat-monitor', texts.commentMonitorRule);
          await onSeeded(-820, 'cat-phone', texts.commentPhoneRule);
          if (demoMade.has(String(webcamCat.id))) {
            const lending = await comment(
              -650,
              managerUserId,
              'categories',
              webcamCat,
              texts.commentWebcamCategory,
            );
            await comment(
              -649,
              writerId,
              'categories',
              webcamCat,
              texts.commentWebcamCategoryReply,
              { replyTo: lending },
            );
          }
        }

        await reached(90);
        // What follows happens today: the leaver leaves, the joiners are
        // entered, Intune and Jamf report.
        await off();
        // The one who is about to leave is **not** marked left here. Everything
        // that makes offboarding worth seeing is already in place — they hold
        // a device in repair that answers to somebody else, a device the
        // reader answers for, an accessory and a seat, and they are named on
        // four records — so pressing 标记离职 is what shows the whole of it
        // happening: the snapshot written, the owners notified, the to-do
        // appearing, the progress counting down. Generating it already left
        // would show the aftermath and never the act.
        //
        // The cost is that a fresh demo has no 离职资产回收 to-do until
        // somebody presses the button.

        // Receiving stamps the arrival date itself — `receivedAt` is a
        // lifecycle field no operation edits — so every demo order would
        // otherwise arrive today, including one placed in 2025. The dates are
        // corrected here instead: an order arrives the day after it was due,
        // and its receipts are stamped that morning.
        const receivedOrders = await database
          .query()
          .selectFrom('purchaseOrders')
          .select(['id', 'expectedAt'])
          .where('receivedAt', 'is not', null)
          .where(
            'id',
            'in',
            (
              await database
                .query()
                .selectFrom('demoRecords')
                .select(['recordId'])
                .where('collection', '=', 'purchaseOrders')
                .execute<{ recordId: string }>()
            ).map((row) => row.recordId),
          )
          .execute<Row>();
        // Every received order arrives the day after it was due. The three
        // most recent get dates of their own as well: their definitions
        // promise delivery days from now, which for an order already received
        // would stamp an arrival in the future.
        // What a receipt wrote — the movement into stock, the new device or
        // entitlement and its first history line, the order's own lines for
        // the arrival — moves with the receipt, in the order it was written.
        // Most arrivals were dated as they were received; these are the ones
        // whose date is decided only here.
        const arrivedOn = async (orderId: string, at: string) => {
          const base = instant(at);
          const sourced = await database
            .query()
            .selectFrom('historyEvents')
            .select(['operationId'])
            .where('sourceType', '=', 'purchaseOrder')
            .where('sourceId', '=', orderId)
            .execute<{ operationId: string | null }>();
          const operations = [
            ...new Set(sourced.map((row) => row.operationId).filter(Boolean)),
          ] as string[];
          const moved: { table: string; id: string; at: number }[] = [];
          for (const table of ['historyEvents', 'changeLogs']) {
            if (operations.length === 0) break;
            for (const row of await database
              .query()
              .selectFrom(table)
              .select(['id', 'createdAt'])
              .where('operationId', 'in', operations)
              .execute<Row>())
              moved.push({
                table,
                id: String(row.id),
                at: instant(row.createdAt),
              });
          }
          for (const row of await database
            .query()
            .selectFrom('stockMovements')
            .select(['id', 'createdAt'])
            .where('sourceType', '=', 'purchaseOrder')
            .where('sourceId', '=', orderId)
            .execute<Row>())
            moved.push({
              table: 'stockMovements',
              id: String(row.id),
              at: instant(row.createdAt),
            });
          // An order entered with the register wrote nothing of its own.
          if (moved.length === 0) return;
          const first = Math.min(...moved.map((row) => row.at));
          for (const row of moved)
            await database
              .query()
              .updateTable(row.table)
              .set({ createdAt: new Date(base + (row.at - first) * 1000) })
              .where('id', '=', row.id)
              .execute();
          // A device or entitlement the receipt created was created then.
          for (const receipt of await database
            .query()
            .selectFrom('purchaseReceipts')
            .select(['generatedType', 'generatedId'])
            .where('purchaseOrderId', '=', orderId)
            .execute<Row>()) {
            const table =
              receipt.generatedType === 'device'
                ? 'devices'
                : receipt.generatedType === 'entitlement'
                  ? 'entitlements'
                  : undefined;
            const generatedId = asText(receipt.generatedId);
            if (table && generatedId)
              await database
                .query()
                .updateTable(table)
                .set({ createdAt: new Date(base) })
                .where('id', '=', generatedId)
                .execute();
          }
        };
        const RECENT_ARRIVALS = [
          { expectedDaysAgo: 19 },
          { expectedDaysAgo: 26 },
          { expectedDaysAgo: 34 },
        ] as const;
        const newestFirst = [...receivedOrders].sort((a: Row, b: Row) =>
          (asText(b.expectedAt) ?? '').localeCompare(
            asText(a.expectedAt) ?? '',
          ),
        );
        for (const [index, row] of newestFirst.entries()) {
          const late = RECENT_ARRIVALS[index];
          const expected = late
            ? daysFromNow(-late.expectedDaysAgo)
            : asText(row.expectedAt);
          if (!expected) continue;
          const arrived = addDays(expected, 1);
          await database
            .query()
            .updateTable('purchaseOrders')
            .set(
              late
                ? {
                    orderedAt: addDays(expected, -14),
                    expectedAt: expected,
                    receivedAt: arrived,
                  }
                : { receivedAt: arrived },
            )
            .where('id', '=', String(row.id))
            .execute();
          await database
            .query()
            .updateTable('purchaseReceipts')
            .set({ createdAt: `${arrived}T10:00:00.000` })
            .where('purchaseOrderId', '=', String(row.id))
            .execute();
          await arrivedOn(String(row.id), `${arrived}T10:00:00.000`);
        }

        // 陈杰 leaves today, last, once everything he holds and answers for
        // is in place: marking him left the way 标记离职 does takes the
        // snapshot his handover is measured against and disables his sign-in,
        // so the 离职交接 to-do opens on a whole handover with nothing done.
        await masterData.markPersonLeft(
          String(chenJie.id),
          writerId,
          unrestricted('people', 'update'),
        );

        // Every department has a default 入职配置 (2026-10-06): the seeds give
        // one to each department but 技术部, and one deleted while trying the
        // department page stays deleted, since a seed never runs twice. A
        // department without one gets one here — engineering's for the
        // engineering departments, else its nearest parent's, else a plain
        // office kit — tracked like the rest of the demo, so clearing it takes
        // these with it.
        const seat = (id: string) => ({ softwareProductId: id, quantity: 1 });
        const one = (id: string) => ({ modelId: id, quantity: 1 });
        await seededIn('softwareProducts', 'sp-microsoft-365');
        const kitItems = {
          engineering: [
            one(String(mbp.id)),
            one(String(u2723.id)),
            one(String(wd22.id)),
            one(String(mxKeys.id)),
            one(String(mxMaster.id)),
            seat(String(intellij.id)),
            seat('sp-microsoft-365'),
            seat(String(zoom.id)),
          ],
          office: [
            one(String(thinkpad.id)),
            one(String(mxKeys.id)),
            one(String(mxMaster.id)),
            seat('sp-microsoft-365'),
          ],
        };
        const ENGINEERING = new Set(['dept-tech', 'dept-rd', 'dept-qa']);
        const departments = await database
          .query()
          .selectFrom('departments')
          .select(['id', 'name', 'parentId', 'path'])
          .orderBy('path', 'asc')
          .execute<Row>();
        // A default with nothing in it counts as none — 设置本部门默认配置 on
        // a department with nothing above it to copy starts one empty — and is
        // filled rather than doubled. That kit is the user's, not the demo's,
        // so it is not tracked and stays when the demo is cleared.
        const filled = (items: unknown) =>
          Array.isArray(items) && items.length > 0;
        const defaults = new Map<string, unknown>();
        const emptyDefaults = new Map<string, string>();
        for (const kit of await database
          .query()
          .selectFrom('onboardingKits')
          .select(['id', 'departmentId', 'position', 'items'])
          .execute<Row>())
          if (!asText(kit.position)) {
            const items = decodeRow(kit).items;
            if (filled(items)) defaults.set(String(kit.departmentId), items);
            else emptyDefaults.set(String(kit.departmentId), String(kit.id));
          }
        for (const department of departments) {
          const id = String(department.id);
          if (defaults.has(id)) continue;
          let items: unknown = ENGINEERING.has(id)
            ? kitItems.engineering
            : undefined;
          for (
            let parent = asText(department.parentId);
            items === undefined && parent;
            parent = asText(
              departments.find((row) => String(row.id) === parent)?.parentId,
            )
          )
            items = defaults.get(parent);
          items ??= kitItems.office;
          const empty = emptyDefaults.get(id);
          if (empty)
            await masterData.update(
              'onboardingKits',
              empty,
              { items },
              writerId,
              all('onboardingKits', 'update'),
            );
          else
            await md('onboardingKits', {
              name: texts.defaultKit.replace('{name}', String(department.name)),
              departmentId: id,
              items,
            });
          defaults.set(id, items);
        }
        // Two positions work on something other than their department's kit
        // (2026-10-16): IT's asset managers on a MacBook Pro rather than IT's
        // ThinkPad, and without a dock, and the sales manager on a MacBook
        // Pro rather than an Air. Each position has a kit of its own saying
        // so, the way Product's designers do, rather than the laptop marked
        // 不需要 for each of them — so everybody in the demo holds what their
        // kit asks. A kit the position has already is kept.
        const positionKit = async (
          departmentId: unknown,
          position: string | undefined,
          name: string,
          items: unknown[],
        ) => {
          if (!position) return;
          const kits = await database
            .query()
            .selectFrom('onboardingKits')
            .select(['position'])
            .where('departmentId', '=', String(departmentId))
            .execute<Row>();
          const same = (value: unknown) =>
            (asText(value) ?? '').trim().toLowerCase() ===
            position.trim().toLowerCase();
          if (kits.some((kit) => same(kit.position))) return;
          await md('onboardingKits', { name, departmentId, position, items });
        };
        await positionKit(
          itDept.id,
          staffSpecs.find((spec) => spec.key === 'approver')?.position,
          texts.itManagerKit,
          [
            one(String(mbp.id)),
            one(String(u2723.id)),
            seat('sp-microsoft-365'),
            seat(String(zoom.id)),
          ],
        );
        await positionKit(
          sales.id,
          personNames[2]?.position,
          texts.salesManagerKit,
          [
            one(String(mbp.id)),
            one(String(iphone.id)),
            one(String(zoneVibe.id)),
            seat('sp-microsoft-365'),
            seat(String(zoom.id)),
          ],
        );

        await reached(95);
        // 入职准备: joining in five and nine days, nothing reserved yet. Entered
        // last, once the spare laptops, monitors, stock and seats exist:
        // saving a joiner is what sets Asset Steward choosing their equipment
        // (`onboarding-advisor.ts`), and entered first it found nothing in
        // stock to choose from, or half of it.
        const productDept = await seededIn('departments', 'dept-product');
        const joinerIds: string[] = [];
        for (const [index, entry] of (
          JOINER_NAMES[locale] ??
          JOINER_NAMES['en-US'] ??
          []
        ).entries()) {
          const joiner = await md('people', {
            name: entry.name,
            employeeNo: `EMP-${String(index + 301).padStart(3, '0')}`,
            email: `${entry.mail}@northbridge.example`,
            position: entry.position,
            departmentId: index === 0 ? rnd.id : productDept.id,
            locationId: floor3.id,
            hireDate: daysFromNow(index === 0 ? 5 : 9),
          });
          joinerIds.push(String(joiner.id));
        }

        // What the demo's Intune reports (device sync, 2026-10-14), read in
        // through the same matching as a real pull, so the devices' pages show
        // their management platform and the settings page has something to
        // count without a tenant; 设置 → MDM shows it as connected and pulls
        // from the demo itself (`device-demo-source.ts`). Most of the laptops
        // and desktops in use sync daily under their holder. Every situation
        // MDM 核对 knows is there once (2026-10-15):
        // - 信息不一致: one silent for seven weeks, one in another person's
        //   hands, one on the shelf yet online, a disposed one still online
        //   (critical), and one Intune stopped reporting (a second pull
        //   leaves it out); one more syncs but is non-compliant and
        //   unencrypted, which its page shows;
        // - 只在 MDM: a new laptop of a model on the books, a contractor's
        //   laptop of a model that is not, a serial two register devices
        //   share, and a virtual machine with a placeholder serial;
        // - 已忽略: an employee's own phone (忽略个人设备) and a meeting room
        //   computer a person kept off the register.
        if (dependencies.deviceSync) {
          const demoDeviceIds = (
            await database
              .query()
              .selectFrom('demoRecords')
              .select(['recordId'])
              .where('collection', '=', 'devices')
              .execute<{ recordId: string }>()
          ).map((row) => row.recordId);
          const register = await database
            .query()
            .selectFrom('devices')
            .innerJoin('models', 'models.id', 'devices.modelId')
            .innerJoin('categories', 'categories.id', 'models.categoryId')
            .leftJoin(
              'manufacturers',
              'manufacturers.id',
              'models.manufacturerId',
            )
            .leftJoin('people', 'people.id', 'devices.assigneeId')
            .select([
              'devices.id as id',
              'devices.serialNo as serialNo',
              'devices.name as name',
              'devices.status as status',
              'devices.assigneeType as assigneeType',
              'devices.modelId as modelId',
              'people.email as email',
              'people.name as personName',
              'models.name as model',
              'manufacturers.name as manufacturer',
              'categories.id as categoryId',
            ])
            .where(
              'devices.id',
              'in',
              demoDeviceIds.length ? demoDeviceIds : ['__none__'],
            )
            .orderBy('devices.serialNo')
            .execute();
          const computers = register.filter(
            (row) =>
              ['cat-laptop', 'cat-desktop'].includes(String(row.categoryId)) &&
              typeof row.serialNo === 'string' &&
              row.serialNo,
          );
          const inUse = computers.filter(
            (row) => row.status === 'inUse' && row.assigneeType === 'person',
          );
          const onShelf = computers.filter((row) => row.status === 'inStock');
          // A nightly sync at a UTC hour that has not come round yet today
          // happened the day before; without the step back, a demo imported
          // in the daytime in China showed syncs dated tomorrow.
          const syncedAgo = (days: number, hour = 22) => {
            const at = `${daysFromNow(-days)}T${String(hour).padStart(2, '0')}:10:00.000Z`;
            return Date.parse(at) <= Date.now()
              ? at
              : new Date(Date.parse(at) - DAY).toISOString();
          };
          const osOf = (manufacturer: unknown) =>
            manufacturer === 'Apple'
              ? { osName: 'macOS', osVersion: '15.6.1' }
              : { osName: 'Windows', osVersion: '10.0.26100.4946' };
          const observation = (
            row: Row,
            index: number,
            overrides: Partial<ObservedDevice> = {},
          ): ObservedDevice => {
            const externalId = `demo-${String(row.id).slice(0, 8)}-${index}`;
            return {
              externalId,
              serialNo: String(row.serialNo),
              deviceName: String(row.name ?? row.serialNo).slice(0, 60),
              manufacturer: (row.manufacturer as string | null) ?? null,
              model: (row.model as string | null) ?? null,
              ...osOf(row.manufacturer),
              userPrincipal: (row.email as string | null) ?? null,
              userName: (row.personName as string | null) ?? null,
              ownership: 'company',
              compliance: 'compliant',
              encrypted: true,
              wifiMac: null,
              enrolledAt: `${daysFromNow(-200 - index * 3)}T09:00:00.000Z`,
              lastSyncAt: syncedAgo(index % 3, 20 + (index % 3)),
              raw: { id: externalId, demo: true },
              ...overrides,
            };
          };
          const observed: ObservedDevice[] = inUse.map((row, index) =>
            observation(row, index),
          );
          // Silent for seven weeks: lost, or left in a drawer.
          if (observed[1])
            observed[1] = { ...observed[1], lastSyncAt: syncedAgo(49) };
          // In someone else's hands than the register says.
          const other = inUse.find(
            (row, index) => index > 2 && row.email !== inUse[2]?.email,
          );
          if (observed[2] && other)
            observed[2] = {
              ...observed[2],
              userPrincipal: (other.email as string | null) ?? null,
              userName: (other.personName as string | null) ?? null,
            };
          // On the shelf, yet syncing every day.
          if (onShelf[0])
            observed.push(
              observation(onShelf[0], observed.length, {
                userPrincipal: null,
                userName: null,
                lastSyncAt: syncedAgo(0),
              }),
            );
          // Disposed, yet online two days ago: a data risk, raised as critical.
          const disposed = computers.find((row) => row.status === 'disposed');
          if (disposed)
            observed.push(
              observation(disposed, observed.length, {
                userPrincipal: null,
                userName: null,
                lastSyncAt: syncedAgo(2),
              }),
            );
          // Of the laptops in use that only Intune manages (Jamf takes the
          // Macs past the third), one is non-compliant and unencrypted, and
          // one is left out of the second pull below: Intune no longer
          // reports it.
          const intuneOnly = inUse
            .map((row, index) => ({ row, index }))
            .filter(
              ({ row, index }) => index > 2 && row.manufacturer !== 'Apple',
            );
          const unsafe = intuneOnly[0];
          if (unsafe)
            observed[unsafe.index] = {
              ...observed[unsafe.index],
              compliance: 'noncompliant',
              encrypted: false,
            };
          const dropped = intuneOnly[1];
          // The devices behind 信息不一致 answer to different people
          // (2026-10-17), so its 负责人 column and each person's MDM 跟进
          // are not all 吴静's: IT support keeps the silent laptop and the
          // one Intune dropped, the account that imported the demo the one
          // on the shelf and the disposed one, so its own MDM 核对 has
          // something to follow up; the laptop in someone else's hands
          // stays with 吴静. Not the leaver, who is handing things over.
          const answering: readonly [Row | undefined, string][] = [
            [inUse[1], supportUserId ?? writerId],
            [onShelf[0], importerId ?? managerUserId ?? writerId],
            [disposed, importerId ?? managerUserId ?? writerId],
            [dropped?.row, supportUserId ?? writerId],
          ];
          for (const [row, ownerId] of answering)
            if (row)
              await database
                .query()
                .updateTable('devices')
                .set({ ownerId })
                .where('id', '=', String(row.id))
                .execute();
          const extra = (
            externalId: string,
            values: Partial<ObservedDevice>,
          ): ObservedDevice => ({
            externalId,
            serialNo: null,
            deviceName: null,
            manufacturer: null,
            model: null,
            osName: 'Windows',
            osVersion: '10.0.26100.4946',
            userPrincipal: null,
            userName: null,
            ownership: 'company',
            compliance: 'compliant',
            encrypted: true,
            wifiMac: null,
            enrolledAt: `${daysFromNow(-12)}T09:00:00.000Z`,
            lastSyncAt: syncedAgo(0),
            raw: { id: externalId, demo: true },
            ...values,
          });
          const someone = inUse[4] ?? inUse[0];
          observed.push(
            extra('demo-unregistered-laptop', {
              serialNo: 'PF5DEMO01',
              deviceName: 'LAPTOP-PF5DEMO01',
              manufacturer: 'Lenovo',
              model: 'ThinkPad T14 Gen 5',
              userPrincipal: (someone?.email as string | null) ?? null,
              userName: (someone?.personName as string | null) ?? null,
            }),
            extra('demo-personal-phone', {
              serialNo: 'F2LDEMO02',
              deviceName: 'iPhone',
              manufacturer: 'Apple',
              model: 'iPhone 15',
              osName: 'iOS',
              osVersion: '18.6.2',
              ownership: 'personal',
              userPrincipal: (someone?.email as string | null) ?? null,
              userName: (someone?.personName as string | null) ?? null,
            }),
            extra('demo-build-vm', {
              serialNo: 'To be filled by O.E.M.',
              deviceName: 'BUILD-VM-07',
              manufacturer: 'Microsoft Corporation',
              model: 'Virtual Machine',
              compliance: 'noncompliant',
              encrypted: false,
            }),
            // A model the register does not have, under someone who is not a
            // person on it: 补登记 can only bring the maker.
            extra('demo-contractor-laptop', {
              serialNo: 'DLDEMO03',
              deviceName: 'LAPTOP-DLDEMO03',
              manufacturer: 'Dell',
              model: 'Dell Latitude 7450',
              userPrincipal: 'li.gong@partner.example',
              userName: texts.syncContractor,
            }),
            // Kept off the register by a person, below.
            extra('demo-meeting-room', {
              serialNo: 'MRDEMO04',
              deviceName: 'MEETING-ROOM-01',
              manufacturer: 'Dell',
              model: 'OptiPlex 7020 Micro',
            }),
          );
          // The computers on the shelf or at the repairer are on Intune too
          // (2026-10-16), as a returned laptop stays enrolled, with no user and
          // a sync weeks back — long enough not to read as 状态不符. Not the
          // one the case above uses, nor the last two on the shelf: new, and
          // not set up yet. (A serial two devices share went on 2026-10-16:
          // the register no longer takes the same serial twice.)
          const resting = [
            ...onShelf.slice(1, -2),
            ...computers.filter((row) => row.status === 'inRepair'),
          ];
          resting.forEach((row, index) =>
            observed.push(
              observation(row, observed.length, {
                userPrincipal: null,
                userName: null,
                lastSyncAt: syncedAgo(21 + index * 6),
              }),
            ),
          );
          // Two pulls: the first with every device, the second without the
          // one Intune stopped reporting, which the second marks gone.
          for (const batch of [
            observed,
            observed.filter((_, index) => index !== dropped?.index),
          ]) {
            const run = await dependencies.deviceSync.ingest(
              'intune',
              (async function* () {
                yield batch;
              })(),
              'demo',
              actorId,
            );
            await track('deviceSyncRuns', run);
            if (!dropped) break;
          }
          await database
            .query()
            .updateTable('managedDevices')
            .set({
              matchState: 'ignored',
              ignoredById: actorId,
              ignoredAt: new Date(),
              ignoreReason: texts.syncMeetingRoom,
            })
            .where('source', '=', 'intune')
            .where('externalId', '=', 'demo-meeting-room')
            .execute();
          const pulled = await database
            .query()
            .selectFrom('managedDevices')
            .select(['id'])
            .where('source', '=', 'intune')
            .where(
              'externalId',
              'in',
              observed.map((device) => device.externalId),
            )
            .execute<{ id: string }>();
          for (const row of pulled) await track('managedDevices', row);

          // The demo's Jamf (step 3, 2026-10-15): the Macs in use, managed by
          // Jamf as well as Intune — kept off the three Intune shows wrong on
          // purpose, so Jamf's later word does not put them right — and the
          // phones in use but one, a test phone on no platform and marked
          // 不需要纳管 (2026-10-15); the laptops on none stay 只在台账.
          const jamfMacs = inUse.filter(
            (row, index) => index > 2 && row.manufacturer === 'Apple',
          );
          const phones = register.filter(
            (row) =>
              row.categoryId === 'cat-phone' &&
              row.status === 'inUse' &&
              typeof row.serialNo === 'string' &&
              row.serialNo,
          );
          const jamfObserved: ObservedDevice[] = [
            ...jamfMacs.map((row, index) => ({
              ...observation(row, index),
              externalId: `computer:demo-${String(row.id).slice(0, 8)}`,
              compliance: null,
              lastSyncAt: syncedAgo(index % 2, 23),
              raw: { id: `demo-${String(row.id).slice(0, 8)}`, demo: true },
            })),
            ...phones.slice(1).map((row, index) =>
              extra(`mobile:demo-${String(row.id).slice(0, 8)}`, {
                serialNo: String(row.serialNo),
                deviceName: String(row.name ?? row.serialNo),
                manufacturer: 'Apple',
                model: (row.model as string | null) ?? null,
                osName: 'iOS',
                osVersion: '18.6.2',
                userPrincipal: (row.email as string | null) ?? null,
                userName: (row.personName as string | null) ?? null,
                compliance: null,
                lastSyncAt: syncedAgo(index % 2, 21),
              }),
            ),
          ];
          if (jamfObserved.length > 0) {
            const jamfRun = await dependencies.deviceSync.ingest(
              'jamf',
              (async function* () {
                yield jamfObserved;
              })(),
              'demo',
              actorId,
            );
            await track('deviceSyncRuns', jamfRun);
            const jamfPulled = await database
              .query()
              .selectFrom('managedDevices')
              .select(['id'])
              .where('source', '=', 'jamf')
              .where(
                'externalId',
                'in',
                jamfObserved.map((device) => device.externalId),
              )
              .execute<{ id: string }>();
            for (const row of jamfPulled) await track('managedDevices', row);
          }
          const testPhone = phones[0];
          if (testPhone)
            await database
              .query()
              .insertInto('deviceSyncExemptions')
              .values({
                id: crypto.randomUUID(),
                deviceId: String(testPhone.id),
                reason: texts.syncTestPhone,
                exemptedById: actorId,
                createdAt: new Date(),
              })
              .execute();
        }

        // What the work agents would have left (2026-10-16), written rather
        // than asked of a model: reviews of the requests still waiting, the
        // MDM follow-up on the pulls above, and the joiners' picks.
        if (dependencies.agents)
          await writeDemoSuggestions({
            database,
            agents: dependencies.agents,
            locale,
            actorId,
            track,
            requests: {
              monitorOrder: String(monitorOrder.id),
              airOrder: airOrderId,
              switchOrder: switchOrderId,
              internOrder: String(internOrder.id),
              printerDisposal: String(printerDisposal.id),
            },
            joiners: joinerIds,
          });

        importPercent = 100;
        return await this.status();
      } finally {
        importPercent = undefined;
      }
    },

    async clear(actorId) {
      const tracked = await database
        .query()
        .selectFrom('demoRecords')
        .select(['collection', 'recordId'])
        .execute<{ collection: string; recordId: string }>();
      const byCollection = new Map<string, string[]>();
      for (const row of tracked)
        byCollection.set(row.collection, [
          ...(byCollection.get(row.collection) ?? []),
          row.recordId,
        ]);
      const allIds = tracked.map((row) => row.recordId);
      await database.transaction(async (connection) => {
        if (allIds.length > 0) {
          for (const dependent of DEPENDENTS) {
            await connection.query
              .deleteFrom(dependent.table)
              .where(dependent.column, 'in', allIds)
              .execute();
          }
          // Records the demo touched but did not create (receipts of the demo order, seats of demo people).
          await connection.query
            .deleteFrom('entitlementSeats')
            .where('holderId', 'in', allIds)
            .execute();
          await connection.query
            .deleteFrom('stockHoldings')
            .where('holderId', 'in', allIds)
            .execute();
          // Devices the user assigned or reserved to demo people or places
          // go back to stock rather than pointing at nothing — a correction
          // of the device's lifecycle (2026-10-19), since only the runtime
          // writes its state.
          const stranded = await connection.query
            .selectFrom('devices')
            .select('id')
            .where('assigneeId', 'in', allIds)
            .where('id', 'not in', allIds)
            .execute<{ id: string }>();
          for (const device of stranded)
            await devices.correctStatus(
              device.id,
              { status: 'inStock', reason: 'Demo data cleared' },
              { actorId },
              unrestricted('devices', 'update'),
              connection,
            );
          await connection.query
            .updateTable('devices')
            .set({
              reservedForType: null,
              reservedForId: null,
              reservedUntil: null,
            })
            .where('reservedForId', 'in', allIds)
            .execute();
          await connection.query
            .updateTable('allocations')
            .set({ endedAt: new Date() })
            .where('targetId', 'in', allIds)
            .where('endedAt', 'is', null)
            .execute();
          await connection.query
            .deleteFrom('auditItems')
            .where('deviceId', 'in', allIds)
            .execute();
          await connection.query
            .deleteFrom('disposalDevices')
            .where('deviceId', 'in', allIds)
            .execute();
        }
        for (const collection of ORDER) {
          const ids = byCollection.get(collection);
          if (!ids || ids.length === 0) continue;
          await connection.query
            .deleteFrom(collection)
            .where('id', 'in', ids)
            .execute();
        }
        await connection.query
          .deleteFrom('demoRecords')
          .where('recordId', 'in', allIds.length ? allIds : ['__none__'])
          .execute();
        // The numbers the demo took go with its records: importing it again
        // starts where the remaining data ends (PO-000001 on a database that
        // held only the demo), so the demo reads the same every time instead
        // of climbing with each import.
        await dependencies.numbering?.rewind({ connection });
        // The agents' runs about records that are gone, whoever made them
        // (2026-10-16): an import before the demo tracked its runs left
        // reviews and MDM follow-ups behind, shown in 收件箱 under a bare id
        // or naming devices that no longer exist. A follow-up is gone once
        // none of its items' devices or platform records is left; a run
        // that failed with nothing to show goes too. Their plans go with
        // them.
        const runs = await connection.query
          .selectFrom('itamAgentRuns')
          .select(['id', 'agent', 'status', 'subjectId', 'result'])
          .execute<Row>();
        const exists = async (table: string, ids: readonly string[]) =>
          ids.length
            ? new Set(
                (
                  await connection.query
                    .selectFrom(table)
                    .select('id')
                    .where('id', 'in', [...ids])
                    .execute<{ id: unknown }>()
                ).map((row) => String(row.id)),
              )
            : new Set<string>();
        const subjectsOf = (run: Row): string[] => {
          const result =
            typeof run.result === 'string'
              ? (JSON.parse(run.result) as Row)
              : (run.result as Row | null);
          const items = Array.isArray(result?.items) ? result.items : [];
          return items.map((item) => String((item as Row).subject));
        };
        const requests = runs.filter((run) => run.agent === 'approvalReview');
        const followUps = runs.filter((run) => run.agent === 'deviceSync');
        const subjects = followUps.flatMap(subjectsOf);
        const present = new Set([
          ...(await exists(
            'purchaseOrders',
            requests.map((run) => String(run.subjectId)),
          )),
          ...(await exists(
            'disposals',
            requests.map((run) => String(run.subjectId)),
          )),
          ...(await exists('devices', subjects)),
          ...(await exists('managedDevices', subjects)),
        ]);
        const gone = [
          ...requests.filter((run) => !present.has(String(run.subjectId))),
          ...followUps.filter((run) => {
            const items = subjectsOf(run);
            return items.length
              ? !items.some((id) => present.has(id))
              : run.status === 'failed';
          }),
        ].map((run) => String(run.id));
        if (gone.length) {
          await connection.query
            .deleteFrom('itamPlans')
            .where('runId', 'in', gone)
            .execute();
          await connection.query
            .deleteFrom('itamAgentRuns')
            .where('id', 'in', gone)
            .execute();
        }
      });
      // The notifications the demo's requests sent (2026-10-16): they name
      // records that are gone, and the importer's inbox kept each import's
      // copy beside the next one's. They are the notification plugins'
      // tables, keyed by the source the notifier gave them; an application
      // without those plugins has nothing to remove.
      if (allIds.length > 0)
        await database
          .transaction(async (connection) => {
            // Ids first: the query layer takes a list, not a subquery.
            const idsOf = (rows: readonly { id: unknown }[]) =>
              rows.map((row) => String(row.id));
            const dispatches = idsOf(
              await connection.query
                .selectFrom('notificationDispatches')
                .select('id')
                .where('sourceReferenceId', 'in', allIds)
                .execute<{ id: unknown }>(),
            );
            if (dispatches.length === 0) return;
            const deliveries = idsOf(
              await connection.query
                .selectFrom('notificationDeliveries')
                .select('id')
                .where('notificationId', 'in', dispatches)
                .execute<{ id: unknown }>(),
            );
            await connection.query
              .deleteFrom('notificationInAppItems')
              .where('notificationId', 'in', dispatches)
              .execute();
            if (deliveries.length > 0)
              for (const table of [
                'notificationDeliveryAttempts',
                'notificationDeliveryRetryAudits',
              ])
                await connection.query
                  .deleteFrom(table)
                  .where('deliveryId', 'in', deliveries)
                  .execute();
            await connection.query
              .deleteFrom('notificationDeliveries')
              .where('notificationId', 'in', dispatches)
              .execute();
            await connection.query
              .deleteFrom('notificationDispatches')
              .where('id', 'in', dispatches)
              .execute();
          })
          .catch(() => undefined);
      // The sign-ins go last, once the people that referenced them are gone,
      // and through the users plugin rather than the table: removing an
      // account also ends its sessions and permission-set assignments.
      for (const userId of byCollection.get('accounts') ?? [])
        await dependencies.accounts?.remove(userId, actorId);
      // The importer's asset manager set, which the demo gave.
      for (const assignmentId of byCollection.get('importerGrants') ?? [])
        await dependencies.accounts
          ?.revoke(assignmentId)
          .catch(() => undefined);
      return this.status();
    },
  };
}
