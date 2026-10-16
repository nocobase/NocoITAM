import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService, OperationContext } from './devices.js';
import type { ObservedDevice } from './device-sources.js';
import type { DeviceSyncService } from './device-sync.js';
import type { AuditService, CountInput } from './audits.js';
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
import type { RepairService } from './repairs.js';
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
}

/**
 * How far the import this process runs has got, 0 to 100, for the progress
 * bar the settings tab and the banner show while it runs (after NocoCRM's);
 * undefined while none runs here (2026-10-16).
 */
let importPercent: number | undefined;

export interface DemoService {
  status(): Promise<DemoSummary>;
  /** Without a language, the demo follows the deployment's default locale. */
  generate(actorId: string, language?: DemoLanguage): Promise<DemoSummary>;
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
  // Noco's background suggestions for the demo's joiners.
  { table: 'onboardingRuns', column: 'personId' },
  // 忽略 on the demo's differences (device sync, 2026-10-15).
  { table: 'deviceSyncDismissals', column: 'deviceId' },
  // 不需要纳管 on the demo's test phone (2026-10-15).
  { table: 'deviceSyncExemptions', column: 'deviceId' },
];

/** Deleted in dependency order: children before the master data they reference. */
const ORDER: readonly string[] = [
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
const TEXTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'en-US': {
    onboardingBatch: 'Onboarding batch',
    approval: 'Approved for onboarding',
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
    m365Growth: 'Four more seats for this year’s new hires',
    tonerTopUp: 'Bought locally while the order was on its way',
    paperDelivery: 'Quarterly paper delivery',
    miceDamaged: 'Scroll wheel broken; not worth repairing',
    returnedGood: 'Good condition; wiped and back on the shelf',
    returnedLoan: 'Back from the customer visit, all accessories present',
  },
  'zh-CN': {
    onboardingBatch: '新员工入职配备',
    approval: '入职配备已批准',
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
    m365Growth: '为今年的新员工增加 4 个席位',
    tonerTopUp: '订单未到，先在本地采购应急',
    paperDelivery: '每季度纸张配送',
    miceDamaged: '滚轮损坏，不值得维修',
    returnedGood: '完好，已清除数据并放回库存',
    returnedLoan: '客户拜访归来，配件齐全',
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
      };
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
        // takes the actor for one. The account that generated the demo is the
        // system administrator and answers for nothing (2026-10-05); it only
        // stands in when the accounts plugins are missing (tests, a reset).
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
        const md = async (collection: string, input: Row) =>
          track(
            collection,
            await masterData.create(
              collection,
              { ...MASTER_DEFAULTS[collection], ...input },
              writerId,
              all(collection, 'create'),
            ),
          );

        await reached(5);
        // Master data
        // Vendors are fictional companies; their names read in the
        // deployment's language and keep the demo marker. They were on the
        // books long before the oldest device.
        await on(-1950);
        const vendorNames = VENDOR_NAMES[locale] ?? VENDOR_NAMES['en-US'];
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
        const texts = TEXTS[locale] ?? TEXTS['en-US'];
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
        // pixel. Noco reads the repairs, the notes and the replacement dates
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
            totalQuantity: 5,
            minimumQuantity: 5,
          },
          -900,
        );
        await issue(mice, 'person', zhangWei, 1, -880);
        await issue(mice, 'person', liNa, 1, -870);
        await takeBack(mice, 'person', zhangWei, -420);
        await on(-300);
        await stock.adjust(
          String(mice.id),
          { quantity: -1, reason: 'damaged', notes: texts.miceDamaged },
          context,
          all('stockItems', 'update'),
        );
        await issue(mice, 'person', liuYang, 1, -285);
        await takeBack(mice, 'person', liuYang, -60);
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
            totalQuantity: 4,
            minimumQuantity: 3,
          },
          -700,
        );
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
        const docks = await stockItem(
          {
            kind: 'accessory',
            name: 'Dell WD22TB4 dock',
            categoryId: dockCat.id,
            modelId: wd22.id,
            manufacturerId: latitude.manufacturer.id,
            totalQuantity: 6,
            minimumQuantity: 2,
          },
          -800,
        );
        await issue(docks, 'person', zhangWei, 1, -790);
        // The leaver holds one of these too: a dock goes back to stock, which
        // is a different answer from a device's 归还 and from a seat's 回收,
        // and the recovery has to show all three.
        await issue(docks, 'person', chenJie, 1, -700);
        // Docks went out and came back, so returns show in the history.
        await issue(docks, 'person', wangFang, 1, -600);
        await takeBack(docks, 'person', wangFang, -510);
        await issue(docks, 'person', liuYang, 1, -280);
        await takeBack(docks, 'person', liuYang, -150);
        const headsets = await stockItem(
          {
            kind: 'accessory',
            name: 'Logitech Zone Vibe 100',
            categoryId: headsetCat.id,
            modelId: zoneVibe.id,
            manufacturerId: mxMaster.manufacturer.id,
            totalQuantity: 10,
            minimumQuantity: 3,
          },
          -400,
        );
        await issue(headsets, 'person', wangFang, 1, -390);
        await issue(headsets, 'person', zhaoMin, 1, -325);
        await takeBack(headsets, 'person', wangFang, -120);
        // A USB-C hub for travelling, lent for trips and back.
        const hubModel = await named('models', {
          name: 'DA310',
          categoryId: dockCat.id,
          manufacturerId: latitude.manufacturer.id,
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
        const webcamCat = await named('categories', {
          ...MASTER_DEFAULTS.categories,
          name: texts.webcamCategory,
          appliesTo: 'accessory',
        });
        const webcamModel = await named('models', {
          name: 'Brio 4K',
          categoryId: webcamCat.id,
          manufacturerId: mxMaster.manufacturer.id,
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
        const paperModel = await named('models', {
          name: 'Office Paper A4 80 g',
          categoryId: printSuppliesCat.id,
          manufacturerId: hpToner.manufacturer.id,
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
        const duracell = await named('manufacturers', { name: 'Duracell' });
        const aaModel = await named('models', {
          name: 'Plus AA',
          categoryId: batteryCat.id,
          manufacturerId: duracell.id,
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
        const bigSsdModel = await named('models', {
          name: '990 PRO 2 TB',
          categoryId: diskCat.id,
          manufacturerId: ssdModel.manufacturer.id,
          code: 'MZ-V9P2T0BW',
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
        const smallRamModel = await named('models', {
          name: 'DDR5-5600 16 GB SO-DIMM',
          categoryId: ramCat.id,
          manufacturerId: ramModel.manufacturer.id,
          code: 'CT16G56C46S5',
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
          quantity: 5,
          unitPrice: 700,
          orderedDaysAgo: 200,
          extra: {
            name: texts.ideLicense,
            licensingModel: 'perUser',
          },
        });
        await seatsTo(ideLicense, [liNa, zhangWei, liuYang], -195);
        // Two subscriptions whose dates fall inside the week: one that will
        // charge (yearly auto-renew) and one that will stop (nothing renews
        // it). They are opposite acts, and the workbench lists them apart.
        await subscription(
          {
            name: 'Zoom Workplace Pro（年付）',
            softwareProductId: zoom.id,
            billingModel: 'perSeat',
            seatCount: 2,
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            expiryDate: daysFromNow(5),
            autoRenew: true,
          },
          -360,
        );
        await subscription(
          {
            name: 'Figma Professional（试用）',
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
            seatCount: 6,
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
            seatCount: 8,
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
          [approver, writer, support, zhangWei, wangFang],
          -755,
        );
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
            seatCount: 3,
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
          readonly sentDays: number;
          readonly returnDays: number;
          readonly cost: number;
          readonly notes?: string;
        }[] = [
          {
            deviceId: String(airs[1].id),
            method: 'internal',
            fault: texts.repairKeyboard,
            sentDays: -25,
            returnDays: -22,
            cost: 380,
          },
          {
            deviceId: String(monitors[0].id),
            method: 'vendorWarranty',
            vendorId: String(reseller.id),
            fault: texts.repairPanel,
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
            sentDays: -160,
            returnDays: -157,
            cost: 0,
          },
          {
            deviceId: String(repairedSpare.id),
            method: 'internal',
            fault: texts.repairKeyboard,
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
          approverId,
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
        }): Promise<void> => {
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
          if (order.stage === 'draft') return;
          await procurement.submit(
            id,
            approverId,
            context,
            all('purchaseOrders', 'submit'),
          );
          if (order.stage === 'pendingApproval') return;
          await on(-order.raisedDaysAgo + 1);
          if (
            (await procurement.get(id, all('purchaseOrders', 'read')))
              ?.status === 'pendingApproval'
          )
            await procurement.decide(
              id,
              order.stage === 'rejected' ? 'rejected' : 'approved',
              order.stage === 'rejected' ? (order.why ?? '') : texts.approval,
              { actorId: approverId, sourceType: 'demo' },
              all('purchaseOrders', 'approve'),
            );
          if (order.stage === 'rejected' || order.stage === 'approved') return;
          if (order.stage === 'cancelled') {
            await procurement.cancel(
              id,
              order.why ?? '',
              context,
              all('purchaseOrders', 'cancel'),
            );
            return;
          }
          await on(-3);
          await procurement.markOrdered(
            id,
            { orderedAt: daysFromNow(-3), expectedAt: daysFromNow(4) },
            context,
            all('purchaseOrders', 'order'),
          );
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
        await queuedOrder({
          description: texts.itSpareOrder,
          reason: 'batchReplacement',
          departmentId: itDept.id,
          neededInDays: 45,
          lines: [line('device', thinkpad, 2, 9999)],
          stage: 'draft',
          raisedDaysAgo: 3,
        });
        await queuedOrder({
          description: texts.salesPhoneOrder,
          reason: 'newHire',
          departmentId: sales.id,
          neededInDays: 20,
          lines: [line('device', iphone, 3, 5999)],
          stage: 'draft',
          raisedDaysAgo: 2,
        });
        await queuedOrder({
          description: texts.airOrder,
          reason: 'newHire',
          departmentId: rnd.id,
          neededInDays: 14,
          lines: [line('device', air, 4, 8999)],
          stage: 'pendingApproval',
          raisedDaysAgo: 5,
        });
        await queuedOrder({
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
              executorIds: [supportUserId ?? writerId],
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
          approverId,
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

        await reached(95);
        // 入职准备: joining in five and nine days, nothing reserved yet. Entered
        // last, once the spare laptops, monitors, stock and seats exist:
        // saving a joiner is what sets Noco choosing their equipment
        // (`onboarding-advisor.ts`), and entered first it found nothing in
        // stock to choose from, or half of it.
        const productDept = await seededIn('departments', 'dept-product');
        for (const [index, entry] of (
          JOINER_NAMES[locale] ??
          JOINER_NAMES['en-US'] ??
          []
        ).entries()) {
          await md('people', {
            name: entry.name,
            employeeNo: `EMP-${String(index + 301).padStart(3, '0')}`,
            email: `${entry.mail}@northbridge.example`,
            position: entry.position,
            departmentId: index === 0 ? rnd.id : productDept.id,
            locationId: floor3.id,
            hireDate: daysFromNow(index === 0 ? 5 : 9),
          });
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
          // go back to stock rather than pointing at nothing.
          await connection.query
            .updateTable('devices')
            .set({
              status: 'inStock',
              assigneeType: null,
              assigneeId: null,
              assignedAt: null,
              expectedReturnDate: null,
            })
            .where('assigneeId', 'in', allIds)
            .where('id', 'not in', allIds)
            .execute();
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
      });
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
