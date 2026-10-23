import type { DatabaseManager } from '@nocobase/db';

import type { AgentRunService } from './agent-runs.js';
import type { ApprovalReview } from './approval-review.js';
import { asText, type Row } from './collection-query.js';
import { today } from './dates.js';
import type {
  DeviceSyncFollowUp,
  FollowUpAnswerer,
  FollowUpDecision,
} from './device-sync-followup.js';
import type {
  AdviceAnswer,
  AgentRunner,
  OnboardingAdvisor,
} from './onboarding-advisor.js';

/**
 * The work agents' suggestions the demo comes with (2026-10-16), written
 * here rather than asked of a model: importing the demo used to set the
 * approval assistant reviewing every request it filed — a hundred model
 * runs, most of them superseded a moment later by the demo's own decisions
 * — and the MDM follow-up working out its pulls. The demo's requests and
 * pulls now start nothing (`sourceType` / `trigger` 'demo'), and this
 * writes what an agent would have left, from the records as they stand:
 * a review for each request still waiting, the MDM follow-up on every item
 * MDM 核对 lists (through the follow-up's own plans, the answers given
 * here), and Asset Steward's picks for the joiners (through the advisor,
 * with a runner that answers here). Every number and asset tag is read from
 * the data, so the text matches whatever the import made.
 */

export interface DemoAgents {
  readonly runs: AgentRunService;
  readonly followUp: DeviceSyncFollowUp;
  readonly advisor: OnboardingAdvisor;
}

export interface DemoRequests {
  readonly monitorOrder: string;
  readonly airOrder: string;
  readonly switchOrder: string;
  /** Rejected for the quarter's budget: the precedent the reviews cite. */
  readonly internOrder: string;
  readonly printerDisposal: string;
}

/** How long the demo's plans wait: as long as anybody looks at the demo. */
const PLAN_DAYS = 30;
const DAY = 86_400_000;

type Lang = 'zh' | 'en';

const money = (lang: Lang, value: number) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${lang === 'zh' ? ' 元' : ''}`;
const day = (lang: Lang, value: unknown) => {
  const text = asText(value) ?? '';
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return text;
  return lang === 'zh'
    ? `${String(date.getUTCMonth() + 1)}月${String(date.getUTCDate())}日`
    : date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
};
const daysSince = (value: unknown) =>
  Math.max(
    0,
    Math.round(
      (Date.now() - new Date(String(asText(value) ?? '')).getTime()) / DAY,
    ),
  );
const list = (lang: Lang, items: readonly string[]) =>
  items.join(lang === 'zh' ? '、' : ', ');

export async function writeDemoSuggestions(input: {
  readonly database: DatabaseManager;
  readonly agents: DemoAgents;
  readonly locale: string;
  readonly actorId: string;
  readonly track: (collection: string, row: Row) => Promise<Row>;
  readonly requests: DemoRequests;
  readonly joiners: readonly string[];
}): Promise<void> {
  const { database, agents, track } = input;
  const lang: Lang = input.locale.startsWith('zh') ? 'zh' : 'en';
  const q = () => database.query();

  // --- Facts, read from the records ---------------------------------------

  const orderOf = async (id: string) => {
    const order = await q()
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    const lines = await q()
      .selectFrom('purchaseOrderLines')
      .leftJoin('models', 'models.id', 'purchaseOrderLines.modelId')
      .select([
        'purchaseOrderLines.modelId as modelId',
        'purchaseOrderLines.quantity as quantity',
        'purchaseOrderLines.unitPrice as unitPrice',
        'models.name as modelName',
      ])
      .where('purchaseOrderLines.purchaseOrderId', '=', id)
      .execute<Row>();
    const line = lines[0] ?? {};
    const quantity = Number(line.quantity ?? 0);
    const price = Number(line.unitPrice ?? 0);
    return {
      no: asText(order?.orderNo) ?? '',
      description: asText(order?.description) ?? '',
      modelId: asText(line.modelId) ?? '',
      model: asText(line.modelName) ?? '',
      quantity,
      price,
      total: quantity * price,
    };
  };
  const inStock = async (modelId: string) =>
    q()
      .selectFrom('devices')
      .select(['name', 'notes'])
      .where('modelId', '=', modelId)
      .where('status', '=', 'inStock')
      .orderBy('name')
      .execute<{ name: unknown; notes: unknown }>();
  /** The last price paid for the model on an order that went through. */
  const lastPrice = async (modelId: string, besides: string) =>
    q()
      .selectFrom('purchaseOrderLines')
      .innerJoin(
        'purchaseOrders',
        'purchaseOrders.id',
        'purchaseOrderLines.purchaseOrderId',
      )
      .select([
        'purchaseOrders.orderNo as orderNo',
        'purchaseOrderLines.unitPrice as unitPrice',
      ])
      .where('purchaseOrderLines.modelId', '=', modelId)
      .where('purchaseOrders.id', '!=', besides)
      .where('purchaseOrders.status', 'in', [
        'approved',
        'ordered',
        'partiallyReceived',
        'completed',
      ])
      .orderBy('purchaseOrders.createdAt', 'desc')
      .executeTakeFirst<{ orderNo: unknown; unitPrice: unknown }>();
  const intern = await orderOf(input.requests.internOrder);

  // --- The approval assistant: a review for each request still waiting ---

  const monitorReview = async (): Promise<ApprovalReview> => {
    const order = await orderOf(input.requests.monitorOrder);
    const stock = await inStock(order.modelId);
    const use = stock.slice(0, order.quantity);
    const tags = use.map((row) => String(row.name));
    const rest = order.quantity - use.length;
    const flawed = use.find((row) => asText(row.notes));
    const last = await lastPrice(order.modelId, input.requests.monitorOrder);
    const lastNo = asText(last?.orderNo);
    const lastUnit = Number(last?.unitPrice ?? 0);
    if (lang === 'zh')
      return {
        recommendation: use.length ? 'conditional' : 'approve',
        summary: use.length
          ? `库存里有 ${String(use.length)} 台同型号显示器可以先用，建议只买差的 ${String(rest)} 台。`
          : '同型号没有库存，价格合理，可以按计划采购。',
        asked: `采购 ${String(order.quantity)} 台 ${order.model}：${String(order.quantity)} × ${money(lang, order.price)} = ${money(lang, order.total)}${use.length ? `；先用库存 ${String(use.length)} 台，只需再买 ${String(rest)} 台，${String(rest)} × ${money(lang, order.price)} = ${money(lang, rest * order.price)}` : ''}。`,
        reasons: [
          `采购单：销售部项目用，${String(order.quantity)} 台 ${order.model}，单价 ${money(lang, order.price)}`,
          `库存：同型号在库 ${String(stock.length)} 台${tags.length ? `（${list(lang, tags)}）` : ''}`,
          lastNo
            ? `以前的单价：${lastNo} 买同型号是 ${money(lang, lastUnit)}，这次 ${money(lang, order.price)}${order.price <= lastUnit ? '，不高于上次' : '，比上次高'}`
            : '以前的单价：没有买过这个型号',
        ],
        alternatives: use.length
          ? `先分配在库的 ${list(lang, tags)}，只采购差额 ${String(rest)} 台${flawed ? `；其中 ${String(flawed.name)} 备注“${String(flawed.notes)}”，适合给对显示要求不高的工位` : ''}。`
          : null,
        precedents: `${intern.no} 实习生笔记本因本季度预算用完被拒绝；同类小额补货一般直接批准。`,
        risks: [
          ...(use.length ? ['库存没先用完就采购，会多出闲置显示器'] : []),
          ...(flawed
            ? [`${String(flawed.name)} 有瑕疵，分配前要先和使用人确认`]
            : []),
          '说明没写是哪个项目、给谁用',
        ],
        missing: [
          '项目名称和使用人',
          `${String(order.quantity)} 台分别放在哪些工位`,
        ],
        conditions: use.length
          ? `先分配 ${list(lang, tags)}，只采购 ${String(rest)} 台，单价不超过 ${money(lang, order.price)}；在说明里补上项目名称和使用人。`
          : null,
        comment: use.length
          ? `同意按条件采购：请先分配库存的 ${list(lang, tags)}，只买剩下的 ${String(rest)} 台，合计不超过 ${money(lang, rest * order.price)}。另请在说明里补上项目名称和使用人。`
          : '同意，按计划采购。请在说明里补上项目名称和使用人。',
      };
    return {
      recommendation: use.length ? 'conditional' : 'approve',
      summary: use.length
        ? `${String(use.length)} monitors of the same model are in stock; buy only the ${String(rest)} still missing.`
        : 'None of this model is in stock and the price is fair; buy as planned.',
      asked: `${String(order.quantity)} × ${order.model} at ${money(lang, order.price)} = ${money(lang, order.total)}${use.length ? `; with ${String(use.length)} from stock only ${String(rest)} are needed, ${String(rest)} × ${money(lang, order.price)} = ${money(lang, rest * order.price)}` : ''}.`,
      reasons: [
        `The order: ${String(order.quantity)} × ${order.model} for a sales project, ${money(lang, order.price)} each`,
        `Stock: ${String(stock.length)} of the same model in stock${tags.length ? ` (${list(lang, tags)})` : ''}`,
        lastNo
          ? `Earlier price: ${lastNo} paid ${money(lang, lastUnit)} for the same model; ${money(lang, order.price)} now${order.price <= lastUnit ? ', no more than then' : ', more than then'}`
          : 'Earlier price: this model was never bought before',
      ],
      alternatives: use.length
        ? `Hand out ${list(lang, tags)} from stock first and buy only the ${String(rest)} missing${flawed ? `; ${String(flawed.name)} is noted "${String(flawed.notes)}", fine for a desk that does not depend on the display` : ''}.`
        : null,
      precedents: `${intern.no}, laptops for the interns, was rejected because the quarter's budget was spent; small restocking orders are usually approved as they are.`,
      risks: [
        ...(use.length
          ? ['Buying before the stock is used leaves monitors idle']
          : []),
        ...(flawed
          ? [`${String(flawed.name)} has a flaw; check with whoever gets it`]
          : []),
        'The description does not say which project or who uses them',
      ],
      missing: [
        'The project and who uses the monitors',
        `Which desks the ${String(order.quantity)} monitors are for`,
      ],
      conditions: use.length
        ? `Hand out ${list(lang, tags)} first, buy only ${String(rest)} at no more than ${money(lang, order.price)} each, and name the project and its users in the description.`
        : null,
      comment: use.length
        ? `Approved on conditions: hand out ${list(lang, tags)} from stock first and buy only the remaining ${String(rest)}, no more than ${money(lang, rest * order.price)} in all. Please add the project and who uses them to the description.`
        : 'Approved; buy as planned. Please add the project and who uses them to the description.',
    };
  };

  const airReview = async (): Promise<ApprovalReview> => {
    const order = await orderOf(input.requests.airOrder);
    const same = await inStock(order.modelId);
    const pros = (await inStock('model-macbook-pro-14-m3')).filter(
      (row) => !asText(row.notes),
    );
    const proTags = pros.slice(0, 3).map((row) => String(row.name));
    const last = await lastPrice(order.modelId, input.requests.airOrder);
    const lastNo = asText(last?.orderNo);
    const lastUnit = Number(last?.unitPrice ?? 0);
    if (lang === 'zh')
      return {
        recommendation: 'conditional',
        summary: `同型号没有库存，但在库还有 ${String(pros.length)} 台 MacBook Pro 14 可用；先确认本季度预算和新人名单再买。`,
        asked: `采购 ${String(order.quantity)} 台 ${order.model}：${String(order.quantity)} × ${money(lang, order.price)} = ${money(lang, order.total)}，人均 ${money(lang, order.price)}。`,
        reasons: [
          `采购单：研发新员工用，${String(order.quantity)} 台 ${order.model}，单价 ${money(lang, order.price)}`,
          `库存：同型号在库 ${String(same.length)} 台；研发标准配置的 MacBook Pro 14 M3 在库 ${String(pros.length)} 台${proTags.length ? `（${list(lang, proTags)}）` : ''}`,
          lastNo
            ? `以前的单价：${lastNo} 买同型号是 ${money(lang, lastUnit)}，这次 ${money(lang, order.price)}`
            : '以前的单价：没有买过这个型号',
        ],
        alternatives: proTags.length
          ? `研发的标准配置是 MacBook Pro 14 M3，在库的 ${list(lang, proTags)} 可以先给新人，只采购差额。`
          : null,
        precedents: `${intern.no} 实习生笔记本（${money(lang, intern.total)}）因“本季度预算已用完”被拒绝；这张单 ${money(lang, order.total)}，金额更大。`,
        risks: [
          `本季度预算：${intern.no} 刚因预算被拒绝`,
          `新人名单和入职日期没列，${String(order.quantity)} 台的数量无法核对`,
          '在库笔记本没先用，可能重复购置',
        ],
        missing: [
          `${String(order.quantity)} 位新人的姓名和入职日期`,
          '为什么要 MacBook Air，而不是研发标准配置',
        ],
        conditions: `先确认本季度预算；能用在库 MacBook Pro 14 的先分配，只采购差额，单价不超过 ${money(lang, order.price)}，并补上新人名单和入职日期。`,
        comment: `原则同意，但请先确认本季度预算，并补上 ${String(order.quantity)} 位新人的名单和入职日期。在库还有 ${String(pros.length)} 台 MacBook Pro 14 M3，能用的先分配，只采购差额。`,
      };
    return {
      recommendation: 'conditional',
      summary: `None of this model is in stock, but ${String(pros.length)} MacBook Pro 14s are; confirm the quarter's budget and the joiners before buying.`,
      asked: `${String(order.quantity)} × ${order.model} at ${money(lang, order.price)} = ${money(lang, order.total)}, ${money(lang, order.price)} a person.`,
      reasons: [
        `The order: ${String(order.quantity)} × ${order.model} for the R&D joiners, ${money(lang, order.price)} each`,
        `Stock: ${String(same.length)} of the same model; ${String(pros.length)} MacBook Pro 14 M3, the R&D standard kit's laptop${proTags.length ? ` (${list(lang, proTags)})` : ''}`,
        lastNo
          ? `Earlier price: ${lastNo} paid ${money(lang, lastUnit)} for the same model; ${money(lang, order.price)} now`
          : 'Earlier price: this model was never bought before',
      ],
      alternatives: proTags.length
        ? `R&D's standard kit is the MacBook Pro 14 M3: give the joiners ${list(lang, proTags)} from stock and buy only the difference.`
        : null,
      precedents: `${intern.no}, ${money(lang, intern.total)} of laptops for the interns, was rejected because the quarter's budget was spent; this order is ${money(lang, order.total)}.`,
      risks: [
        `The quarter's budget: ${intern.no} was just rejected for it`,
        `No list of joiners or start dates, so the ${String(order.quantity)} cannot be checked`,
        'Laptops in stock are not used first, which may buy twice',
      ],
      missing: [
        `The ${String(order.quantity)} joiners' names and start dates`,
        'Why MacBook Air rather than the R&D standard kit',
      ],
      conditions: `Confirm the quarter's budget; hand out the MacBook Pro 14s in stock where they fit and buy only the difference, at no more than ${money(lang, order.price)} each, with the joiners and start dates added.`,
      comment: `Approved in principle, but first confirm the quarter's budget and add the ${String(order.quantity)} joiners' names and start dates. ${String(pros.length)} MacBook Pro 14 M3 are in stock; hand those out where they fit and buy only the difference.`,
    };
  };

  const switchReview = async (): Promise<ApprovalReview> => {
    const order = await orderOf(input.requests.switchOrder);
    const stock = await inStock(order.modelId);
    const last = await lastPrice(order.modelId, input.requests.switchOrder);
    const lastNo = asText(last?.orderNo);
    const lastUnit = Number(last?.unitPrice ?? 0);
    if (lang === 'zh')
      return {
        recommendation: 'needMore',
        summary: `核心交换机 ${money(lang, order.total)}，没有库存可顶，但没写是哪个项目、为什么要第二台，需要补充。`,
        asked: `采购 ${String(order.quantity)} 台 ${order.model}，单价 ${money(lang, order.price)}，合计 ${money(lang, order.total)}。`,
        reasons: [
          `采购单：原因是项目专用，说明只有一句“${order.description}”`,
          `库存：同型号在库 ${String(stock.length)} 台`,
          lastNo
            ? `以前的单价：${lastNo} 同型号 ${money(lang, lastUnit)}，这次 ${money(lang, order.price)}`
            : '以前的单价：没有买过这个型号',
        ],
        alternatives: null,
        precedents: `${intern.no} 因本季度预算用完被拒绝；上万元的网络设备没有直接先例。`,
        risks: [
          '没写项目名称，必要性无法核实',
          '核心交换机要做机房割接，没附实施计划',
          '预算来源没说明',
        ],
        missing: [
          '项目名称和用途',
          '为什么需要第二台（冗余还是扩容）',
          '上线和割接计划',
        ],
        conditions: null,
        comment:
          '请先补充：是哪个项目、为什么需要第二台核心交换机，以及上线和割接计划、预算来源。补齐后我再审。',
      };
    return {
      recommendation: 'needMore',
      summary: `A core switch at ${money(lang, order.total)} with nothing in stock to use instead, but no project and no reason for a second one; ask for more.`,
      asked: `${String(order.quantity)} × ${order.model} at ${money(lang, order.price)}, ${money(lang, order.total)} in all.`,
      reasons: [
        `The order: reason "project", and the description is one line: "${order.description}"`,
        `Stock: ${String(stock.length)} of the same model in stock`,
        lastNo
          ? `Earlier price: ${lastNo} paid ${money(lang, lastUnit)} for the same model; ${money(lang, order.price)} now`
          : 'Earlier price: this model was never bought before',
      ],
      alternatives: null,
      precedents: `${intern.no} was rejected because the quarter's budget was spent; there is no earlier network purchase of this size.`,
      risks: [
        'No project named, so the need cannot be checked',
        'A core switch means a cut-over in the server room, with no plan attached',
        'Where the budget comes from is not said',
      ],
      missing: [
        'The project and what the switch is for',
        'Why a second one (redundancy or capacity)',
        'The installation and cut-over plan',
      ],
      conditions: null,
      comment:
        'Please add which project this is, why a second core switch is needed, the installation and cut-over plan, and where the budget comes from. I will look again once that is there.',
    };
  };

  const printerReview = async (): Promise<ApprovalReview> => {
    const device = await q()
      .selectFrom('disposalDevices')
      .innerJoin('devices', 'devices.id', 'disposalDevices.deviceId')
      .leftJoin('models', 'models.id', 'devices.modelId')
      .select([
        'devices.id as id',
        'devices.name as name',
        'devices.purchaseDate as purchaseDate',
        'devices.purchasePrice as purchasePrice',
        'devices.warrantyEndDate as warrantyEndDate',
        'models.name as model',
      ])
      .where('disposalDevices.disposalId', '=', input.requests.printerDisposal)
      .executeTakeFirst<Row>();
    const repairs = device
      ? await q()
          .selectFrom('repairs')
          .select(['id'])
          .where('deviceId', '=', String(device.id))
          .execute()
      : [];
    const name = asText(device?.name) ?? '';
    const model = asText(device?.model) ?? '';
    const bought = asText(device?.purchaseDate) ?? '';
    const months = Math.round(daysSince(bought) / 30.4);
    const price = Number(device?.purchasePrice ?? 0);
    const warranty = asText(device?.warrantyEndDate) ?? '';
    if (lang === 'zh')
      return {
        recommendation: 'reject',
        summary: `这台打印机才用了 ${String(months)} 个月，也没有维修记录，建议先报修，不要直接销毁。`,
        asked: `报废销毁 1 台打印机 ${name}（${model}）：${bought} 购入，原价 ${money(lang, price)}，${warranty} 过保。`,
        reasons: [
          `设备记录：${bought} 购入，至今 ${String(months)} 个月，还远没到使用年限`,
          `维修记录：${String(repairs.length)} 次，“频繁卡纸”一次都没报修过`,
          `保修：${warranty} 已过保，但过保不等于不值得修`,
        ],
        alternatives:
          '先报修卡纸问题；维修报价高于残值再报废，或者转给打印量小的楼层继续用。',
        precedents: '报废一般用于用满年限或维修不划算的设备，这台两样都不是。',
        risks: ['用不到两年就销毁，资产损失大', '销毁后这层没有替代的打印机'],
        missing: ['卡纸的维修记录或报价', '替代打印机的安排'],
        conditions: null,
        comment: `暂不同意报废：这台打印机 ${bought} 才买，没有任何维修记录。请先报修卡纸问题，拿到报价后如果维修不划算，再重新申请。`,
      };
    return {
      recommendation: 'reject',
      summary: `This printer is ${String(months)} months old with no repair on record; have it repaired before scrapping it.`,
      asked: `Scrap 1 printer, ${name} (${model}): bought ${bought} for ${money(lang, price)}, out of warranty since ${warranty}.`,
      reasons: [
        `The device: bought ${bought}, ${String(months)} months ago, far short of its useful life`,
        `Repairs: ${String(repairs.length)}; the jamming was never reported for repair`,
        `Warranty: ended ${warranty}, which does not make it not worth repairing`,
      ],
      alternatives:
        'Report the jamming for repair first; scrap it only if the quote exceeds what it is still worth, or move it to a floor that prints less.',
      precedents:
        'Scrapping is for devices past their useful life or not worth repairing; this one is neither.',
      risks: [
        'Scrapping a printer under two years old loses most of its value',
        'The floor is left without a printer',
      ],
      missing: ['A repair record or quote for the jamming', 'What replaces it'],
      conditions: null,
      comment: `Not approved for now: this printer was bought on ${bought} and has never been repaired. Please report the jamming for repair, and apply again if the quote shows a repair does not pay.`,
    };
  };

  const reviews: readonly [string, () => Promise<ApprovalReview>][] = [
    [input.requests.monitorOrder, monitorReview],
    [input.requests.airOrder, airReview],
    [input.requests.switchOrder, switchReview],
    [input.requests.printerDisposal, printerReview],
  ];
  // Each part is extra: one that fails leaves the demo without it rather
  // than failing the import.
  const apart = async (part: () => Promise<void>) => {
    try {
      await part();
    } catch {
      // The demo is in; this suggestion is not.
    }
  };
  await apart(async () => {
    for (const [subjectId, write] of reviews) {
      const approval = await q()
        .selectFrom('approvals')
        .selectAll()
        .where('subjectId', '=', subjectId)
        .where('status', '=', 'pending')
        .executeTakeFirst<Row>();
      if (!approval) continue;
      const approvers =
        typeof approval.approverIds === 'string'
          ? (JSON.parse(approval.approverIds) as unknown)
          : approval.approverIds;
      const deciderId = Array.isArray(approvers)
        ? asText(approvers.find(Boolean))
        : undefined;
      if (!deciderId) continue;
      const run = await agents.runs.start({
        agent: 'approvalReview',
        trigger: 'submitted',
        startedById: null,
        subjectType:
          approval.subjectType === 'disposal' ? 'disposals' : 'purchaseOrders',
        subjectId,
        refId: String(approval.id),
        deciderId,
      });
      await track('itamAgentRuns', { id: run.id });
      await agents.runs.finish(run.id, {
        status: 'pending',
        result: { ...(await write()) },
      });
    }
  });

  // --- MDM 跟进: every item MDM 核对 lists, answered here --------------------

  const people = new Map(
    (
      await q()
        .selectFrom('people')
        .select(['id', 'name'])
        .execute<{ id: unknown; name: unknown }>()
    ).map((row) => [String(row.id), String(row.name)]),
  );
  const nameOf = (id: unknown) => people.get(String(id)) ?? '';
  // The register's devices by name, for a platform record that reports a
  // device under another serial (2026-10-21).
  const devicesByName = new Map(
    (
      await q()
        .selectFrom('devices')
        .select(['id', 'name', 'deviceNo', 'serialNo'])
        .execute<{
          id: unknown;
          name: unknown;
          deviceNo: unknown;
          serialNo: unknown;
        }>()
    ).flatMap((row) => {
      const name = asText(row.name);
      return name ? [[name, row] as const] : [];
    }),
  );
  const decide = (entry: Readonly<Record<string, unknown>>) => {
    const ref = String(entry.ref);
    const kind = String(entry.kind);
    const answer = (
      action: FollowUpDecision['action'],
      reason: string,
      extra: Partial<FollowUpDecision> = {},
    ): FollowUpDecision => ({ item: ref, action, reason, ...extra });
    const zh = lang === 'zh';
    if (kind === 'unregistered') {
      const user = asText(entry.userName);
      const model = asText(entry.model) ?? '';
      const serial = asText(entry.serialNo);
      if (!serial || /virtual/i.test(model))
        return answer(
          'ignore',
          zh
            ? '虚拟机，没有序列号，不作为资产登记。'
            : 'A virtual machine with no serial; not an asset to register.',
        );
      const modelId = asText(entry.suggestedModelId);
      // A register device of that name, under another serial: the same
      // machine, its board replaced.
      const same = devicesByName.get(asText(entry.deviceName) ?? '');
      if (same)
        return answer(
          'link',
          zh
            ? `台账里有同名设备 ${String(same.deviceNo)}，序列号是 ${asText(same.serialNo) ?? '—'}，MDM 上报的是 ${serial}，应是换过主板，关联到这台。`
            : `The register has ${String(same.deviceNo)} by that name, serial ${asText(same.serialNo) ?? '—'}; MDM reports ${serial}. Its board was likely replaced; link it to that device.`,
          { target: String(same.id) },
        );
      if (modelId && asText(entry.personId))
        return answer(
          'register',
          zh
            ? `Intune 主用户是${user ?? ''}，型号 ${model} 台账里有，序列号 ${serial} 台账里没有。`
            : `Intune's primary user is ${user ?? ''}; the ${model} is a model on the register, serial ${serial} is not.`,
          { modelId },
        );
      // A model the register has, under someone who is no person on it.
      if (modelId && user)
        return answer(
          'verify',
          zh
            ? `Intune 主用户${user}不在台账人员里，型号 ${model} 台账里有。先确认此人（可能刚入职还没录入），录入后再补登记并分配。`
            : `Intune's primary user ${user} is no person on the register; the ${model} is a model on it. Find out who they are (perhaps a joiner not yet entered), then register it and assign it.`,
        );
      if (!modelId && user)
        return answer(
          'ignore',
          zh
            ? `${user}的电脑，型号 ${model} 不在台账上，不是公司资产。`
            : `${user}'s computer; the ${model} is no model on the register, so not a company asset.`,
        );
      return answer(
        'verify',
        zh
          ? '平台记录信息不够，先确认是谁的设备。'
          : 'The platform record says too little; find out whose device it is.',
      );
    }
    if (kind === 'unmanaged')
      return answer(
        'verify',
        zh
          ? `${nameOf(entry.assigneeId) || '使用人'}在用，两个平台都没有这台，请安排在 MDM 平台注册。`
          : `${nameOf(entry.assigneeId) || 'Its user'} has it and neither platform knows it; have it enrolled.`,
      );
    const difference = (entry.difference ?? {}) as Row;
    const synced = difference.lastSyncAt;
    const user = asText(difference.userName);
    if (kind === 'userMismatch' && asText(difference.personId))
      return answer(
        'transfer',
        zh
          ? `Intune 主用户是${user ?? ''}，${day(lang, synced)}还在同步；台账上是${nameOf(difference.assigneeId)}。`
          : `Intune's primary user is ${user ?? ''}, syncing on ${day(lang, synced)}; the register says ${nameOf(difference.assigneeId)}.`,
        { target: String(difference.personId) },
      );
    if (kind === 'stale' && difference.value === 'gone')
      return answer(
        'escalate',
        zh
          ? `Intune 不再上报这台（${user ?? '使用人'}在用），请平台管理员确认它是不是被移出了管理。`
          : `Intune no longer reports it (${user ?? 'its user'} has it); the platform's administrator should check whether it was removed.`,
      );
    if (kind === 'stale')
      return answer(
        'verify',
        zh
          ? `已 ${String(daysSince(synced))} 天没同步（最后 ${day(lang, synced)}），先问${user ?? '使用人'}设备还在不在用。`
          : `Not synced for ${String(daysSince(synced))} days (last ${day(lang, synced)}); ask ${user ?? 'its user'} whether it is still in use.`,
      );
    // Lost, and online under a person (2026-10-22): found in their hands.
    if (kind === 'statusMismatch' && difference.value === 'lost')
      return answer(
        'verify',
        zh
          ? `台账上已丢失，但 ${day(lang, synced)}还在 Intune 同步${user ? `，主用户是${user}` : ''}；确认找回后恢复为库存中${user ? `，再分配给${user}` : ''}`
          : `Lost on the register yet syncing with Intune on ${day(lang, synced)}${user ? ` under ${user}` : ''}; once found, restore it to stock${user ? ` and assign it to ${user}` : ''}.`,
      );
    // In stock, and online under a person: handed out by hand.
    if (
      kind === 'statusMismatch' &&
      difference.value === 'inStock' &&
      asText(difference.personId)
    )
      return answer(
        'verify',
        zh
          ? `台账上在库，但 ${day(lang, synced)}还在 Intune 同步，主用户是${user ?? ''}；确认后分配给${user ?? '主用户'}`
          : `In stock on the register yet syncing with Intune on ${day(lang, synced)} under ${user ?? 'a person'}; once confirmed, assign it to them.`,
      );
    if (kind === 'statusMismatch' && difference.critical)
      return answer(
        'escalate',
        zh
          ? `台账上已报废，但 ${day(lang, synced)}还在 Intune 同步，请平台管理员远程擦除并移出管理。`
          : `Disposed on the register yet syncing with Intune on ${day(lang, synced)}; the platform's administrator should wipe and retire it.`,
      );
    return answer(
      'verify',
      zh
        ? `台账上在库，但 ${day(lang, synced)}还在 Intune 同步，先到库房确认是不是被人领走了。`
        : `In stock on the register yet syncing with Intune on ${day(lang, synced)}; check the store room for who took it.`,
    );
  };
  const answerer: FollowUpAnswerer = (material) => material.map(decide);
  const since = new Date(Date.now() - 1000);
  await apart(async () => {
    await agents.followUp.afterSync(input.actorId, {
      answerer,
      locale: input.locale,
    });
  });
  // The runs it started, however far it got.
  for (const started of await agents.runs.list('deviceSync', { since })) {
    await track('itamAgentRuns', { id: started.id });
    const planId = asText(started.result?.planId);
    if (!planId) continue;
    await track('itamPlans', { id: planId });
    // A plan lasts a day; the demo's waits as long as the demo is looked at.
    await q()
      .updateTable('itamPlans')
      .set({ expiresAt: new Date(Date.now() + PLAN_DAYS * DAY) })
      .where('id', '=', planId)
      .execute();
  }

  // --- 入职建议: Asset Steward's picks for the joiners -----------------------

  const taken = new Set<string>();
  const runner: AgentRunner = {
    available: async () => true,
    async run({ prompt }) {
      const question = JSON.parse(prompt) as {
        joiner: { name: string };
        items: {
          line: string;
          kind: string;
          missing: number;
          candidates: { id: string; label: string; facts: Row }[];
        }[];
      };
      // A candidate passed over, by its short label and why.
      const passed = (label: string, flaw: string) => {
        const short = label.split(' / ').pop() ?? label;
        return lang === 'zh' ? `${short}（${flaw}）` : `${short} (${flaw})`;
      };
      const avoided: string[] = [];
      const items = question.items.map((item) => {
        const scored = item.candidates
          .filter((candidate) => !taken.has(candidate.id))
          .map((candidate) => ({ candidate, ...score(lang, candidate.facts) }));
        scored.sort((a, b) => b.score - a.score);
        const picked = scored.slice(0, Math.max(1, item.missing));
        const others = scored
          .slice(picked.length)
          .flatMap((other) =>
            other.flaw ? [passed(other.candidate.label, other.flaw)] : [],
          );
        avoided.push(...others);
        return {
          line: item.line,
          picks: picked.map(({ candidate, merits }) => {
            taken.add(candidate.id);
            const reason =
              lang === 'zh'
                ? `${merits}${others.length ? `；没选 ${list(lang, others)}` : ''}。`
                : `${merits}${others.length ? `; not ${list(lang, others)}` : ''}.`;
            return { id: candidate.id, reason };
          }),
        };
      });
      const count = items.reduce((sum, item) => sum + item.picks.length, 0);
      const summary =
        lang === 'zh'
          ? `为${question.joiner.name}挑了 ${String(count)} 样，都在库可用。${avoided.length ? `避开了 ${list(lang, avoided)}。` : ''}`
          : `Chose ${String(count)} items for ${question.joiner.name}, all available now.${avoided.length ? ` Passed over ${list(lang, avoided)}.` : ''}`;
      return { items, summary } satisfies AdviceAnswer;
    },
  };
  await apart(async () => {
    for (const personId of input.joiners)
      await agents.advisor.advise(personId, { runner, trigger: 'demo' });
    await agents.advisor.idle();
  });
}

/** How a candidate weighs, what speaks for it, and what speaks against it. */
function score(
  lang: Lang,
  facts: Row,
): { score: number; merits: string; flaw: string | null } {
  const zh = lang === 'zh';
  const flaws: string[] = [];
  const merits: string[] = [];
  let value = 0;
  const repairs = Number(facts.repairs ?? 0);
  if (repairs > 0) {
    value -= 10 * repairs;
    flaws.push(
      asText(facts.notes) ??
        (zh
          ? `修过 ${String(repairs)} 次`
          : `repaired ${String(repairs)} times`),
    );
  } else if (asText(facts.notes)) {
    value -= 6;
    flaws.push(String(facts.notes));
  }
  const replace = asText(facts.plannedReplacementDate);
  if (replace && replace < addYear(today())) {
    value -= 8;
    flaws.push(
      zh
        ? `${replace.slice(0, 7)} 就到更换期`
        : `due for replacement in ${replace.slice(0, 7)}`,
    );
  }
  if (facts.sameLocationAsJoiner === true) {
    value += 3;
    merits.push(
      zh
        ? `和新人同在 ${asText(facts.location) ?? ''}`
        : `at ${asText(facts.location) ?? ''}, where the joiner sits`,
    );
  }
  if (facts.kind === 'subscription' || facts.kind === 'perpetual') {
    const trial = facts.billingModel === 'flat' && facts.autoRenew !== true;
    if (trial) {
      value -= 8;
      const ends = asText(facts.expiryDate)?.slice(5, 10) ?? '';
      flaws.push(
        zh ? `${ends} 到期，不续订` : `ends ${ends} and does not renew`,
      );
    }
    if (facts.autoRenew === true) {
      value += 2;
      merits.push(
        zh ? '正式订阅，自动续订' : 'a paid subscription that renews itself',
      );
    }
  }
  const warranty = asText(facts.warrantyEndDate);
  if (warranty) {
    value += Number(warranty.slice(0, 4)) - 2000;
    if (!flaws.length)
      merits.push(
        zh
          ? `保修到 ${warranty.slice(0, 7)}`
          : `under warranty until ${warranty.slice(0, 7)}`,
      );
  }
  if (!flaws.length && repairs === 0 && facts.repairs !== undefined)
    merits.push(zh ? '没有维修记录' : 'never repaired');
  if (!merits.length)
    merits.push(
      zh
        ? '与其他候选无差别，按地点就近'
        : 'no different from the others; the nearest',
    );
  return {
    score: value,
    merits: list(lang, merits),
    flaw: flaws.length ? list(lang, flaws) : null,
  };
}

const addYear = (date: string) =>
  `${String(Number(date.slice(0, 4)) + 1)}${date.slice(4)}`;
