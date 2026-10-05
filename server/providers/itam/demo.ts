import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService, OperationContext } from './devices.js';
import type { AuditService, CountInput } from './audits.js';
import { unrestricted } from './authz-filter.js';
import { asText, type Row } from './collection-query.js';
import type { DisposalService } from './disposals.js';
import { BusinessRuleError } from './errors.js';
import type { EntitlementService } from './entitlements.js';
import type { MasterDataService } from './master-data.js';
import type {
  LineInput,
  LineItemType,
  ProcurementService,
} from './procurement.js';
import type { RepairService } from './repairs.js';
import type { StockService } from './stock.js';
import { addDays, isoDate } from './dates.js';

/**
 * Demo data for a first look: a fictional company ("Demo Co.") with the
 * main chain — purchase, receipt, assignment, fault, repair, audit,
 * disposal — and deliberate problem records (expired warranty, idle stock,
 * over-allocated entitlement, unused seats, a leaver still holding devices,
 * unaudited devices, one batch expiring together). Everything is written
 * through the services, every id is tracked in `demoRecords`, and dates are
 * offsets from the day it runs. No notification leaves the system.
 */
export interface DemoSummary {
  readonly generated: boolean;
  readonly counts: Readonly<Record<string, number>>;
}

export interface DemoService {
  status(): Promise<DemoSummary>;
  generate(actorId: string): Promise<DemoSummary>;
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
 * the system administrator and no employee: it gets no person record.
 * A password is the username and 123: this is demonstration data, and
 * clearing it removes the accounts.
 */
export const DEMO_STAFF_ACCOUNTS: readonly DemoAccountSpec[] = [
  {
    username: 'sunqiang',
    name: 'Sun Qiang',
    email: 'sun.qiang@northbridge.example',
    password: 'sunqiang123',
    permissionSet: 'itam-asset-manager',
  },
  {
    username: 'wujing',
    name: 'Wu Jing',
    email: 'wu.jing@northbridge.example',
    password: 'wujing123',
    permissionSet: 'itam-asset-manager',
  },
  {
    username: 'zhouyu',
    name: 'Zhou Yu',
    email: 'zhou.yu@northbridge.example',
    password: 'zhouyu123',
    permissionSet: 'itam-it-support',
  },
];

/** The role accounts the demo created until 2026-10-05, removed by name. */
const RETIRED_DEMO_USERNAMES = ['manager', 'support'] as const;

/**
 * Each staff sign-in's name and position by locale: the account and the
 * person record behind it carry the same name, as the leaver's do.
 */
const STAFF_PEOPLE: Readonly<
  Record<string, Readonly<Record<string, { name: string; position: string }>>>
> = {
  'en-US': {
    sunqiang: { name: 'Sun Qiang', position: 'IT Asset Manager' },
    wujing: { name: 'Wu Jing', position: 'IT Asset Manager' },
    zhouyu: { name: 'Zhou Yu', position: 'IT Support Engineer' },
  },
  'zh-CN': {
    sunqiang: { name: '孙强', position: 'IT 资产经理' },
    wujing: { name: '吴静', position: 'IT 资产经理' },
    zhouyu: { name: '周宇', position: 'IT 支持工程师' },
  },
};

/**
 * Every username the demo owns. `pnpm data:reset` wipes `demoRecords` with
 * the rest of the ITAM tables, which is where the demo tracks its accounts,
 * so the command removes them by name instead.
 */
export function demoAccountUsernames(): readonly string[] {
  return [
    ...DEMO_STAFF_ACCOUNTS.map((spec) => spec.username),
    // A database generated before 2026-10-05 still holds these.
    ...RETIRED_DEMO_USERNAMES,
    ...(PERSON_NAMES['en-US'] ?? []).map((entry) =>
      entry.mail.replaceAll('.', ''),
    ),
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
];

/** Deleted in dependency order: children before the master data they reference. */
const ORDER: readonly string[] = [
  'disposals',
  'auditTasks',
  'repairs',
  'purchaseOrders',
  'entitlements',
  'stockItems',
  'devices',
  'people',
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
    reseller: { name: 'Northbridge IT Supply', contact: 'Sun Qiang' },
    repair: { name: 'Northbridge Repair Center', contact: 'Zhou Lei' },
    recycler: { name: 'GreenLoop Recycling', contact: 'Xu Ping' },
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
    itSpareOrder: 'Spare laptops for IT',
    salesPhoneOrder: 'Phones for the new sales hires',
    airOrder: 'MacBook Air for the R&D hires',
    switchOrder: 'Second core switch for the server room',
    printerReplaceOrder: 'Replacement printer for the third floor',
    mouseOrder: 'Mouse stock',
    ssdOrder: 'Spare SSDs',
    desktopOrder: 'Desktop refresh for sales',
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
    itSpareOrder: 'IT 备用笔记本',
    salesPhoneOrder: '销售新员工手机',
    airOrder: '研发新员工 MacBook Air',
    switchOrder: '机房第二台核心交换机',
    printerReplaceOrder: '3 楼打印机更换',
    mouseOrder: '鼠标补货',
    ssdOrder: '固态硬盘备件',
    desktopOrder: '销售部台式机更换',
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
  },
};

/**
 * The person the demo sets up to leave — it does not mark them left; that
 * is the one act worth performing by hand, see where this is used.
 *
 * They are IT, and so they sign in: leaving is only half a
 * story while the register has nothing of theirs to hand over. A salesperson
 * answers for none of its records, so the one who leaves is the IT support
 * engineer — their devices, their repairs and the orders they raised all
 * need somebody else's name on them, which is the part of offboarding no
 * return button settles. Their account stays enabled, which is the point the
 * assistant makes about seats: this register cannot disable a sign-in.
 */
const LEAVER_INDEX = 3;

/** Demo people by locale: display name and the romanised mailbox. */
const PERSON_NAMES: Readonly<
  Record<string, readonly { name: string; mail: string; position: string }[]>
> = {
  'en-US': [
    { name: 'Li Na', mail: 'li.na', position: 'Frontend Engineer' },
    { name: 'Zhang Wei', mail: 'zhang.wei', position: 'Backend Engineer' },
    { name: 'Wang Fang', mail: 'wang.fang', position: 'Sales Manager' },
    { name: 'Chen Jie', mail: 'chen.jie', position: 'IT Support Engineer' },
    { name: 'Liu Yang', mail: 'liu.yang', position: 'QA Engineer' },
    { name: 'Zhao Min', mail: 'zhao.min', position: 'Presales Consultant' },
  ],
  'zh-CN': [
    { name: '李娜', mail: 'li.na', position: '前端工程师' },
    { name: '张伟', mail: 'zhang.wei', position: '后端工程师' },
    { name: '王芳', mail: 'wang.fang', position: '销售经理' },
    { name: '陈杰', mail: 'chen.jie', position: 'IT 支持工程师' },
    { name: '刘洋', mail: 'liu.yang', position: '测试工程师' },
    { name: '赵敏', mail: 'zhao.min', position: '售前顾问' },
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
  /** Recomputes workbench reminders so the problem records show up at once. */
  refreshReminders: () => Promise<unknown>;
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

  return {
    async status() {
      const result = await counts();
      return { generated: Object.keys(result).length > 0, counts: result };
    },

    async generate(actorId) {
      if ((await this.status()).generated)
        throw new BusinessRuleError(
          'Demo data already exists; clear it first',
          'DEMO_EXISTS',
        );
      const context: OperationContext = { actorId, sourceType: 'demo' };
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
      const staffNames =
        STAFF_PEOPLE[dependencies.locale?.() ?? 'en-US'] ??
        STAFF_PEOPLE['en-US'];
      const staffUserIds = await Promise.all(
        DEMO_STAFF_ACCOUNTS.map((spec) =>
          account({
            ...spec,
            name: staffNames[spec.username]?.name ?? spec.name,
          }),
        ),
      );
      const [managerUserId, , supportUserId] = staffUserIds;
      // Who decides the demo's requests: the first asset manager, who holds
      // `approve`, so the approval trail reads as a colleague and the order
      // left waiting can actually be decided by signing in as them. Without
      // the accounts plugins the demo falls back to any other real account,
      // then to a stand-in id whose request nobody can decide.
      const approverId =
        managerUserId ??
        (await dependencies.otherUser?.(actorId)) ??
        'demo-approver';
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
            actorId,
            all(collection, 'create'),
          ),
        );

      // Master data
      // Vendors are fictional companies; their names read in the
      // deployment's language and keep the demo marker.
      const vendorNames =
        VENDOR_NAMES[dependencies.locale?.() ?? 'en-US'] ??
        VENDOR_NAMES['en-US'];
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
      const mouseCat = await seeded('cat-mouse');
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
      const office = await seededIn('softwareProducts', 'sp-office-ltsc-2024');
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
      const personNames =
        PERSON_NAMES[dependencies.locale?.() ?? 'en-US'] ??
        PERSON_NAMES['en-US'];
      const texts = TEXTS[dependencies.locale?.() ?? 'en-US'] ?? TEXTS['en-US'];
      const itDept = await seededIn('departments', 'dept-it');
      // The leaver is IT support; the rest are the two business teams.
      const departmentsByIndex = [rnd, rnd, sales, itDept, rnd, sales];
      for (const [index, entry] of personNames.entries()) {
        // Only the leaver signs in: they are IT, and a person who has left
        // still owns the records that name them, which point at a sign-in.
        // The others are employees, who are people in the register and not
        // accounts (2026-10-05). The username is the romanised mailbox,
        // which does not move with the locale the display names follow.
        const userId =
          index === LEAVER_INDEX
            ? await account({
                username: entry.mail.replaceAll('.', ''),
                name: entry.name,
                email: `${entry.mail}@northbridge.example`,
                password: `${entry.mail.replaceAll('.', '')}123`,
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
            hireDate: daysFromNow(-400 + index * 60),
            ...(userId ? { userId } : {}),
          }),
        );
      }
      const [liNa, zhangWei, wangFang, chenJie, liuYang, zhaoMin] = people as [
        Row,
        Row,
        Row,
        Row,
        Row,
        Row,
      ];

      // The staff sign-ins get a person record of their own, in IT, so the
      // equipment they are issued has somebody to be assigned to.
      const itDepartment = itDept;
      const staff = new Map<string, Row>();
      for (const [index, spec] of DEMO_STAFF_ACCOUNTS.entries()) {
        const entry = staffNames[spec.username];
        if (!entry) continue;
        staff.set(
          spec.username,
          await md('people', {
            name: entry.name,
            // EMP-001 belongs to a seeded person, and EMP-1xx to the demo
            // employees above.
            employeeNo: `EMP-${String(index + 201).padStart(3, '0')}`,
            email: spec.email,
            phone: `138 0013 0${String(index + 201)}`,
            position: entry.position,
            departmentId: itDepartment.id,
            locationId: floor3.id,
            hireDate: daysFromNow(-900 + index * 120),
            ...(staffUserIds[index] ? { userId: staffUserIds[index] } : {}),
          }),
        );
      }

      // What the leaver answers for. Returning equipment is only half of
      // offboarding: the records naming them as 负责人 keep naming
      // them until somebody takes them over, and nothing but a person can do
      // that. The demo gives them a few so the handover half has something
      // to show.
      const leaverUserId = asText(chenJie.userId) ?? actorId;

      // Devices: a batch of laptops bought together (same warranty), monitors, and problem records.
      const device = async (input: Row) =>
        track(
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
              cpu: 'Apple M3',
              memory: '16 GB',
              storage: '512 GB',
              macAddress: macFor(index),
              hostname: `SG-LT-00${index + 1}`,
              screenSize: '14',
            },
          }),
        );
      }
      // The laptop the leaver holds answers to IT support, not to the
      // account that generated the demo: a leaver's things belong to more
      // than one person, which is the whole reason the recovery lists every
      // item and counts only the reader's own.
      const expiredLaptop = await device({
        modelId: latitude.id,
        serialNo: '7YQ2K73',
        name: 'SG-LT-006',
        departmentId: sales.id,
        vendorId: reseller.id,
        ownerId: supportUserId ?? actorId,
        purchaseDate: daysFromNow(-1500),
        purchasePrice: 8999,
        warrantyEndDate: daysFromNow(-100),
        attributes: {
          os: 'Windows 11 23H2',
          cpu: 'Intel Core i5-1335U',
          memory: '16 GB',
          storage: '512 GB',
          macAddress: 'b0:4f:13:20:01:01',
          hostname: 'SG-LT-006',
          screenSize: '14',
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
        attributes: {
          os: 'Windows 11 24H2',
          cpu: 'Intel Core i7-1355U',
          memory: '32 GB',
          storage: '1 TB',
          macAddress: 'b0:4f:13:20:02:02',
          hostname: 'SG-LT-007',
          screenSize: '14',
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
              cpu: 'Apple M3',
              memory: '16 GB',
              storage: '256 GB',
              macAddress: `a4:83:e7:2${index}:2${index}:2${index}`,
              hostname: `SG-LT-01${index}`,
              screenSize: '13',
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
              cpu: 'Intel Core Ultra 5 125U',
              memory: '16 GB',
              storage: '512 GB',
              macAddress: `b0:4f:13:3${index}:3${index}:3${index}`,
              hostname: `SG-LT-02${index}`,
              screenSize: '14',
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
            attributes: {
              screenSize: '27',
              resolution: '3840×2160',
              inputs: 'HDMI, DisplayPort, USB-C',
            },
          }),
        );
      }
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
          cpu: 'Intel Core i5-13500',
          memory: '16 GB',
          storage: '512 GB',
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
          rackUnits: 2,
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
          ports: 48,
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
          color: false,
          duplex: true,
          consumable: 'CF258A',
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
      const staffLaptops = new Map<string, Row>();
      for (const [index, username] of ['sunqiang', 'zhouyu'].entries()) {
        if (!staff.has(username)) continue;
        staffLaptops.set(
          username,
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
      const deskOwner = staff.get('wujing');
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

      // Idle: bought long ago, never assigned — make its updatedAt old so the idle rule sees it.
      await database
        .query()
        .updateTable('devices')
        .set({ updatedAt: new Date(Date.now() - 200 * DAY) })
        .where('id', '=', String(idleLaptop.id))
        .execute();

      // Assignments
      const assign = (deviceId: unknown, personId: unknown) =>
        devices.assign(
          String(deviceId),
          {
            targetType: 'person',
            targetId: String(personId),
          },
          context,
          all('devices', 'assign'),
        );
      await assign(laptops[0].id, liNa.id);
      await assign(laptops[1].id, zhangWei.id);
      await assign(laptops[2].id, liuYang.id);
      await assign(laptops[3].id, wangFang.id);
      await assign(airs[0].id, zhaoMin.id);
      await assign(thinkpads[0].id, liuYang.id);
      await assign(expiredLaptop.id, chenJie.id);
      // A second thing in the leaver's hands, this one answering to the
      // account that generated the demo: their laptop is at the repair shop
      // and answers to IT support, so without this the person reading the
      // recovery has nothing on it they can actually hand back.
      await assign(airs[1].id, chenJie.id);
      await assign(monitors[0].id, liNa.id);
      await assign(monitors[1].id, zhaoMin.id);
      await assign(deskPc.id, wangFang.id);
      await assign(mobile.id, zhaoMin.id);
      for (const [username, laptop] of staffLaptops)
        await assign(laptop.id, staff.get(username)!.id);
      if (deskOwner)
        for (const owned of deskDevices) await assign(owned.id, deskOwner.id);
      // Shared equipment lives at its location rather than with a person.
      const assignTo = (deviceId: unknown, locationId: unknown) =>
        devices.assign(
          String(deviceId),
          {
            targetType: 'location',
            targetId: String(locationId),
          },
          context,
          all('devices', 'assign'),
        );
      await assignTo(rack.id, serverRoom.id);
      await assignTo(coreSwitch.id, serverRoom.id);
      await assignTo(vm.id, serverRoom.id);
      await assignTo(officePrinter.id, floor3.id);
      // A loan overdue for a week: lent for a few days, then the return
      // date is moved into the past (the service refuses a past date).
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
      await database
        .query()
        .updateTable('devices')
        .set({ expectedReturnDate: daysFromNow(-7) })
        .where('id', '=', String(laptops[4].id))
        .execute();
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

      // Stock: an accessory below its minimum, a consumable, a component installed on a laptop.
      const stockItem = async (input: Row) =>
        track(
          'stockItems',
          await stock.create(
            { locationId: warehouse.id, ...input },
            context,
            all('stockItems', 'create'),
          ),
        );
      const mice = await stockItem({
        kind: 'accessory',
        name: 'Logitech MX Master 3S',
        categoryId: mouseCat.id,
        modelId: mxMaster.id,
        manufacturerId: mxMaster.manufacturer.id,
        totalQuantity: 4,
        minimumQuantity: 5,
      });
      await stock.issue(
        String(mice.id),
        { holderType: 'person', holderId: String(liNa.id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      // Stock bought through an order: the order runs request → approval →
      // ordered → received, so the item shows a purchase record with the
      // order's vendor and price.
      const purchasedStock = async (order: {
        readonly description: string;
        readonly itemType: 'accessory' | 'consumable' | 'component';
        readonly modelId: string;
        readonly name: string;
        readonly quantity: number;
        readonly unitPrice: number;
        readonly minimumQuantity: number;
        readonly orderedDaysAgo: number;
      }): Promise<Row> => {
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
        if (
          (await procurement.get(id, all('purchaseOrders', 'read')))?.status ===
          'pendingApproval'
        )
          await procurement.decide(
            id,
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
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
        await procurement.receive(
          id,
          {
            lineId: String(lines[0].id),
            quantity: order.quantity,
            locationId: String(warehouse.id),
            extra: { name: order.name, minimumQuantity: order.minimumQuantity },
          },
          context,
          all('purchaseOrders', 'receive'),
        );
        const itemId = (await procurement.generated(id)).find(
          (entry) => entry.type === 'stockItem',
        )?.id as string | undefined;
        if (!itemId) throw new Error(`${order.description}: no stock item`);
        return track('stockItems', { id: itemId });
      };
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
        if (
          (await procurement.get(id, all('purchaseOrders', 'read')))?.status ===
          'pendingApproval'
        )
          await procurement.decide(
            id,
            'approved',
            texts.approval,
            { actorId: approverId, sourceType: 'demo' },
            all('purchaseOrders', 'approve'),
          );
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
      const keyboards = await purchasedStock({
        description: texts.keyboardOrder,
        itemType: 'accessory',
        modelId: String(mxKeys.id),
        name: 'Logitech MX Keys',
        quantity: 8,
        unitPrice: 799,
        minimumQuantity: 3,
        orderedDaysAgo: 40,
      });
      for (const holder of [zhangWei, liuYang])
        await stock.issue(
          String(keyboards.id),
          { holderType: 'person', holderId: String(holder.id), quantity: 1 },
          context,
          all('stockItems', 'issue'),
        );
      const docks = await stockItem({
        kind: 'accessory',
        name: 'Dell WD22TB4 dock',
        categoryId: dockCat.id,
        modelId: wd22.id,
        manufacturerId: latitude.manufacturer.id,
        totalQuantity: 6,
        minimumQuantity: 2,
      });
      await stock.issue(
        String(docks.id),
        { holderType: 'person', holderId: String(zhangWei.id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      // The leaver holds one of these too: a dock goes back to stock, which
      // is a different answer from a device's 归还 and from a seat's 回收,
      // and the recovery has to show all three.
      await stock.issue(
        String(docks.id),
        { holderType: 'person', holderId: String(chenJie.id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      // One dock went out and came back, so a return shows in the history.
      await stock.issue(
        String(docks.id),
        { holderType: 'person', holderId: String(liuYang.id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      await stock.takeBack(
        String(docks.id),
        { holderType: 'person', holderId: String(liuYang.id), quantity: 1 },
        context,
        all('stockItems', 'return'),
      );
      const headsets = await stockItem({
        kind: 'accessory',
        name: 'Logitech Zone Vibe 100',
        categoryId: headsetCat.id,
        modelId: zoneVibe.id,
        manufacturerId: mxMaster.manufacturer.id,
        totalQuantity: 10,
        minimumQuantity: 3,
      });
      await stock.issue(
        String(headsets.id),
        { holderType: 'person', holderId: String(zhaoMin.id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      const toner = await purchasedStock({
        description: texts.tonerOrder,
        itemType: 'consumable',
        modelId: String(hpToner.id),
        name: 'HP 58A toner',
        quantity: 12,
        unitPrice: 280,
        minimumQuantity: 4,
        orderedDaysAgo: 25,
      });
      // Consumables are used up where they go: the third floor's printer
      // and desks.
      await stock.issue(
        String(toner.id),
        { holderType: 'location', holderId: String(floor3.id), quantity: 2 },
        context,
        all('stockItems', 'issue'),
      );
      const cables = await stockItem({
        kind: 'consumable',
        name: 'USB-C cable 1 m',
        categoryId: cableCat.id,
        modelId: usbCable.id,
        totalQuantity: 40,
        minimumQuantity: 10,
      });
      await stock.issue(
        String(cables.id),
        { holderType: 'location', holderId: String(floor3.id), quantity: 6 },
        context,
        all('stockItems', 'issue'),
      );
      await stockItem({
        kind: 'consumable',
        name: 'Latitude 5440 battery',
        categoryId: batteryCat.id,
        modelId: laptopBattery.id,
        manufacturerId: latitude.manufacturer.id,
        totalQuantity: 2,
        minimumQuantity: 2,
      });
      const ssd = await stockItem({
        kind: 'component',
        name: '1 TB NVMe SSD',
        categoryId: diskCat.id,
        modelId: ssdModel.id,
        manufacturerId: ssdModel.manufacturer.id,
        totalQuantity: 5,
        minimumQuantity: 2,
      });
      // A component sits on the leaver's laptop. It is not theirs to give
      // back — a component belongs to the device it is installed on, and
      // goes wherever that goes — so the recovery lists the laptop and not
      // this; what it shows is that recovering a device recovers what is in
      // it.
      await stock.issue(
        String(ssd.id),
        { holderType: 'device', holderId: String(airs[1].id), quantity: 1 },
        context,
        all('stockItems', 'issue'),
      );
      // A drive went into a laptop and came out again, so the component's
      // log shows an install and an uninstall.
      for (const holder of [laptops[1], laptops[2]])
        await stock.issue(
          String(ssd.id),
          { holderType: 'device', holderId: String(holder.id), quantity: 1 },
          context,
          all('stockItems', 'issue'),
        );
      await stock.takeBack(
        String(ssd.id),
        { holderType: 'device', holderId: String(laptops[2].id), quantity: 1 },
        context,
        all('stockItems', 'return'),
      );
      const ram = await stockItem({
        kind: 'component',
        name: '32 GB DDR5 SO-DIMM',
        categoryId: ramCat.id,
        modelId: ramModel.id,
        manufacturerId: ramModel.manufacturer.id,
        totalQuantity: 6,
        minimumQuantity: 2,
      });
      await stock.issue(
        String(ram.id),
        {
          holderType: 'device',
          holderId: String(expiredLaptop.id),
          quantity: 1,
        },
        context,
        all('stockItems', 'issue'),
      );

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
      await entitlements.assignSeats(
        String(officeLicense.id),
        [laptops[0], laptops[1], laptops[2], laptops[3]].map((laptop) => ({
          holderType: 'device',
          holderId: String(laptop.id),
        })),
        context,
        all('entitlements', 'assignSeat'),
      );
      // Over-allocated: the seat count is reduced below what is assigned.
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
      await entitlements.assignSeats(
        String(ideLicense.id),
        [liNa, zhangWei, liuYang].map((person) => ({
          holderType: 'person',
          holderId: String(person.id),
        })),
        context,
        all('entitlements', 'assignSeat'),
      );
      // Two subscriptions whose dates fall inside the week: one that will
      // charge (yearly auto-renew) and one that will stop (nothing renews
      // it). They are opposite acts, and the workbench lists them apart.
      await track(
        'entitlements',
        await entitlements.create(
          {
            kind: 'subscription',
            name: 'Zoom Workplace Pro（年付）',
            softwareProductId: zoom.id,
            billingModel: 'perSeat',
            seatCount: 2,
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            expiryDate: daysFromNow(5),
            autoRenew: true,
            ownerId: actorId,
          },
          context,
          all('entitlements', 'create'),
        ),
      );
      await track(
        'entitlements',
        await entitlements.create(
          {
            kind: 'subscription',
            name: 'Figma Professional（试用）',
            softwareProductId: figma.id,
            billingModel: 'flat',
            billingCycle: 'year',
            unitPrice: 900,
            currency: 'USD',
            expiryDate: daysFromNow(6),
            autoRenew: false,
            ownerId: actorId,
          },
          context,
          all('entitlements', 'create'),
        ),
      );
      const figmaSub = await track(
        'entitlements',
        await entitlements.create(
          {
            kind: 'subscription',
            name: 'Figma Organization',
            softwareProductId: figma.id,
            billingModel: 'perSeat',
            seatCount: 6,
            billingCycle: 'month',
            unitPrice: 45,
            currency: 'USD',
            expiryDate: daysFromNow(25),
            autoRenew: true,
            ownerId: actorId,
          },
          context,
          all('entitlements', 'create'),
        ),
      );
      await entitlements.assignSeats(
        String(figmaSub.id),
        [
          { holderId: String(liNa.id), account: 'li.na@northbridge.example' },
          {
            holderId: String(zhangWei.id),
            account: 'zhang.wei@northbridge.example',
          },
          {
            holderId: String(wangFang.id),
            account: 'wang.fang@northbridge.example',
          },
          {
            holderId: String(chenJie.id),
            account: 'chen.jie@northbridge.example',
          },
        ],
        context,
        all('entitlements', 'assignSeat'),
      );

      // A subscription the team stopped: not renewing, past its date, and
      // one seat never taken back — the "ended" reminder.
      const zoomSub = await track(
        'entitlements',
        await entitlements.create(
          {
            kind: 'subscription',
            name: 'Zoom Workplace Pro',
            softwareProductId: zoom.id,
            billingModel: 'perSeat',
            seatCount: 3,
            billingCycle: 'year',
            unitPrice: 150,
            currency: 'USD',
            expiryDate: daysFromNow(-10),
            autoRenew: false,
            ownerId: actorId,
          },
          context,
          all('entitlements', 'create'),
        ),
      );
      await entitlements.assignSeats(
        String(zoomSub.id),
        [
          {
            holderId: String(zhangWei.id),
            account: 'zhang.wei@northbridge.example',
          },
        ],
        context,
        all('entitlements', 'assignSeat'),
      );

      // A purchase order that went through the chain and was received.
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
      await procurement.markOrdered(
        String(order.id),
        { orderedAt: daysFromNow(-20), expectedAt: daysFromNow(-5) },
        context,
        all('purchaseOrders', 'order'),
      );
      const lines = await procurement.lines(String(order.id));
      // Each device is its own record, so each is received on its own — the
      // receiving dialog takes one serial, name and keeper at a time.
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
              ownerId: actorId,
            },
          },
          context,
          all('purchaseOrders', 'receive'),
        );
      const generated = await procurement.generated(String(order.id));
      for (const entry of generated)
        if (entry.type === 'device') await track('devices', { id: entry.id });

      // A repair in progress on the expired laptop, this one IT support's:
      // a repair belongs to its 负责人, so the 进行中的维修 card has
      // something to show when you sign in as `zhouyu`, and the other one
      // below stays with the account that generated the demo — each role
      // sees its own work rather than one of them seeing an empty card.
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
      for (const entry of finishedRepairs) {
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
            },
            context,
            all('repairs', 'create'),
          ),
        );
        await repairs.complete(
          String(repair.id),
          {
            result: 'repaired',
            disposition: 'return',
            actualReturnAt: daysFromNow(entry.returnDays),
            cost: entry.cost,
            notes: entry.notes ?? null,
          },
          context,
          all('repairs', 'complete'),
        );
      }
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

      // More purchase orders, one per stage: a draft, one waiting for
      // approval, and one ordered whose delivery is overdue.
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
      await procurement.markOrdered(
        String(dockOrder.id),
        { orderedAt: daysFromNow(-12), expectedAt: daysFromNow(-2) },
        context,
        all('purchaseOrders', 'order'),
      );

      // Approved and waiting to be placed with the vendor.
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
      await procurement.markOrdered(
        String(headsetOrder.id),
        { orderedAt: daysFromNow(-8), expectedAt: daysFromNow(6) },
        context,
        all('purchaseOrders', 'order'),
      );
      const headsetLines = await procurement.lines(String(headsetOrder.id));
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
      await procurement.cancel(
        String(extraDocks.id),
        texts.extraDockCancel,
        context,
        all('purchaseOrders', 'cancel'),
      );

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
      }): Promise<void> => {
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
        if (
          (await procurement.get(id, all('purchaseOrders', 'read')))?.status ===
          'pendingApproval'
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
      });
      await queuedOrder({
        description: texts.salesPhoneOrder,
        reason: 'newHire',
        departmentId: sales.id,
        neededInDays: 20,
        lines: [line('device', iphone, 3, 5999)],
        stage: 'draft',
      });
      await queuedOrder({
        description: texts.airOrder,
        reason: 'newHire',
        departmentId: rnd.id,
        neededInDays: 14,
        lines: [line('device', air, 4, 8999)],
        stage: 'pendingApproval',
      });
      await queuedOrder({
        description: texts.switchOrder,
        reason: 'project',
        departmentId: itDept.id,
        neededInDays: 30,
        lines: [line('device', catalyst, 1, 23000)],
        stage: 'pendingApproval',
      });
      await queuedOrder({
        description: texts.printerReplaceOrder,
        reason: 'faultReplacement',
        departmentId: itDept.id,
        neededInDays: 7,
        lines: [line('device', laserjet, 1, 2899)],
        stage: 'approved',
      });
      await queuedOrder({
        description: texts.mouseOrder,
        reason: 'stockReplenishment',
        departmentId: rnd.id,
        neededInDays: 10,
        lines: [line('accessory', mxMaster, 20, 599)],
        stage: 'approved',
      });
      await queuedOrder({
        description: texts.ssdOrder,
        reason: 'stockReplenishment',
        departmentId: itDept.id,
        neededInDays: 5,
        lines: [line('component', ssdModel, 10, 899)],
        stage: 'ordered',
      });
      await queuedOrder({
        description: texts.desktopOrder,
        reason: 'batchReplacement',
        departmentId: sales.id,
        neededInDays: 12,
        lines: [line('device', optiplex, 5, 5299)],
        stage: 'ordered',
      });
      await queuedOrder({
        description: texts.serverOrder,
        reason: 'project',
        departmentId: itDept.id,
        neededInDays: 60,
        lines: [line('device', poweredge, 2, 68000)],
        stage: 'rejected',
        why: texts.serverRejection,
      });
      await queuedOrder({
        description: texts.headsetRestockOrder,
        reason: 'stockReplenishment',
        departmentId: sales.id,
        neededInDays: 15,
        lines: [line('accessory', zoneVibe, 15, 399)],
        stage: 'cancelled',
        why: texts.headsetCancel,
      });

      // An audit in progress over the third floor.
      const audit = await track(
        'auditTasks',
        await audits.create(
          {
            name: texts.auditName,
            scope: { locationIds: [String(floor3.id)] },
            plannedStart: daysFromNow(-3),
            plannedEnd: daysFromNow(10),
            executorIds: [actorId],
            notes: texts.auditNotes,
          },
          context,
          all('auditTasks', 'create'),
        ),
      );
      await audits.start(String(audit.id), context, all('auditTasks', 'start'));
      const items = await audits.items(String(audit.id));
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
      const leaverAudit = await track(
        'auditTasks',
        await audits.create(
          {
            name: texts.leaverAuditName,
            scope: { locationIds: [String(warehouse.id)] },
            plannedStart: daysFromNow(-2),
            plannedEnd: daysFromNow(12),
            executorIds: [leaverUserId],
            notes: texts.leaverAuditNotes,
          },
          context,
          all('auditTasks', 'create'),
        ),
      );
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
      }): Promise<string> =>
        String(
          (
            await track(
              'auditTasks',
              await audits.create(
                {
                  name: task.name,
                  scope: task.scope,
                  plannedStart: daysFromNow(task.startIn),
                  plannedEnd: daysFromNow(task.endIn),
                  executorIds: [actorId],
                  notes: task.notes ?? null,
                },
                context,
                all('auditTasks', 'create'),
              ),
            )
          ).id,
        );
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
      });
      await auditTask({
        name: texts.japanAuditName,
        notes: texts.japanAuditNotes,
        scope: { locationIds: [String(japan.id)] },
        startIn: 40,
        endIn: 55,
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
      });
      await audits.start(diffAudit, context, all('auditTasks', 'start'));
      await countIn(diffAudit, [
        { itemId: await itemOf(diffAudit, deskPc.id), result: 'matched' },
        {
          itemId: await itemOf(diffAudit, mobile.id),
          result: 'mismatch',
          actualLocationId: String(serverRoom.id),
        },
      ]);
      await audits.finish(diffAudit, context, all('auditTasks', 'finish'));
      // Two completed last quarter: one all matched, one whose difference
      // was looked at and left as it was.
      const roomAudit = await auditTask({
        name: texts.serverRoomAuditName,
        scope: { locationIds: [String(serverRoom.id)] },
        startIn: -100,
        endIn: -90,
      });
      await audits.start(roomAudit, context, all('auditTasks', 'start'));
      await countIn(
        roomAudit,
        (await audits.items(roomAudit)).map((item) => ({
          itemId: String(item.id),
          result: 'matched',
        })),
      );
      await audits.finish(roomAudit, context, all('auditTasks', 'finish'));
      const monitorAudit = await auditTask({
        name: texts.monitorAuditName,
        scope: { deviceIds: monitors.map((row) => String(row.id)) },
        startIn: -95,
        endIn: -88,
      });
      await audits.start(monitorAudit, context, all('auditTasks', 'start'));
      const monitorItems = await audits.items(monitorAudit);
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
      await audits.finish(monitorAudit, context, all('auditTasks', 'finish'));
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
      });
      await audits.start(spotAudit, context, all('auditTasks', 'start'));
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
      await track(
        'disposals',
        await disposals.create(
          {
            method: 'scrap',
            reason: 'damaged',
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

      // A disposal draft for the last monitor.
      await track(
        'disposals',
        await disposals.create(
          {
            method: 'scrap',
            reason: 'damaged',
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
      const printerDisposal = await track(
        'disposals',
        await disposals.create(
          {
            method: 'scrap',
            reason: 'endOfLife',
            description: texts.disposalPrinter,
            deviceIds: [String(officePrinter.id)],
            recipientVendorId: String(recycler.id),
            dataWipe: 'notRequired',
          },
          context,
          all('disposals', 'create'),
        ),
      );
      await disposals.submit(
        String(printerDisposal.id),
        approverId,
        context,
        all('disposals', 'submit'),
      );

      // Approved and waiting to be carried out, which is the state the
      // 待执行的报废 card reads. Without one the card is always empty and
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
      const monitorDisposal = await track(
        'disposals',
        await disposals.create(
          {
            method: 'scrap',
            reason: 'damaged',
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
      const RECENT_ARRIVALS = [
        { expectedDaysAgo: 19 },
        { expectedDaysAgo: 26 },
        { expectedDaysAgo: 34 },
      ] as const;
      const newestFirst = [...receivedOrders].sort((a: Row, b: Row) =>
        (asText(b.expectedAt) ?? '').localeCompare(asText(a.expectedAt) ?? ''),
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
      }

      await dependencies.refreshReminders();
      return this.status();
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
      });
      // The sign-ins go last, once the people that referenced them are gone,
      // and through the users plugin rather than the table: removing an
      // account also ends its sessions and permission-set assignments.
      for (const userId of byCollection.get('accounts') ?? [])
        await dependencies.accounts?.remove(userId, actorId);
      await dependencies.refreshReminders();
      return { generated: false, counts: {} };
    },
  };
}
