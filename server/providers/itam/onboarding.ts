import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText, decodeRow, type Row } from './collection-query.js';
import { addDays, isoDate, today } from './dates.js';
import { OPEN_DISPOSAL_STATUSES } from './recovery.js';
import { ValidationError } from './errors.js';
import type { HistoryService } from './history.js';
import { DEFAULT_ITAM_SETTINGS, type SettingsService } from './settings.js';

/**
 * 入职配备: what a new joiner should be given, what they already have, and
 * which items in stock would make up the rest (2026-10-05).
 *
 * The kit is the rule (`onboardingKits`, by department and position); this
 * is the arithmetic on it, deterministic so that "which laptop" is a
 * computed answer rather than a guess — the page lists it and Asset Steward presents
 * it, and neither invents a device. Among the candidates the arithmetic
 * finds, Asset Steward may have chosen in the background with a reason
 * (`onboarding-advisor.ts`, 2026-10-06): its pick leads while it is still
 * free, and the rule's order decides the rest. It writes nothing: every proposal is
 * carried out by the operation that already exists for it (reserve, issue,
 * assign a seat), under the reader's own grants.
 *
 * A kit item is a model, a category (any model in it or below it) or a
 * software product. What the person already holds or has reserved counts
 * first, each thing towards one item only; what is left is proposed from
 * stock — a device in stock and unreserved, nearest first (the person's own
 * location), then the longest warranty; a stock item with enough on hand;
 * an entitlement with a free seat — and whatever stock cannot cover is the
 * shortfall, for a purchase order.
 *
 * Every joiner is worked out together (2026-10-06, `allocate`): earliest
 * first day first, each taking from the same pools, so two joiners are never
 * proposed the same laptop, the last mouse or the last seat. What stock
 * cannot cover may still arrive in time and is **planned** rather than
 * proposed: goods on an open purchase order — one bought for them in any
 * status, any other once placed and expected in time — and, last, the
 * devices and seats of people leaving, from their leave date (a device made
 * ready over `onboardingPrepDays`, and not one due for replacement or out of
 * warranty by then). Nothing is held by a plan: it is recomputed on every
 * reading, and only a reservation commits anything. A shortfall carries the
 * last day to order it (`purchaseLeadDays` before it must be made ready).
 */

export type KitTargetType = 'model' | 'category' | 'softwareProduct';
export type KitItemKind = 'device' | 'stock' | 'entitlement';

export interface OnboardingKit {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly position: string | null;
}

/** Something the person has towards an item, or that is proposed for it. */
export interface PlanThing {
  readonly type: 'device' | 'stock' | 'seat';
  /** The device, the stock item or the entitlement. */
  readonly id: string;
  readonly label: string;
  /** A device already theirs: assigned, or reserved for them. */
  readonly state?: 'assigned' | 'reserved';
  /** Stock: how many. */
  readonly quantity?: number;
  /**
   * A subscription seat is held under an account: the person's e-mail is
   * proposed for it, and with no e-mail the seat cannot be assigned from
   * here (`needsAccount` without `account`).
   */
  readonly needsAccount?: boolean;
  readonly account?: string;
  /** A proposal Asset Steward chose in the background, with the reason it gave. */
  readonly source?: 'noco';
  readonly reason?: string;
  /**
   * A device Asset Steward chose over the one the rule would have proposed
   * (2026-10-22): that one, so the card can say what it replaced.
   */
  readonly instead?: { readonly id: string; readonly label: string };
  /** A planned thing: where it will come from, and from when. */
  readonly supply?: PlanSupply;
}

/**
 * Where a planned thing comes from, since it is not in stock now: an open
 * purchase order, or somebody leaving who hands it back.
 */
export interface PlanSupply {
  readonly kind: 'order' | 'return';
  /**
   * The first day it can be handed over: the order's expected arrival, or
   * the leave date, plus the days a device takes to make ready. Null for an
   * order bought for them that is not placed yet.
   */
  readonly availableOn: string | null;
  readonly orderId?: string;
  readonly orderNo?: string;
  readonly orderStatus?: string;
  /** Who is leaving with it. */
  readonly fromId?: string;
  readonly fromName?: string;
}

/**
 * Something in stock that could make up an item, with what the choice
 * between them turns on: what Asset Steward is shown when it picks in the
 * background (`onboarding-advisor.ts`).
 */
export interface PlanCandidate {
  readonly id: string;
  readonly label: string;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
}

/** Asset Steward's latest background run for this joiner, as the card shows it. */
export interface PlanAdvice {
  readonly runId: string;
  readonly status: 'running' | 'ready' | 'failed';
  readonly summary: string | null;
  readonly failure: string | null;
  readonly sessionId: string | null;
  readonly actorId: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface OnboardingPlanLine {
  /** The item's identity across runs: `<target type>:<target id>`. */
  readonly key: string;
  readonly target: {
    readonly type: KitTargetType;
    readonly id: string;
    readonly name: string;
  };
  readonly kind: KitItemKind;
  /**
   * What a purchase line for the shortfall would be: the category's kind for
   * a model or category (device, accessory, consumable, component), and for
   * software the kind of an entitlement already on the books for it
   * (perpetual or subscription) — null when there is none to go by.
   */
  readonly itemType: string | null;
  readonly required: number;
  readonly prepared: readonly PlanThing[];
  readonly preparedCount: number;
  readonly proposals: readonly PlanThing[];
  /**
   * Not in stock now but expected in time: on an open purchase order, or
   * handed back by somebody leaving. Nothing to press; it says where from.
   */
  readonly planned: readonly PlanThing[];
  /**
   * Marked 不需要 for this person by their 入职负责人: nothing is proposed
   * or ordered for it, and it counts towards neither total.
   */
  readonly waived: boolean;
  /** How many stock is asked for: required less what they have. */
  readonly missing: number;
  /** Only when asked for (`candidates: true`): what stock could give. */
  readonly candidates?: readonly PlanCandidate[];
  /** How many of `planned` are on open purchase orders. */
  readonly onOrder: number;
  /** How many of `planned` come back from somebody leaving. */
  readonly returning: number;
  /** What neither they, stock nor anything planned covers: to be bought. */
  readonly shortfall: number;
  /**
   * With a shortfall, the last day to order it: the joining day less the
   * days to make it ready and the purchase lead time.
   */
  readonly orderBy: string | null;
}

/** An open order the plan counts on: one raised for them, or drawn on. */
export interface PlanOrder {
  readonly id: string;
  readonly orderNo: string;
  readonly status: string;
}

export interface OnboardingPlan {
  readonly personId: string;
  readonly hireDate: string | null;
  /** The kit that applies, or null when none does. */
  readonly kit: OnboardingKit | null;
  readonly lines: readonly OnboardingPlanLine[];
  /** Totals over the lines not marked 不需要: the card's 已配备 N / M. */
  readonly prepared: number;
  readonly required: number;
  /** How many items are marked 不需要. */
  readonly waived: number;
  /** Whether they already hold or have reserved any device at all. */
  readonly hasDevice: boolean;
  /**
   * Open 新员工配备 orders for them, and any other order the plan draws
   * on: what is already being bought, so it is not bought twice.
   */
  readonly orders: readonly PlanOrder[];
  /** Asset Steward's latest background run for them, or null when none ran. */
  readonly advice: PlanAdvice | null;
}

/**
 * A JSON list of strings — the items marked 不需要, a department's
 * positions — however the column came back.
 */
export function stringList(value: unknown): string[] {
  const list =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;
  return Array.isArray(list) ? list.map(String) : [];
}

/** How long before somebody's first day they may be entered and be a joiner. */
export const JOINER_ENTERED_WITHIN_DAYS = 30;

/**
 * Whether somebody is a joiner rather than an employee entered after the
 * fact (2026-10-06): their joining day is no more than 30 days before they
 * were entered in the register. Somebody imported when the register went
 * live, two years after they started, is not equipped by 入职配置 — they
 * already have what they have — and without this every one of them would
 * sit in 入职准备 for ever, their kit never matched.
 */
export function isJoiner(hireDate: unknown, createdAt: unknown): boolean {
  const hire = asText(hireDate);
  if (!hire) return false;
  const entered =
    createdAt instanceof Date ? isoDate(createdAt) : asText(createdAt);
  if (!entered) return false;
  return (
    hire.slice(0, 10) >=
    addDays(entered.slice(0, 10), -JOINER_ENTERED_WITHIN_DAYS)
  );
}

/** Whether a plan has everything in hand: each item held, reserved or 不需要. */
export function isPrepared(plan: OnboardingPlan): boolean {
  return plan.kit ? plan.prepared >= plan.required : plan.hasDevice;
}

/** Purchase order statuses still on their way to arriving. */
const OPEN_ORDER_STATUSES = [
  'draft',
  'pendingApproval',
  'approved',
  'ordered',
  'partiallyReceived',
];
/**
 * An order another joiner may count on: placed, so it has an expected
 * arrival. One approved and not placed has none yet.
 */
const PLACED_ORDER_STATUSES = new Set(['ordered', 'partiallyReceived']);

/** A device somebody leaving will hand back, and from when. */
interface ReturnDevice {
  readonly row: Row;
  readonly availableOn: string;
  readonly fromId: string;
  readonly fromName: string;
}

/** A seat somebody leaving frees, and from when. */
interface ReturnSeat {
  readonly entitlementId: string;
  readonly name: string;
  readonly productId: string;
  readonly availableOn: string;
  readonly fromId: string;
  readonly fromName: string;
  used: boolean;
}

/** What an open purchase order line still has to deliver. */
interface OrderLine {
  readonly orderId: string;
  readonly orderNo: string;
  readonly status: string;
  readonly newHire: boolean;
  readonly departmentId: string | null;
  readonly neededBy: string | null;
  readonly expectedAt: string | null;
  readonly modelId: string | null;
  readonly productId: string | null;
  left: number;
}

/** What the joiners' plans draw on, shared by them in turn. */
interface Pools {
  readonly today: string;
  readonly prepDays: number;
  readonly leadDays: number;
  readonly categories: readonly Row[];
  readonly models: ReadonlyMap<string, Row>;
  readonly stockDevices: readonly Row[];
  readonly returns: readonly ReturnDevice[];
  /** Devices proposed or planned for a joiner already worked out. */
  readonly takenDevices: Set<string>;
  /** The person each device Asset Steward picked was picked for. */
  readonly pins: ReadonlyMap<string, string>;
  readonly stockItems: { readonly row: Row; available: number }[];
  readonly entitlements: { readonly row: Row; free: number }[];
  readonly leaverSeats: ReturnSeat[];
  readonly orderLines: OrderLine[];
}

/** A category and every category below it. */
function treeOf(categories: readonly Row[], id: string): Set<string> {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of categories)
      if (
        !found.has(String(row.id)) &&
        found.has(String(asText(row.parentId) ?? ''))
      ) {
        found.add(String(row.id));
        grew = true;
      }
  }
  return found;
}

/** A plan line's counts, from what was found for it. */
function finishLine(input: {
  readonly key: string;
  readonly target: OnboardingPlanLine['target'];
  readonly kind: KitItemKind;
  readonly itemType: string | null;
  readonly required: number;
  readonly prepared: readonly PlanThing[];
  readonly proposals: readonly PlanThing[];
  readonly planned: readonly PlanThing[];
  readonly waived: boolean;
  /** Required less what they have. */
  readonly asked: number;
  /** What is still uncovered. */
  readonly missing: number;
  readonly orderBy: string;
  readonly candidates?: readonly PlanCandidate[];
}): OnboardingPlanLine {
  const count = (things: readonly PlanThing[]) =>
    things.reduce((sum, thing) => sum + (thing.quantity ?? 1), 0);
  const shortfall = input.waived ? 0 : Math.max(0, input.missing);
  return {
    key: input.key,
    target: input.target,
    kind: input.kind,
    itemType: input.itemType,
    required: input.required,
    prepared: input.prepared,
    preparedCount: count(input.prepared),
    proposals: input.proposals,
    planned: input.planned,
    waived: input.waived,
    missing: input.waived ? 0 : Math.max(0, input.asked),
    ...(input.candidates ? { candidates: input.candidates } : {}),
    onOrder: count(
      input.planned.filter((thing) => thing.supply?.kind === 'order'),
    ),
    returning: count(
      input.planned.filter((thing) => thing.supply?.kind === 'return'),
    ),
    shortfall,
    orderBy: shortfall > 0 ? input.orderBy : null,
  };
}

export interface OnboardingService {
  /** The kit for a department and position, walking up the departments. */
  kitFor(
    departmentId: string | null,
    position: string | null,
  ): Promise<OnboardingKit | null>;
  /**
   * A person's plan, worked out with every other joiner's (`allocate`):
   * `candidates` adds what each item could be given at their turn.
   */
  plan(
    personId: string,
    options?: { readonly candidates?: boolean },
  ): Promise<OnboardingPlan | null>;
  /** Every joiner still in progress, by id: one pass for all of them. */
  plans(): Promise<Map<string, OnboardingPlan>>;
  /**
   * Marks an item of a person's kit 不需要, or takes the mark back, and
   * writes it on their timeline. Taking one back reopens a joiner already
   * counted as equipped, since they now lack something again.
   */
  waive(
    personId: string,
    key: string,
    waived: boolean,
    actorId: string,
  ): Promise<OnboardingPlan | null>;
  /**
   * A department's 入职配置 as its page shows it (2026-10-06): its default
   * kit, the one it takes from above when it has none, and each of its
   * positions with its own kit or none (the default's), and how many people
   * in the department hold it.
   */
  departmentKits(departmentId: string): Promise<DepartmentKits | null>;
}

export interface KitSummary {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly position: string | null;
  readonly items: unknown;
}

export interface DepartmentKits {
  readonly department: { readonly id: string; readonly name: string };
  readonly defaultKit: KitSummary | null;
  /** The kit a department with no default of its own takes, and whose. */
  readonly inherited: {
    readonly department: { readonly id: string; readonly name: string };
    readonly kit: KitSummary;
  } | null;
  /**
   * Whether a department above has a default kit to fall back on
   * (2026-10-21): without one, giving up its own kit would leave the
   * department with none.
   */
  readonly inheritable: boolean;
  readonly positions: readonly {
    readonly name: string;
    readonly kit: KitSummary | null;
    readonly holders: number;
  }[];
}

/** How many candidates an item shows Asset Steward: enough to choose among. */
const CANDIDATE_LIMIT = 12;

/** Asset Steward's picks for one kit item, as a run stores them. */
export interface AdvisedLine {
  readonly line: string;
  readonly picks: readonly { readonly id: string; readonly reason: string }[];
}

export const onboardingServiceToken: ServiceToken<OnboardingService> =
  createServiceToken<OnboardingService>('itam/onboarding');

const STOCK_KINDS = new Set(['accessory', 'consumable', 'component']);

const same = (a: unknown, b: unknown): boolean =>
  (asText(a) ?? '').trim().toLowerCase() ===
  (asText(b) ?? '').trim().toLowerCase();

export function createOnboardingService(
  database: DatabaseManager,
  history?: HistoryService,
  /** For the days to make a device ready and the purchase lead time. */
  settings?: SettingsService,
): OnboardingService {
  const q = () => database.query();

  const kitFor: OnboardingService['kitFor'] = async (
    departmentId,
    position,
  ) => {
    let current = departmentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const kits = await q()
        .selectFrom('onboardingKits')
        .select(['id', 'name', 'departmentId', 'position'])
        .where('departmentId', '=', current)
        .execute<Row>();
      // The position's own kit first, then the department's default.
      const match =
        (position && kits.find((kit) => same(kit.position, position))) ||
        kits.find((kit) => !asText(kit.position));
      if (match)
        return {
          id: String(match.id),
          name: String(match.name),
          departmentId: String(match.departmentId),
          position: asText(match.position) ?? null,
        };
      const parent = await q()
        .selectFrom('departments')
        .select(['parentId'])
        .where('id', '=', current)
        .executeTakeFirst<Row>();
      current = asText(parent?.parentId) ?? null;
    }
    return null;
  };

  /** Names of records by id, for the facts a candidate is shown with. */
  const namesOf = async (
    table: 'locations' | 'models',
    ids: readonly (string | undefined)[],
  ): Promise<Map<string, string>> => {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return new Map();
    const rows = await q()
      .selectFrom(table)
      .select(['id', 'name'])
      .where('id', 'in', wanted)
      .execute<Row>();
    return new Map(rows.map((row) => [String(row.id), String(row.name)]));
  };

  /**
   * A device in stock as Asset Steward sees it: where it is, how old, how long its
   * warranty runs, when it is due to be replaced and how often it has been
   * repaired — what a person choosing among identical laptops would ask.
   */
  const deviceCandidates = async (
    rows: readonly Row[],
    locationId: string | null,
  ): Promise<PlanCandidate[]> => {
    if (rows.length === 0) return [];
    const places = await namesOf(
      'locations',
      rows.map((row) => asText(row.locationId)),
    );
    const models = await namesOf(
      'models',
      rows.map((row) => asText(row.modelId)),
    );
    const repairs = new Map(
      (
        await q()
          .selectFrom('repairs')
          .select((eb) => ['deviceId', eb.fn.countAll().as('count')])
          .where(
            'deviceId',
            'in',
            rows.map((row) => String(row.id)),
          )
          .groupBy('deviceId')
          .execute<Row>()
      ).map((row) => [String(row.deviceId), Number(row.count) || 0]),
    );
    return rows.map((row) => ({
      id: String(row.id),
      label: `${String(row.deviceNo)} / ${String(row.name)}`,
      facts: {
        model: models.get(String(asText(row.modelId) ?? '')) ?? null,
        location: places.get(String(asText(row.locationId) ?? '')) ?? null,
        sameLocationAsJoiner:
          locationId !== null && asText(row.locationId) === locationId,
        purchaseDate: asText(row.purchaseDate) ?? null,
        warrantyEndDate: asText(row.warrantyEndDate) ?? null,
        plannedReplacementDate: asText(row.plannedReplacementDate) ?? null,
        repairs: repairs.get(String(row.id)) ?? 0,
        notes: asText(row.notes) ?? null,
      },
    }));
  };

  /**
   * Who Asset Steward picked each device for, by every person's latest finished run.
   * Two joiners of the same department want the same laptop, and without
   * this the plan offered both of them the one Asset Steward had just chosen for the
   * first. A pick is held only while it is still a pick: once reserved it
   * leaves stock anyway, and a newer run replaces it.
   */
  const pinsOf = async (): Promise<Map<string, string>> => {
    const runs = await q()
      .selectFrom('onboardingRuns')
      .select(['personId', 'suggestions', 'createdAt'])
      .where('status', '=', 'ready')
      .orderBy('createdAt', 'desc')
      .execute<Row>();
    const seen = new Set<string>();
    const pins = new Map<string, string>();
    for (const run of runs) {
      const personId = String(run.personId);
      if (seen.has(personId)) continue;
      seen.add(personId);
      const stored = decodeRow(run).suggestions;
      for (const line of Array.isArray(stored) ? (stored as AdvisedLine[]) : [])
        // Only a device is one thing for one person; a stock record or an
        // entitlement has room for several.
        if (!String(line.line).startsWith('softwareProduct:'))
          for (const pick of line.picks ?? [])
            if (!pins.has(String(pick.id))) pins.set(String(pick.id), personId);
    }
    return pins;
  };

  /** Asset Steward's latest run for a person, and the picks of its latest ready one. */
  const adviceFor = async (
    personId: string,
  ): Promise<{
    advice: PlanAdvice | null;
    picks: Map<string, Map<string, string>>;
  }> => {
    const runs = await q()
      .selectFrom('onboardingRuns')
      .select([
        'id',
        'status',
        'summary',
        'failure',
        'sessionId',
        'actorId',
        'createdAt',
        'finishedAt',
        'suggestions',
      ])
      .where('personId', '=', personId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .execute<Row>();
    const latest = runs[0];
    const ready = runs.find((run) => run.status === 'ready');
    const picks = new Map<string, Map<string, string>>();
    const stored = ready ? decodeRow(ready).suggestions : undefined;
    for (const line of Array.isArray(stored) ? (stored as AdvisedLine[]) : [])
      picks.set(
        String(line.line),
        new Map(
          (line.picks ?? []).map((pick) => [
            String(pick.id),
            String(pick.reason ?? ''),
          ]),
        ),
      );
    return {
      advice: latest
        ? {
            runId: String(latest.id),
            status: String(latest.status) as PlanAdvice['status'],
            summary: asText(latest.summary) ?? null,
            failure: asText(latest.failure) ?? null,
            sessionId: asText(latest.sessionId) ?? null,
            actorId: String(latest.actorId),
            createdAt: String(latest.createdAt),
            finishedAt: asText(latest.finishedAt) ?? null,
          }
        : null,
      picks,
    };
  };

  /**
   * Asset Steward's picks first, in its order, then the rule's: a pick still free
   * leads, and one taken since simply is not among the rows any more.
   */
  const preferred = <T>(
    rows: readonly T[],
    idOf: (row: T) => string,
    picks: ReadonlyMap<string, string> | undefined,
  ): T[] => {
    if (!picks || picks.size === 0) return [...rows];
    const order = [...picks.keys()];
    const rank = (row: T) => {
      const at = order.indexOf(idOf(row));
      return at === -1 ? order.length : at;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
  };

  /** The reason Asset Steward gave for a thing, marking it as Asset Steward's. */
  const advised = (
    picks: ReadonlyMap<string, string> | undefined,
    id: string,
  ): Pick<PlanThing, 'source' | 'reason'> =>
    picks?.has(id) ? { source: 'noco', reason: picks.get(id) } : {};

  /**
   * What the joiners' plans draw on, read once for all of them: stock now,
   * what is on its way — open purchase orders, and the devices and seats of
   * people leaving — and the devices Asset Steward picked for somebody. Each plan
   * takes from it in turn, so what one joiner is planned is not offered to
   * the next.
   */
  const supplyPools = async (): Promise<Pools> => {
    const now = today();
    const thresholds = settings
      ? await settings.get('thresholds')
      : DEFAULT_ITAM_SETTINGS.thresholds;
    const prepDays = Math.max(0, Number(thresholds.onboardingPrepDays) || 0);
    const leadDays = Math.max(0, Number(thresholds.purchaseLeadDays) || 0);
    const categories = await q()
      .selectFrom('categories')
      .select(['id', 'name', 'parentId', 'appliesTo'])
      .execute<Row>();
    const models = new Map(
      (
        await q()
          .selectFrom('models')
          .select(['id', 'name', 'categoryId'])
          .execute<Row>()
      ).map((row) => [String(row.id), row]),
    );
    const deviceFields = [
      'id',
      'deviceNo',
      'name',
      'modelId',
      'categoryId',
      'locationId',
      'purchaseDate',
      'warrantyEndDate',
      'plannedReplacementDate',
      'notes',
    ] as const;
    // A device on an open disposal, a draft included, is on its way out
    // and no joiner's (2026-10-22: a monitor in a draft for being damaged
    // was offered).
    const disposing = new Set(
      (
        await q()
          .selectFrom('disposalDevices')
          .innerJoin('disposals', 'disposals.id', 'disposalDevices.disposalId')
          .select(['disposalDevices.deviceId as deviceId'])
          .where('disposals.status', 'in', [...OPEN_DISPOSAL_STATUSES])
          .execute<Row>()
      ).map((row) => String(row.deviceId)),
    );
    const stockDevices = (
      await q()
        .selectFrom('devices')
        .select([...deviceFields])
        .where('status', '=', 'inStock')
        .where('reservedForId', 'is', null)
        .execute<Row>()
    ).filter((row) => !disposing.has(String(row.id)));

    // People leaving, or gone and still holding something: what they hand
    // back is a joiner's from the day it is back and made ready.
    const leavers = await q()
      .selectFrom('people')
      .select(['id', 'name', 'leaveDate'])
      .where('leaveDate', 'is not', null)
      .execute<Row>();
    const leaverById = new Map(leavers.map((row) => [String(row.id), row]));
    const backOn = (leaverId: string): string => {
      const leaveDate = asText(leaverById.get(leaverId)?.leaveDate) ?? now;
      return leaveDate > now ? leaveDate.slice(0, 10) : now;
    };
    const returns: ReturnDevice[] = [];
    if (leavers.length > 0)
      for (const row of await q()
        .selectFrom('devices')
        .select([...deviceFields, 'assigneeId'])
        .where('assigneeType', '=', 'person')
        .where('assigneeId', 'in', [...leaverById.keys()])
        .where('status', 'in', ['inUse', 'onLoan'])
        .where('reservedForId', 'is', null)
        .execute<Row>()) {
        if (disposing.has(String(row.id))) continue;
        const fromId = String(row.assigneeId);
        const availableOn = addDays(backOn(fromId), prepDays);
        // Due for replacement by then, or out of warranty: not something
        // to hand a new joiner.
        const replaced = asText(row.plannedReplacementDate);
        const warranty = asText(row.warrantyEndDate);
        if (replaced && replaced.slice(0, 10) <= availableOn) continue;
        if (warranty && warranty.slice(0, 10) < availableOn) continue;
        returns.push({
          row,
          availableOn,
          fromId,
          fromName: asText(leaverById.get(fromId)?.name) ?? '',
        });
      }
    const leaverSeats: ReturnSeat[] =
      leavers.length === 0
        ? []
        : (
            await q()
              .selectFrom('entitlementSeats')
              .innerJoin(
                'entitlements',
                'entitlements.id',
                'entitlementSeats.entitlementId',
              )
              .select([
                'entitlementSeats.holderId as holderId',
                'entitlements.id as entitlementId',
                'entitlements.name as name',
                'entitlements.softwareProductId as productId',
              ])
              .where('entitlementSeats.holderType', '=', 'person')
              .where('entitlementSeats.holderId', 'in', [...leaverById.keys()])
              .where('entitlementSeats.releasedAt', 'is', null)
              .execute<Row>()
          ).map((row) => ({
            entitlementId: String(row.entitlementId),
            name: String(row.name),
            productId: String(asText(row.productId) ?? ''),
            availableOn: backOn(String(row.holderId)),
            fromId: String(row.holderId),
            fromName: asText(leaverById.get(String(row.holderId))?.name) ?? '',
            used: false,
          }));

    const stockItems = (
      await q()
        .selectFrom('stockItems')
        .select([
          'id',
          'name',
          'modelId',
          'categoryId',
          'locationId',
          'totalQuantity',
          'usedQuantity',
        ])
        .execute<Row>()
    ).map((row) => ({
      row,
      available:
        (Number(row.totalQuantity) || 0) - (Number(row.usedQuantity) || 0),
    }));

    const entitlementRows = await q()
      .selectFrom('entitlements')
      .select([
        'id',
        'name',
        'softwareProductId',
        'seatCount',
        'kind',
        'autoRenew',
        'expiryDate',
        'maintenanceExpiryDate',
        'billingModel',
      ])
      .orderBy('name', 'asc')
      .execute<Row>();
    const held = new Map(
      (
        await q()
          .selectFrom('entitlementSeats')
          .select((eb) => ['entitlementId', eb.fn.countAll().as('count')])
          .where('releasedAt', 'is', null)
          .groupBy('entitlementId')
          .execute<Row>()
      ).map((row) => [String(row.entitlementId), Number(row.count) || 0]),
    );
    const entitlements = entitlementRows
      // An ended subscription hands out nothing.
      .filter(
        (row) =>
          !(
            asText(row.kind) === 'subscription' &&
            !row.autoRenew &&
            (asText(row.expiryDate) ?? '9999') < now
          ),
      )
      .map((row) => ({
        row,
        free:
          row.seatCount === null || row.seatCount === undefined
            ? Number.POSITIVE_INFINITY
            : Number(row.seatCount) - (held.get(String(row.id)) ?? 0),
      }));

    const orderLines: OrderLine[] = (
      await q()
        .selectFrom('purchaseOrderLines')
        .innerJoin(
          'purchaseOrders',
          'purchaseOrders.id',
          'purchaseOrderLines.purchaseOrderId',
        )
        .select([
          'purchaseOrders.id as orderId',
          'purchaseOrders.orderNo as orderNo',
          'purchaseOrders.status as status',
          'purchaseOrders.reason as reason',
          'purchaseOrders.departmentId as departmentId',
          'purchaseOrders.neededBy as neededBy',
          'purchaseOrders.expectedAt as expectedAt',
          'purchaseOrderLines.modelId as modelId',
          'purchaseOrderLines.softwareProductId as productId',
          'purchaseOrderLines.quantity as quantity',
          'purchaseOrderLines.receivedQuantity as receivedQuantity',
        ])
        .where('purchaseOrders.status', 'in', OPEN_ORDER_STATUSES)
        .orderBy('purchaseOrders.expectedAt', 'asc')
        .execute<Row>()
    )
      .map((row) => ({
        orderId: String(row.orderId),
        orderNo: String(row.orderNo),
        status: String(row.status),
        newHire: asText(row.reason) === 'newHire',
        departmentId: asText(row.departmentId) ?? null,
        neededBy: asText(row.neededBy)?.slice(0, 10) ?? null,
        expectedAt: asText(row.expectedAt)?.slice(0, 10) ?? null,
        modelId: asText(row.modelId) ?? null,
        productId: asText(row.productId) ?? null,
        left: (Number(row.quantity) || 0) - (Number(row.receivedQuantity) || 0),
      }))
      .filter((line) => line.left > 0);

    return {
      today: now,
      prepDays,
      leadDays,
      categories,
      models,
      stockDevices,
      returns,
      takenDevices: new Set(),
      pins: await pinsOf(),
      stockItems,
      entitlements,
      leaverSeats,
      orderLines,
    };
  };

  /**
   * Every joiner's plan, worked out together (2026-10-06): earliest first
   * day first — the same day, whoever was entered first — each taking from
   * the pools in turn. Somebody asked for who is not a joiner still in
   * progress (equipped already, or entered long after starting) is worked
   * out in their place by the same order.
   */
  const allocate = async (
    focus?: string,
    withCandidates = false,
  ): Promise<Map<string, OnboardingPlan>> => {
    const fields = [
      'id',
      'name',
      'departmentId',
      'position',
      'locationId',
      'hireDate',
      'email',
      'onboardingWaived',
      'createdAt',
    ] as const;
    const joiners = (
      await q()
        .selectFrom('people')
        .select([...fields])
        .where((eb) =>
          eb.or([
            eb('employmentStatus', 'is', null),
            eb('employmentStatus', '!=', 'left'),
          ]),
        )
        .where('hireDate', 'is not', null)
        .where('onboardingCompletedAt', 'is', null)
        .execute<Row>()
    ).filter((row) => isJoiner(row.hireDate, row.createdAt));
    if (focus && !joiners.some((row) => String(row.id) === focus)) {
      const person = await q()
        .selectFrom('people')
        .select([...fields])
        .where('id', '=', focus)
        .executeTakeFirst<Row>();
      if (!person) return new Map();
      joiners.push(person);
    }
    joiners.sort(
      (a, b) =>
        (asText(a.hireDate) ?? '9999').localeCompare(
          asText(b.hireDate) ?? '9999',
        ) ||
        String(a.createdAt).localeCompare(String(b.createdAt)) ||
        String(a.id).localeCompare(String(b.id)),
    );
    const pools = await supplyPools();
    const plans = new Map<string, OnboardingPlan>();
    for (const person of joiners) {
      const id = String(person.id);
      plans.set(
        id,
        await planFor(person, pools, withCandidates && id === focus),
      );
    }
    return plans;
  };

  /** One joiner's plan, taking what it plans from the pools. */
  const planFor = async (
    person: Row,
    pools: Pools,
    withCandidates: boolean,
  ): Promise<OnboardingPlan> => {
    const personId = String(person.id);
    const { advice, picks: advisedPicks } = await adviceFor(personId);
    const waivedKeys = new Set(stringList(person.onboardingWaived));
    const kit = await kitFor(
      asText(person.departmentId) ?? null,
      asText(person.position) ?? null,
    );
    const locationId = asText(person.locationId) ?? null;
    const hireDate = asText(person.hireDate)?.slice(0, 10) ?? null;
    const departmentId = asText(person.departmentId) ?? null;
    // What arrives by this day is in time; once they have started, only
    // what is here today is.
    const due = hireDate && hireDate > pools.today ? hireDate : pools.today;
    const mine = (deviceId: string) => {
      const owner = pools.pins.get(deviceId);
      return !owner || owner === personId;
    };

    // What is bought for them: a 新员工配备 order for their department and
    // joining day, in any open status — a draft included, so asking again
    // does not order the same laptop twice. Listed whether or not the plan
    // draws on it.
    const ownOrders = new Map<string, PlanOrder>();
    for (const line of pools.orderLines)
      if (
        line.newHire &&
        hireDate &&
        line.departmentId === departmentId &&
        line.neededBy === hireDate
      )
        ownOrders.set(line.orderId, {
          id: line.orderId,
          orderNo: line.orderNo,
          status: line.status,
        });
    const drawnOrders = new Map<string, PlanOrder>();

    /**
     * Up to `wanted` of what open orders still have to deliver for an item:
     * first those bought for them, then any other order placed whose goods
     * are expected in time (made ready by `offset` days after arriving). An
     * order not yet placed has no date and is nobody else's to count on.
     */
    const fromOrders = (
      fits: (line: OrderLine) => boolean,
      wanted: number,
      offset: number,
      thing: (line: OrderLine) => Pick<PlanThing, 'type' | 'label'>,
    ): PlanThing[] => {
      const planned: PlanThing[] = [];
      let left = wanted;
      const take = (line: OrderLine, availableOn: string | null) => {
        const count = Math.min(line.left, left);
        line.left -= count;
        left -= count;
        drawnOrders.set(line.orderId, {
          id: line.orderId,
          orderNo: line.orderNo,
          status: line.status,
        });
        planned.push({
          ...thing(line),
          id: line.orderId,
          quantity: count,
          supply: {
            kind: 'order',
            availableOn,
            orderId: line.orderId,
            orderNo: line.orderNo,
            orderStatus: line.status,
          },
        });
      };
      for (const line of pools.orderLines) {
        if (left <= 0) break;
        if (line.left <= 0 || !fits(line) || !ownOrders.has(line.orderId))
          continue;
        take(line, line.expectedAt ? addDays(line.expectedAt, offset) : null);
      }
      for (const line of pools.orderLines) {
        if (left <= 0) break;
        if (line.left <= 0 || !fits(line) || line.newHire) continue;
        if (!PLACED_ORDER_STATUSES.has(line.status) || !line.expectedAt)
          continue;
        const availableOn = addDays(line.expectedAt, offset);
        if (availableOn > due) continue;
        take(line, availableOn);
      }
      return planned;
    };
    const plannedCount = (things: readonly PlanThing[]) =>
      things.reduce((sum, thing) => sum + (thing.quantity ?? 1), 0);
    /** The last day to order a shortfall for it to be made ready in time. */
    const orderBy = (offset: number) =>
      addDays(hireDate ?? pools.today, -(offset + pools.leadDays));

    // What they have now: devices assigned or reserved to them, stock they
    // hold, seats they hold.
    const devices = (
      await q()
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'modelId',
          'categoryId',
          'assigneeType',
          'assigneeId',
        ])
        .where((eb) =>
          eb.or([
            eb.and([
              eb('assigneeType', '=', 'person'),
              eb('assigneeId', '=', personId),
            ]),
            eb.and([
              eb('reservedForType', '=', 'person'),
              eb('reservedForId', '=', personId),
            ]),
          ]),
        )
        .execute<Row>()
    ).map((row) => ({
      row,
      state:
        asText(row.assigneeType) === 'person' &&
        asText(row.assigneeId) === personId
          ? ('assigned' as const)
          : ('reserved' as const),
    }));
    const holdings = await q()
      .selectFrom('stockHoldings')
      .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
      .select([
        'stockItems.id as id',
        'stockItems.name as name',
        'stockItems.modelId as modelId',
        'stockItems.categoryId as categoryId',
        'stockHoldings.quantity as quantity',
      ])
      .where('stockHoldings.holderType', '=', 'person')
      .where('stockHoldings.holderId', '=', personId)
      .where('stockHoldings.quantity', '>', 0)
      .execute<Row>();
    const seats = await q()
      .selectFrom('entitlementSeats')
      .innerJoin(
        'entitlements',
        'entitlements.id',
        'entitlementSeats.entitlementId',
      )
      .select([
        'entitlements.id as id',
        'entitlements.name as name',
        'entitlements.softwareProductId as softwareProductId',
      ])
      .where('entitlementSeats.holderType', '=', 'person')
      .where('entitlementSeats.holderId', '=', personId)
      .where('entitlementSeats.releasedAt', 'is', null)
      .execute<Row>();

    const usedDevices = new Set<string>();
    const usedSeats = new Set<number>();
    // Stock held counts down as items claim it: a holding of two mice covers
    // two mouse lines, not every one.
    const heldStock = holdings.map((row) => ({
      row,
      left: Number(row.quantity) || 0,
    }));

    const items = (
      kit
        ? ((decodeRow(
            (await q()
              .selectFrom('onboardingKits')
              .select(['items'])
              .where('id', '=', kit.id)
              .executeTakeFirst<Row>()) ?? {},
          ).items as unknown[] | undefined) ?? [])
        : []
    ).filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    );

    const lines: OnboardingPlanLine[] = [];
    for (const item of items) {
      const required = Math.max(1, Number(item.quantity) || 1);
      const modelId = asText(item.modelId);
      const categoryId = asText(item.categoryId);
      const productId = asText(item.softwareProductId);

      if (productId) {
        const product = await q()
          .selectFrom('softwareProducts')
          .select(['id', 'name'])
          .where('id', '=', productId)
          .executeTakeFirst<Row>();
        // A product since deleted leaves nothing to plan.
        if (!product) continue;
        const prepared: PlanThing[] = [];
        seats.forEach((seat, index) => {
          if (prepared.length >= required || usedSeats.has(index)) return;
          if (asText(seat.softwareProductId) !== productId) return;
          usedSeats.add(index);
          prepared.push({
            type: 'seat',
            id: String(seat.id),
            label: String(seat.name),
          });
        });
        const proposals: PlanThing[] = [];
        const planned: PlanThing[] = [];
        const candidates: PlanCandidate[] = [];
        const key = `softwareProduct:${productId}`;
        const picks = advisedPicks.get(key);
        const waived = waivedKeys.has(key);
        const asked = required - prepared.length;
        let missing = asked;
        if (missing > 0 && !waived) {
          const open = pools.entitlements.filter(
            (entry) =>
              asText(entry.row.softwareProductId) === productId &&
              entry.free > 0,
          );
          if (withCandidates)
            for (const { row, free } of open.slice(0, CANDIDATE_LIMIT))
              candidates.push({
                id: String(row.id),
                label: String(row.name),
                facts: {
                  kind: asText(row.kind) ?? null,
                  freeSeats: Number.isFinite(free) ? free : 'unlimited',
                  billingModel: asText(row.billingModel) ?? null,
                  autoRenew: Boolean(row.autoRenew),
                  expiryDate: asText(row.expiryDate) ?? null,
                  maintenanceExpiryDate:
                    asText(row.maintenanceExpiryDate) ?? null,
                },
              });
          const email = asText(person.email);
          for (const entry of preferred(
            open,
            (entry) => String(entry.row.id),
            picks,
          )) {
            if (missing <= 0) break;
            if (entry.free <= 0) continue;
            entry.free -= 1;
            // One person holds one seat of a product.
            proposals.push({
              type: 'seat',
              id: String(entry.row.id),
              label: String(entry.row.name),
              ...(asText(entry.row.kind) === 'subscription'
                ? { needsAccount: true, ...(email ? { account: email } : {}) }
                : {}),
              ...advised(picks, String(entry.row.id)),
            });
            missing -= 1;
          }
          // Then seats being bought, then those somebody leaving frees.
          const ordered = fromOrders(
            (line) => line.productId === productId,
            missing,
            0,
            () => ({ type: 'seat', label: String(product.name) }),
          );
          planned.push(...ordered);
          missing -= plannedCount(ordered);
          for (const seat of pools.leaverSeats) {
            if (missing <= 0) break;
            if (seat.used || seat.productId !== productId) continue;
            if (seat.availableOn > due) continue;
            seat.used = true;
            planned.push({
              type: 'seat',
              id: seat.entitlementId,
              label: seat.name,
              supply: {
                kind: 'return',
                availableOn: seat.availableOn,
                fromId: seat.fromId,
                fromName: seat.fromName,
              },
            });
            missing -= 1;
          }
        }
        const existing = pools.entitlements.find(
          (entry) => asText(entry.row.softwareProductId) === productId,
        );
        lines.push(
          finishLine({
            key,
            target: {
              type: 'softwareProduct',
              id: productId,
              name: String(product.name),
            },
            kind: 'entitlement',
            itemType: asText(existing?.row.kind) ?? null,
            required,
            prepared,
            proposals,
            planned,
            waived,
            asked,
            missing,
            orderBy: orderBy(0),
            ...(withCandidates ? { candidates } : {}),
          }),
        );
        continue;
      }

      // A model, or a category: what kind of thing it is follows its
      // category, the way a purchase line's does.
      const target = modelId
        ? pools.models.get(modelId)
        : categoryId
          ? pools.categories.find((row) => String(row.id) === categoryId)
          : undefined;
      if (!target) continue;
      const category = pools.categories.find(
        (row) =>
          String(row.id) === String(modelId ? target.categoryId : target.id),
      );
      const appliesTo = asText(category?.appliesTo) ?? '';
      const kind: KitItemKind = STOCK_KINDS.has(appliesTo) ? 'stock' : 'device';
      const categories = categoryId
        ? treeOf(pools.categories, categoryId)
        : null;
      const fits = (row: Row) =>
        modelId
          ? asText(row.modelId) === modelId
          : Boolean(categories?.has(String(asText(row.categoryId) ?? '')));
      const lineFits = (line: OrderLine) =>
        line.modelId !== null &&
        (modelId
          ? line.modelId === modelId
          : Boolean(
              categories?.has(
                String(
                  asText(pools.models.get(line.modelId)?.categoryId) ?? '',
                ),
              ),
            ));
      const orderedThing = (line: OrderLine) => ({
        type: kind === 'device' ? ('device' as const) : ('stock' as const),
        label: String(
          pools.models.get(line.modelId ?? '')?.name ?? target.name,
        ),
      });

      const key = `${modelId ? 'model' : 'category'}:${String(target.id)}`;
      const picks = advisedPicks.get(key);
      const waived = waivedKeys.has(key);
      const prepared: PlanThing[] = [];
      const proposals: PlanThing[] = [];
      const planned: PlanThing[] = [];
      const candidates: PlanCandidate[] = [];
      let missing = required;
      let asked: number;
      if (kind === 'device') {
        for (const { row, state } of devices) {
          if (missing <= 0) break;
          if (usedDevices.has(String(row.id)) || !fits(row)) continue;
          usedDevices.add(String(row.id));
          prepared.push({
            type: 'device',
            id: String(row.id),
            label: `${String(row.deviceNo)} / ${String(row.name)}`,
            state,
          });
          missing -= 1;
        }
        asked = missing;
        if (missing > 0 && !waived) {
          const free = (row: Row) =>
            fits(row) &&
            !pools.takenDevices.has(String(row.id)) &&
            mine(String(row.id));
          const nearest = (a: Row, b: Row) =>
            Number(asText(b.locationId) === locationId) -
              Number(asText(a.locationId) === locationId) ||
            (asText(b.warrantyEndDate) ?? '').localeCompare(
              asText(a.warrantyEndDate) ?? '',
            );
          // Nearest first, then the longest warranty left.
          const inStock = pools.stockDevices.filter(free).sort(nearest);
          // Back from somebody leaving in time, the soonest first.
          const back = pools.returns
            .filter((entry) => entry.availableOn <= due && free(entry.row))
            .sort(
              (a, b) =>
                a.availableOn.localeCompare(b.availableOn) ||
                nearest(a.row, b.row),
            );
          if (withCandidates) {
            candidates.push(
              ...(await deviceCandidates(
                inStock.slice(0, CANDIDATE_LIMIT),
                locationId,
              )),
            );
            const returning = await deviceCandidates(
              back.slice(0, CANDIDATE_LIMIT).map((entry) => entry.row),
              locationId,
            );
            candidates.push(
              ...returning.map((candidate, index) => ({
                ...candidate,
                facts: {
                  ...candidate.facts,
                  returnedBy: back[index]?.fromName ?? null,
                  availableOn: back[index]?.availableOn ?? null,
                },
              })),
            );
          }
          const proposeStock = (row: Row) => {
            pools.takenDevices.add(String(row.id));
            proposals.push({
              type: 'device',
              id: String(row.id),
              label: `${String(row.deviceNo)} / ${String(row.name)}`,
              ...advised(picks, String(row.id)),
            });
            missing -= 1;
          };
          const planReturn = (entry: ReturnDevice) => {
            pools.takenDevices.add(String(entry.row.id));
            planned.push({
              type: 'device',
              id: String(entry.row.id),
              label: `${String(entry.row.deviceNo)} / ${String(entry.row.name)}`,
              supply: {
                kind: 'return',
                availableOn: entry.availableOn,
                fromId: entry.fromId,
                fromName: entry.fromName,
              },
              ...advised(picks, String(entry.row.id)),
            });
            missing -= 1;
          };
          // What the rule alone would propose from stock, before any pick.
          const ruleChoice = inStock.slice(0, missing);
          // Asset Steward's picks first, from stock or from what comes back; then
          // stock; then what is being bought; then what comes back.
          for (const pick of picks?.keys() ?? []) {
            if (missing <= 0) break;
            const stocked = inStock.find((row) => String(row.id) === pick);
            if (stocked) proposeStock(stocked);
            else {
              const returning = back.find(
                (entry) => String(entry.row.id) === pick,
              );
              if (returning) planReturn(returning);
            }
          }
          for (const row of inStock) {
            if (missing <= 0) break;
            if (!pools.takenDevices.has(String(row.id))) proposeStock(row);
          }
          // Each pick the rule would not have made names the one it displaced.
          const proposedIds = new Set(proposals.map((thing) => thing.id));
          const ruleIds = new Set(ruleChoice.map((row) => String(row.id)));
          const displaced = ruleChoice.filter(
            (row) => !proposedIds.has(String(row.id)),
          );
          proposals.forEach((thing, index) => {
            if (thing.source !== 'noco' || ruleIds.has(thing.id)) return;
            const row = displaced.shift();
            if (row)
              proposals[index] = {
                ...thing,
                instead: {
                  id: String(row.id),
                  label: `${String(row.deviceNo)} / ${String(row.name)}`,
                },
              };
          });
          const ordered = fromOrders(
            lineFits,
            missing,
            pools.prepDays,
            orderedThing,
          );
          planned.push(...ordered);
          missing -= plannedCount(ordered);
          for (const entry of back) {
            if (missing <= 0) break;
            if (!pools.takenDevices.has(String(entry.row.id)))
              planReturn(entry);
          }
        }
      } else {
        for (const held of heldStock) {
          if (missing <= 0) break;
          if (held.left <= 0 || !fits(held.row)) continue;
          const take = Math.min(held.left, missing);
          held.left -= take;
          missing -= take;
          prepared.push({
            type: 'stock',
            id: String(held.row.id),
            label: String(held.row.name),
            quantity: take,
          });
        }
        asked = missing;
        if (missing > 0 && !waived) {
          const rows = pools.stockItems
            .filter((entry) => entry.available > 0 && fits(entry.row))
            .sort(
              (a, b) =>
                Number(asText(b.row.locationId) === locationId) -
                  Number(asText(a.row.locationId) === locationId) ||
                b.available - a.available,
            );
          if (withCandidates) {
            const places = await namesOf(
              'locations',
              rows.map((entry) => asText(entry.row.locationId)),
            );
            for (const { row, available } of rows.slice(0, CANDIDATE_LIMIT))
              candidates.push({
                id: String(row.id),
                label: String(row.name),
                facts: {
                  available,
                  location:
                    places.get(String(asText(row.locationId) ?? '')) ?? null,
                  sameLocationAsJoiner:
                    locationId !== null &&
                    asText(row.locationId) === locationId,
                },
              });
          }
          for (const entry of preferred(
            rows,
            (entry) => String(entry.row.id),
            picks,
          )) {
            if (missing <= 0) break;
            const take = Math.min(entry.available, missing);
            entry.available -= take;
            proposals.push({
              type: 'stock',
              id: String(entry.row.id),
              label: String(entry.row.name),
              quantity: take,
              ...advised(picks, String(entry.row.id)),
            });
            missing -= take;
          }
          const ordered = fromOrders(lineFits, missing, 0, orderedThing);
          planned.push(...ordered);
          missing -= plannedCount(ordered);
        }
      }
      lines.push(
        finishLine({
          key,
          target: {
            type: modelId ? 'model' : 'category',
            id: String(target.id),
            name: String(target.name),
          },
          kind,
          itemType: appliesTo || null,
          required,
          prepared,
          proposals,
          planned,
          waived,
          asked,
          missing,
          orderBy: orderBy(kind === 'device' ? pools.prepDays : 0),
          ...(withCandidates ? { candidates } : {}),
        }),
      );
    }

    return {
      personId,
      hireDate,
      kit,
      lines,
      // An item marked 不需要 counts on neither side: 已配备 N / M is about
      // what they are getting.
      prepared: lines.reduce(
        (sum, line) =>
          line.waived ? sum : sum + Math.min(line.preparedCount, line.required),
        0,
      ),
      required: lines.reduce(
        (sum, line) => (line.waived ? sum : sum + line.required),
        0,
      ),
      waived: lines.filter((line) => line.waived).length,
      hasDevice: devices.length > 0,
      orders: [...new Map([...ownOrders, ...drawnOrders]).values()],
      advice,
    };
  };

  const plan: OnboardingService['plan'] = async (personId, options = {}) =>
    (await allocate(personId, options.candidates === true)).get(personId) ??
    null;

  const plans: OnboardingService['plans'] = () => allocate();

  const waive: OnboardingService['waive'] = async (
    personId,
    key,
    waived,
    actorId,
  ) => {
    const current = await plan(personId);
    if (!current) return null;
    const line = current.lines.find((entry) => entry.key === key);
    if (!line)
      throw new ValidationError('No such item in their onboarding kit', 'key');
    const person = await q()
      .selectFrom('people')
      .select(['onboardingWaived'])
      .where('id', '=', personId)
      .executeTakeFirst<Row>();
    const keys = new Set(stringList(person?.onboardingWaived));
    if (waived === keys.has(key)) return current;
    if (waived) keys.add(key);
    else keys.delete(key);
    await database.transaction(async (connection) => {
      await connection.query
        .updateTable('people')
        .set({
          onboardingWaived: [...keys],
          ...(waived ? {} : { onboardingCompletedAt: null }),
          updatedAt: new Date(),
        })
        .where('id', '=', personId)
        .execute();
      await history?.record(
        {
          subjectType: 'people',
          subjectId: personId,
          type: waived ? 'onboardingWaived' : 'onboardingRestored',
          summary: `${waived ? 'Not needed' : 'Needed again'}: ${line.target.name}`,
          payload: { key, targetLabel: line.target.name },
          actorId,
        },
        connection,
      );
    });
    return plan(personId);
  };

  const kitRow = async (id: string): Promise<KitSummary | null> => {
    const row = await q()
      .selectFrom('onboardingKits')
      .select(['id', 'name', 'departmentId', 'position', 'items'])
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row
      ? {
          id: String(row.id),
          name: String(row.name),
          departmentId: String(row.departmentId),
          position: asText(row.position) ?? null,
          items: decodeRow(row).items ?? [],
        }
      : null;
  };

  const departmentKits: OnboardingService['departmentKits'] = async (
    departmentId,
  ) => {
    const department = await q()
      .selectFrom('departments')
      .select(['id', 'name', 'parentId', 'positions'])
      .where('id', '=', departmentId)
      .executeTakeFirst<Row>();
    if (!department) return null;
    const kits = await q()
      .selectFrom('onboardingKits')
      .select(['id'])
      .select(['position'])
      .where('departmentId', '=', departmentId)
      .execute<Row>();
    const defaultRow = kits.find((kit) => !asText(kit.position));
    const defaultKit = defaultRow ? await kitRow(String(defaultRow.id)) : null;
    let inherited: DepartmentKits['inherited'] = null;
    const parentId = asText(department.parentId);
    const above = parentId ? await kitFor(parentId, null) : undefined;
    if (!defaultKit && above) {
      const owner = await q()
        .selectFrom('departments')
        .select(['id', 'name'])
        .where('id', '=', above.departmentId)
        .executeTakeFirst<Row>();
      const kit = await kitRow(above.id);
      if (owner && kit)
        inherited = {
          department: { id: String(owner.id), name: String(owner.name) },
          kit,
        };
    }
    const holders = await q()
      .selectFrom('people')
      .select(['position'])
      .where('departmentId', '=', departmentId)
      .where((eb) =>
        eb.or([
          eb('employmentStatus', 'is', null),
          eb('employmentStatus', '!=', 'left'),
        ]),
      )
      .execute<Row>();
    const positions = [];
    for (const name of stringList(department.positions)) {
      const own = kits.find((kit) => same(kit.position, name));
      positions.push({
        name,
        kit: own ? await kitRow(String(own.id)) : null,
        holders: holders.filter((row) => same(row.position, name)).length,
      });
    }
    return {
      department: { id: String(department.id), name: String(department.name) },
      defaultKit,
      inherited,
      inheritable: Boolean(above),
      positions,
    };
  };

  return { kitFor, plan, plans, waive, departmentKits };
}
