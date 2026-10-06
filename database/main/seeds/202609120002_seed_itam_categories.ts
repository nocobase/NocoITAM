import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

// A starter category tree so the application is usable on first start. Only
// written when no category exists; fixed ids keep repeat runs reproducible.
// Names and field labels are data, not UI text, so they are written once in
// the deployment's default language (`i18n.defaultLocale`) and maintained by
// the administrator afterwards.

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


/** Category names by id for locales other than English. */
const NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'cat-endpoint': '终端设备',
    'cat-peripheral': '外设',
    'cat-infrastructure': '基础设施',
    'cat-print-supplies': '打印耗材',
    'cat-system-software': '系统软件',
    'cat-laptop': '笔记本电脑',
    'cat-desktop': '台式机',
    'cat-monitor': '显示器',
    'cat-server': '服务器',
    'cat-network': '网络设备',
    'cat-phone': '手机',
    'cat-printer': '打印机',
    'cat-virtual': '虚拟机',
    'cat-mouse': '鼠标',
    'cat-keyboard': '键盘',
    'cat-dock': '扩展坞',
    'cat-headset': '耳机',
    'cat-consumable': '通用耗材',
    'cat-toner': '硒鼓',
    'cat-cable': '线缆',
    'cat-battery': '电池',
    'cat-component': '计算机组件',
    'cat-memory': '内存',
    'cat-disk': '硬盘',
    'cat-software': '应用软件',
    'cat-sw-productivity': '办公',
    'cat-sw-design': '设计',
    'cat-sw-development': '开发',
    'cat-sw-os': '操作系统',
    'cat-sw-collaboration': '协作',
  },
};

/** Field template labels by English label for locales other than English. */
const LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'zh-CN': {
    'Operating system': '操作系统',
    'Screen size': '屏幕尺寸',
    Resolution: '分辨率',
    Inputs: '接口',
    Color: '彩色',
    Duplex: '双面打印',
    'Toner / ink': '耗材型号',
    CPU: 'CPU',
    Memory: '内存',
    Storage: '存储',
    'MAC address': 'MAC 地址',
    Hostname: '主机名',
    'Management IP': '管理 IP',
    'Rack position': '机架位置',
    U: 'U 数',
    Purpose: '用途',
    'Firmware version': '固件版本',
    Ports: '端口数',
    IMEI: 'IMEI',
    Number: '号码',
    Carrier: '运营商',
    'IP address': 'IP 地址',
  },
};

const localizedName = (category: CategorySeed, locale: string): string =>
  NAMES[locale]?.[category.id] ?? category.name;
const localizedTemplate = (
  template: readonly unknown[] | undefined,
  locale: string,
): readonly unknown[] | undefined =>
  template?.map((field) => {
    if (!field || typeof field !== 'object' || !('label' in field))
      return field;
    const label = String(field.label);
    return { ...field, label: LABELS[locale]?.[label] ?? label };
  });
interface CategorySeed {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
  readonly appliesTo:
    'device' | 'accessory' | 'consumable' | 'component' | 'entitlement';
  readonly requiresSerial?: boolean;
  readonly assignableToPerson?: boolean;
  readonly depreciationMethod?: 'none' | 'straightLine';
  readonly usefulLifeMonths?: number;
  readonly residualRate?: number;
  readonly warrantyMonths?: number;
  readonly replacementMonths?: number;
  readonly auditCycleDays?: number;
  readonly fieldTemplate?: readonly unknown[];
  readonly sort: number;
}

const computerFields = [
  { key: 'os', label: 'Operating system', type: 'text' },
  { key: 'cpu', label: 'CPU', type: 'text' },
  { key: 'memory', label: 'Memory', type: 'text' },
  { key: 'storage', label: 'Storage', type: 'text' },
  { key: 'macAddress', label: 'MAC address', type: 'text' },
  { key: 'hostname', label: 'Hostname', type: 'text' },
];

const hardware = {
  appliesTo: 'device',
  requiresSerial: true,
  assignableToPerson: true,
  depreciationMethod: 'straightLine',
  usefulLifeMonths: 36,
  residualRate: 0.05,
  warrantyMonths: 36,
  replacementMonths: 48,
  auditCycleDays: 365,
} as const;

const CATEGORIES: readonly CategorySeed[] = [
  // Top-level groups are organisational and deliberately not named after
  // the device types; the type is a rule each root sets once and its subtree
  // inherits.
  {
    id: 'cat-endpoint',
    name: 'End-user devices',
    appliesTo: 'device',
    sort: 10,
  },
  { id: 'cat-peripheral', name: 'Peripherals', appliesTo: 'device', sort: 20 },
  {
    id: 'cat-infrastructure',
    name: 'Infrastructure',
    appliesTo: 'device',
    sort: 30,
  },
  {
    id: 'cat-laptop',
    name: 'Laptop',
    parentId: 'cat-endpoint',
    ...hardware,
    fieldTemplate: [
      ...computerFields,
      {
        key: 'screenSize',
        label: 'Screen size',
        type: 'select',
        options: ['13', '14', '15', '16'],
      },
    ],
    sort: 11,
  },
  {
    id: 'cat-desktop',
    name: 'Desktop',
    parentId: 'cat-endpoint',
    ...hardware,
    usefulLifeMonths: 48,
    replacementMonths: 60,
    fieldTemplate: computerFields,
    sort: 12,
  },
  {
    id: 'cat-monitor',
    name: 'Monitor',
    parentId: 'cat-peripheral',
    ...hardware,
    fieldTemplate: [
      {
        key: 'screenSize',
        label: 'Screen size',
        type: 'select',
        options: ['24', '27', '32', '34'],
      },
      {
        key: 'resolution',
        label: 'Resolution',
        type: 'select',
        options: ['1920×1080', '2560×1440', '3840×2160'],
      },
      { key: 'inputs', label: 'Inputs', type: 'text' },
    ],
    usefulLifeMonths: 60,
    replacementMonths: 72,
    sort: 13,
  },
  {
    id: 'cat-server',
    name: 'Server',
    parentId: 'cat-infrastructure',
    ...hardware,
    assignableToPerson: false,
    usefulLifeMonths: 60,
    replacementMonths: 72,
    fieldTemplate: [
      { key: 'managementIp', label: 'Management IP', type: 'text' },
      { key: 'rackPosition', label: 'Rack position', type: 'text' },
      { key: 'rackUnits', label: 'U', type: 'number' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
    ],
    sort: 14,
  },
  {
    id: 'cat-network',
    name: 'Network device',
    parentId: 'cat-infrastructure',
    ...hardware,
    assignableToPerson: false,
    usefulLifeMonths: 60,
    replacementMonths: 72,
    fieldTemplate: [
      { key: 'managementIp', label: 'Management IP', type: 'text' },
      { key: 'firmware', label: 'Firmware version', type: 'text' },
      { key: 'ports', label: 'Ports', type: 'number' },
    ],
    sort: 15,
  },
  {
    id: 'cat-phone',
    name: 'Mobile phone',
    parentId: 'cat-endpoint',
    ...hardware,
    usefulLifeMonths: 24,
    warrantyMonths: 12,
    replacementMonths: 36,
    fieldTemplate: [
      { key: 'imei', label: 'IMEI', type: 'text' },
      { key: 'phoneNumber', label: 'Number', type: 'text' },
      { key: 'carrier', label: 'Carrier', type: 'text' },
    ],
    sort: 16,
  },
  {
    id: 'cat-printer',
    name: 'Printer',
    parentId: 'cat-peripheral',
    ...hardware,
    fieldTemplate: [
      { key: 'ipAddress', label: 'IP address', type: 'text' },
      { key: 'color', label: 'Color', type: 'boolean' },
      { key: 'duplex', label: 'Duplex', type: 'boolean' },
      { key: 'consumable', label: 'Toner / ink', type: 'text' },
    ],
    assignableToPerson: false,
    usefulLifeMonths: 60,
    replacementMonths: 72,
    sort: 17,
  },
  {
    id: 'cat-virtual',
    name: 'Virtual machine',
    parentId: 'cat-infrastructure',
    appliesTo: 'device',
    requiresSerial: false,
    assignableToPerson: false,
    depreciationMethod: 'none',
    auditCycleDays: 365,
    fieldTemplate: [
      { key: 'hostname', label: 'Hostname', type: 'text' },
      { key: 'ipAddress', label: 'IP address', type: 'text' },
    ],
    sort: 18,
  },

  {
    id: 'cat-mouse',
    name: 'Mouse',
    appliesTo: 'accessory',
    sort: 21,
  },
  {
    id: 'cat-keyboard',
    name: 'Keyboard',
    appliesTo: 'accessory',
    sort: 22,
  },
  {
    id: 'cat-dock',
    name: 'Docking station',
    appliesTo: 'accessory',
    sort: 23,
  },
  {
    id: 'cat-headset',
    name: 'Headset',
    appliesTo: 'accessory',
    sort: 24,
  },

  {
    id: 'cat-print-supplies',
    name: 'Printing supplies',
    appliesTo: 'consumable',
    sort: 50,
  },
  {
    id: 'cat-consumable',
    name: 'General consumables',
    appliesTo: 'consumable',
    sort: 60,
  },
  {
    id: 'cat-toner',
    name: 'Toner',
    parentId: 'cat-print-supplies',
    appliesTo: 'consumable',
    sort: 31,
  },
  {
    id: 'cat-cable',
    name: 'Cable',
    parentId: 'cat-consumable',
    appliesTo: 'consumable',
    sort: 32,
  },
  {
    id: 'cat-battery',
    name: 'Battery',
    parentId: 'cat-consumable',
    appliesTo: 'consumable',
    sort: 33,
  },

  {
    id: 'cat-component',
    name: 'Computer parts',
    appliesTo: 'component',
    sort: 70,
  },
  {
    id: 'cat-memory',
    name: 'Memory',
    parentId: 'cat-component',
    appliesTo: 'component',
    sort: 41,
  },
  {
    id: 'cat-disk',
    name: 'Disk',
    parentId: 'cat-component',
    appliesTo: 'component',
    sort: 42,
  },

  {
    id: 'cat-software',
    name: 'Applications',
    appliesTo: 'entitlement',
    sort: 80,
  },
  {
    id: 'cat-system-software',
    name: 'System software',
    appliesTo: 'entitlement',
    sort: 90,
  },
  {
    id: 'cat-sw-productivity',
    name: 'Productivity',
    parentId: 'cat-software',
    appliesTo: 'entitlement',
    sort: 51,
  },
  {
    id: 'cat-sw-design',
    name: 'Design',
    parentId: 'cat-software',
    appliesTo: 'entitlement',
    sort: 52,
  },
  {
    id: 'cat-sw-development',
    name: 'Development',
    parentId: 'cat-software',
    appliesTo: 'entitlement',
    sort: 53,
  },
  {
    id: 'cat-sw-os',
    name: 'Operating system',
    parentId: 'cat-system-software',
    appliesTo: 'entitlement',
    sort: 54,
  },
  {
    id: 'cat-sw-collaboration',
    name: 'Collaboration',
    parentId: 'cat-software',
    appliesTo: 'entitlement',
    sort: 55,
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609120002_seed_itam_categories',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
    const any = await query
      .selectFrom('categories')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (any) return;
    const now = new Date();
    for (const category of CATEGORIES) {
      await query
        .insertInto('categories')
        .values({
          id: category.id,
          name: localizedName(category, locale),
          parentId: category.parentId ?? null,
          appliesTo: category.appliesTo,
          requiresSerial: category.requiresSerial ?? false,
          assignableToPerson: category.assignableToPerson ?? true,
          depreciationMethod: category.depreciationMethod ?? null,
          usefulLifeMonths: category.usefulLifeMonths ?? null,
          residualRate: category.residualRate ?? null,
          warrantyMonths: category.warrantyMonths ?? null,
          replacementMonths: category.replacementMonths ?? null,
          auditCycleDays: category.auditCycleDays ?? null,
          fieldTemplate: category.fieldTemplate
            ? localizedTemplate(category.fieldTemplate, locale)
            : null,
          sort: category.sort,
          createdById: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
