import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

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

/**
 * The assistant's business notes (系统设置 → AI 助手 → 业务说明): the rules
 * Ava reads through `itam_business_context` before planning — onboarding
 * kits, replace-or-repair, purchasing, offboarding and naming. Written in
 * the deployment's language like the other seeded data, and naming the
 * seeded departments, models and software products, so the demo's
 * onboarding and repair questions have something to go by. The
 * administrator rewrites them for the company.
 */
const BUSINESS_NOTES: Readonly<Record<string, string>> = {
  'zh-CN': `## 入职标准配置（按部门；先用库存，库存没有再提采购）
- 研发、质量：MacBook Pro 14 M3、U2723QE 显示器、WD22TB4 扩展坞、MX Keys 键盘、MX Master 3S 鼠标；软件：IntelliJ IDEA Ultimate、Microsoft 365、Zoom Workplace
- IT 运维：ThinkPad T14 Gen 5、U2723QE 显示器、WD22TB4 扩展坞；软件：Microsoft 365、Zoom Workplace
- 产品部：MacBook Pro 14 M3、U2723QE 显示器、MX Master 3S 鼠标；软件：Figma、Microsoft 365、Zoom Workplace
- 市场部：MacBook Air 13 M3、MX Master 3S 鼠标；软件：Adobe Creative Cloud、Figma、Microsoft 365
- 销售部、客户成功部：MacBook Air 13 M3、Zone Vibe 100 耳机、iPhone 15；软件：Microsoft 365、Zoom Workplace
- 人力资源部、财务部、行政部：ThinkPad T14 Gen 5 或 Latitude 5440、MX Keys 键盘、MX Master 3S 鼠标；软件：Microsoft 365

## 更换还是维修
- 保修期内一律走厂商保修，不自费维修。
- 笔记本、台式机使用满 4 年，或过保后 12 个月内已维修 2 次以上，优先更换。
- 过保设备单次维修报价超过当前账面价值的 50%，建议报废并更换。
- 手机使用满 3 年更换；显示器用到坏为止。

## 采购与审批
- 采购单、报废单都要审批，提交时由申请人指定审批人，一般是 IT 资产经理。
- 软件先回收闲置和离职人员的席位，再考虑加购；订阅加购前先看续订日期，能在续订时一起调整就不单独加。
- 单价 1 万元以上的设备、年费 5 万元以上的订阅，采购单说明里写清理由和替代方案。

## 离职
- 最后工作日收回全部设备、配件和软件席位。
- 订阅账号要在对应软件的管理后台停用，系统只回收席位。
- 收回的设备先清除数据，再重新分配或报废。

## 命名习惯
- 设备名称用「地点代码-类型-序号」：新加坡总部为 SG，日本分公司为 JP；笔记本 LT、台式机 DT、显示器 MN、手机 PH，例如 SG-LT-001。`,
  'en-US': `## Onboarding kits (by department; use stock first, raise a purchase only for what is missing)
- R&D, QA: MacBook Pro 14 M3, U2723QE monitor, WD22TB4 dock, MX Keys keyboard, MX Master 3S mouse; software: IntelliJ IDEA Ultimate, Microsoft 365, Zoom Workplace
- IT Operations: ThinkPad T14 Gen 5, U2723QE monitor, WD22TB4 dock; software: Microsoft 365, Zoom Workplace
- Product: MacBook Pro 14 M3, U2723QE monitor, MX Master 3S mouse; software: Figma, Microsoft 365, Zoom Workplace
- Marketing: MacBook Air 13 M3, MX Master 3S mouse; software: Adobe Creative Cloud, Figma, Microsoft 365
- Sales, Customer Success: MacBook Air 13 M3, Zone Vibe 100 headset, iPhone 15; software: Microsoft 365, Zoom Workplace
- HR, Finance, Administration: ThinkPad T14 Gen 5 or Latitude 5440, MX Keys keyboard, MX Master 3S mouse; software: Microsoft 365

## Replace or repair
- Under warranty, always use the vendor's warranty; never pay for the repair.
- Replace laptops and desktops after 4 years in use, or when out of warranty with 2 or more repairs in the last 12 months.
- Out of warranty, a single repair quote above 50% of the current book value means dispose and replace.
- Replace phones after 3 years; monitors are used until they fail.

## Purchasing and approval
- Purchase orders and disposals both need approval; the requester names the approver on submission, usually the IT Asset Manager.
- For software, reclaim idle seats and leavers' seats before buying more; before adding seats to a subscription, check its renewal date and adjust at renewal where possible.
- For a device over 10,000 or a subscription over 50,000 a year, the purchase order's description states the reason and the alternatives.

## Offboarding
- Take back every device, accessory and software seat on the last working day.
- Deactivate subscription accounts in each product's admin console; the register only reclaims the seat.
- Wipe returned devices before reassigning or disposing of them.

## Naming
- Device names are "site-type-number": SG for the Singapore HQ, JP for the Japan office; LT laptop, DT desktop, MN monitor, PH phone, e.g. SG-LT-001.`,
};


// Default ITAM configuration. The settings service merges defaults over
// whatever is stored, so this seed exists to make the defaults visible and
// editable; it never overwrites a key an administrator has already saved.
const defaults = (locale: string): Readonly<Record<string, unknown>> => ({
  general: {
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
    dateFormat: 'YYYY-MM-DD',
  },
  thresholds: {
    warrantyDays: 30,
    maintenanceExpiryDays: 30,
    subscriptionExpiryDays: 7,
    idleDays: 90,
    auditDays: 365,
    idleSeatRatio: 0.3,
    defaultStockMinimum: 5,
  },
  numbering: {
    device: { prefix: 'DE-', width: 6, start: 1 },
    purchaseOrder: { prefix: 'PO-', width: 6, start: 1 },
    disposal: { prefix: 'DP-', width: 6, start: 1 },
    repair: { prefix: 'RP-', width: 6, start: 1 },
  },
  ai: { businessNotes: BUSINESS_NOTES[locale] ?? BUSINESS_NOTES['en-US'] },
});

type SeedQuery = Parameters<SeedDefinition['run']>[0]['query'];

async function addBusinessNotes(
  query: SeedQuery,
  value: unknown,
): Promise<void> {
  const row = await query
    .selectFrom('itamSettings')
    .select('value')
    .where('key', '=', 'ai')
    .executeTakeFirst<{ value: unknown }>();
  let stored = row?.value;
  while (typeof stored === 'string') stored = JSON.parse(stored);
  const current =
    stored && typeof stored === 'object'
      ? (stored as Record<string, unknown>)
      : {};
  if ('businessNotes' in current) return;
  await query
    .updateTable('itamSettings')
    .set({ value: { ...current, ...(value as Record<string, unknown>) } })
    .where('key', '=', 'ai')
    .execute();
}

const seed: SeedDefinition = defineSeed({
  name: '202609120001_seed_itam_settings',

  async run(context) {
    const { query } = context;
    const locale = resolveLocale(context);
    const existing = await query
      .selectFrom('itamSettings')
      .select('key')
      .execute();
    const present = new Set(existing.map((row) => row.key));
    const now = new Date();
    for (const [key, value] of Object.entries(defaults(locale))) {
      if (present.has(key)) {
        // The AI row may already exist before this runs — the registrar
        // records its own flag there at start-up — so the notes are added
        // to it when it has none, and left alone when it has any.
        if (key === 'ai') await addBusinessNotes(query, value);
        continue;
      }
      await query
        .insertInto('itamSettings')
        .values({
          key,
          value,
          updatedById: null,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
