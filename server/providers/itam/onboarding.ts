import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText, decodeRow, type Row } from './collection-query.js';
import { addDays, isoDate, today } from './dates.js';
import { ValidationError } from './errors.js';
import type { HistoryService } from './history.js';

/**
 * 入职配备: what a new joiner should be given, what they already have, and
 * which items in stock would make up the rest (2026-10-05).
 *
 * The kit is the rule (`onboardingKits`, by department and position); this
 * is the arithmetic on it, deterministic so that "which laptop" is a
 * computed answer rather than a guess — the page lists it and Noco presents
 * it, and neither invents a device. Among the candidates the arithmetic
 * finds, Noco may have chosen in the background with a reason
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
  /** A proposal Noco chose in the background, with the reason it gave. */
  readonly source?: 'noco';
  readonly reason?: string;
}

/**
 * Something in stock that could make up an item, with what the choice
 * between them turns on: what Noco is shown when it picks in the
 * background (`onboarding-advisor.ts`).
 */
export interface PlanCandidate {
  readonly id: string;
  readonly label: string;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
}

/** Noco's latest background run for this joiner, as the card shows it. */
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
   * Marked 不需要 for this person by their 入职负责人: nothing is proposed
   * or ordered for it, and it counts towards neither total.
   */
  readonly waived: boolean;
  /** How many stock is asked for: required less what they have. */
  readonly missing: number;
  /** Only when asked for (`candidates: true`): what stock could give. */
  readonly candidates?: readonly PlanCandidate[];
  /**
   * Already being bought for them: still to be received on an open
   * 新员工配备 order for their department and joining day.
   */
  readonly onOrder: number;
  /** What neither they, stock nor an open order covers: to be bought. */
  readonly shortfall: number;
}

/** An open 新员工配备 order raised for this joiner. */
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
  /** Open 新员工配备 orders for them, whose lines count as on order. */
  readonly orders: readonly PlanOrder[];
  /** Noco's latest background run for them, or null when none ran. */
  readonly advice: PlanAdvice | null;
}

/** The keys of the items marked 不需要, however the column came back. */
export function waivedOf(value: unknown): string[] {
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
  return hire.slice(0, 10) >= addDays(entered.slice(0, 10), -JOINER_ENTERED_WITHIN_DAYS);
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

export interface OnboardingService {
  /** The kit for a department and position, walking up the departments. */
  kitFor(
    departmentId: string | null,
    position: string | null,
  ): Promise<OnboardingKit | null>;
  plan(
    personId: string,
    options?: { readonly candidates?: boolean },
  ): Promise<OnboardingPlan | null>;
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
}

/** How many candidates an item shows Noco: enough to choose among. */
const CANDIDATE_LIMIT = 12;

/** Noco's picks for one kit item, as a run stores them. */
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
): OnboardingService {
  const q = () => database.query();

  const kitFor: OnboardingService['kitFor'] = async (departmentId, position) => {
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

  /** A category and every category below it. */
  const categoryTree = async (id: string): Promise<Set<string>> => {
    const all = await q()
      .selectFrom('categories')
      .select(['id', 'parentId'])
      .execute<Row>();
    const found = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of all)
        if (
          !found.has(String(row.id)) &&
          found.has(String(asText(row.parentId) ?? ''))
        ) {
          found.add(String(row.id));
          grew = true;
        }
    }
    return found;
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
   * A device in stock as Noco sees it: where it is, how old, how long its
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
   * The devices Noco picked for other joiners, by each one's latest finished
   * run. Two joiners of the same department want the same laptop, and
   * without this the plan offered both of them the one Noco had just chosen
   * for the first — the second 入职负责人 to press 预留 would take it from
   * under the first. A pick is held back only while it is still a pick:
   * once reserved it leaves stock anyway, and a newer run replaces it.
   */
  const heldForOthers = async (personId: string): Promise<Set<string>> => {
    const runs = await q()
      .selectFrom('onboardingRuns')
      .select(['personId', 'suggestions', 'createdAt'])
      .where('status', '=', 'ready')
      .where('personId', '!=', personId)
      .orderBy('createdAt', 'desc')
      .execute<Row>();
    const seen = new Set<string>();
    const held = new Set<string>();
    for (const run of runs) {
      if (seen.has(String(run.personId))) continue;
      seen.add(String(run.personId));
      const stored = decodeRow(run).suggestions;
      for (const line of Array.isArray(stored) ? (stored as AdvisedLine[]) : [])
        // Only a device is one thing for one person; a stock record or an
        // entitlement has room for several.
        if (!String(line.line).startsWith('softwareProduct:'))
          for (const pick of line.picks ?? []) held.add(String(pick.id));
    }
    return held;
  };

  /** Noco's latest run for a person, and the picks of its latest ready one. */
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
   * Noco's picks first, in its order, then the rule's: a pick still free
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

  /** The reason Noco gave for a thing, marking it as Noco's. */
  const advised = (
    picks: ReadonlyMap<string, string> | undefined,
    id: string,
  ): Pick<PlanThing, 'source' | 'reason'> =>
    picks?.has(id) ? { source: 'noco', reason: picks.get(id) } : {};

  const plan: OnboardingService['plan'] = async (personId, options = {}) => {
    const person = await q()
      .selectFrom('people')
      .select([
        'id',
        'departmentId',
        'position',
        'locationId',
        'hireDate',
        'email',
        'onboardingWaived',
      ])
      .where('id', '=', personId)
      .executeTakeFirst<Row>();
    if (!person) return null;
    const { advice, picks: advisedPicks } = await adviceFor(personId);
    const waivedKeys = new Set(waivedOf(person.onboardingWaived));
    const held = await heldForOthers(personId);
    const withCandidates = options.candidates === true;
    const kit = await kitFor(
      asText(person.departmentId) ?? null,
      asText(person.position) ?? null,
    );
    const locationId = asText(person.locationId) ?? null;

    // What is already being bought for them: the open 新员工配备 orders for
    // their department needed by their joining day, and what of each line
    // has not arrived yet. Counted against the shortfall, so asking again
    // does not order the same laptop twice.
    const hireDate = asText(person.hireDate);
    const departmentId = asText(person.departmentId);
    const orders =
      hireDate && departmentId
        ? await q()
            .selectFrom('purchaseOrders')
            .select(['id', 'orderNo', 'status'])
            .where('reason', '=', 'newHire')
            .where('departmentId', '=', departmentId)
            .where('neededBy', '=', hireDate)
            .where('status', 'in', OPEN_ORDER_STATUSES)
            .execute<Row>()
        : [];
    const onOrder = new Map<string, number>();
    if (orders.length > 0)
      for (const line of await q()
        .selectFrom('purchaseOrderLines')
        .select(['modelId', 'softwareProductId', 'quantity', 'receivedQuantity'])
        .where(
          'purchaseOrderId',
          'in',
          orders.map((order) => String(order.id)),
        )
        .execute<Row>()) {
        const key = asText(line.modelId)
          ? `model:${String(line.modelId)}`
          : `product:${String(asText(line.softwareProductId) ?? '')}`;
        const left =
          (Number(line.quantity) || 0) - (Number(line.receivedQuantity) || 0);
        if (left > 0) onOrder.set(key, (onOrder.get(key) ?? 0) + left);
      }
    /** Takes up to `wanted` of what is on order under `key`. */
    const takeOnOrder = (key: string, wanted: number): number => {
      const have = onOrder.get(key) ?? 0;
      const take = Math.min(have, Math.max(0, wanted));
      onOrder.set(key, have - take);
      return take;
    };

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
    const proposedDevices = new Set<string>();
    const proposedStock = new Map<string, number>();

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
        const candidates: PlanCandidate[] = [];
        const key = `softwareProduct:${productId}`;
        const picks = advisedPicks.get(key);
        const waived = waivedKeys.has(key);
        const asked = required - prepared.length;
        let missing = asked;
        if (missing > 0 && !waived) {
          const entitlements = await q()
            .selectFrom('entitlements')
            .select([
              'id',
              'name',
              'seatCount',
              'kind',
              'autoRenew',
              'expiryDate',
              'maintenanceExpiryDate',
              'billingModel',
            ])
            .where('softwareProductId', '=', productId)
            .orderBy('name', 'asc')
            .execute<Row>();
          const now = today();
          const open: { row: Row; free: number }[] = [];
          for (const entitlement of entitlements) {
            // An ended subscription hands out nothing.
            if (
              asText(entitlement.kind) === 'subscription' &&
              !entitlement.autoRenew &&
              (asText(entitlement.expiryDate) ?? '9999') < now
            )
              continue;
            const held = await q()
              .selectFrom('entitlementSeats')
              .select((eb) => [eb.fn.countAll().as('count')])
              .where('entitlementId', '=', String(entitlement.id))
              .where('releasedAt', 'is', null)
              .executeTakeFirst<Row>();
            const free =
              entitlement.seatCount === null ||
              entitlement.seatCount === undefined
                ? Number.POSITIVE_INFINITY
                : Number(entitlement.seatCount) - Number(held?.count ?? 0);
            if (free > 0) open.push({ row: entitlement, free });
          }
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
          for (const { row } of preferred(
            open,
            (entry) => String(entry.row.id),
            picks,
          )) {
            if (missing <= 0) break;
            // One person holds one seat of a product.
            proposals.push({
              type: 'seat',
              id: String(row.id),
              label: String(row.name),
              ...(asText(row.kind) === 'subscription'
                ? { needsAccount: true, ...(email ? { account: email } : {}) }
                : {}),
              ...advised(picks, String(row.id)),
            });
            missing -= 1;
          }
        }
        const existing = await q()
          .selectFrom('entitlements')
          .select(['kind'])
          .where('softwareProductId', '=', productId)
          .executeTakeFirst<Row>();
        lines.push({
          key,
          target: {
            type: 'softwareProduct',
            id: productId,
            name: String(product.name),
          },
          kind: 'entitlement',
          itemType: asText(existing?.kind) ?? null,
          required,
          prepared,
          preparedCount: prepared.length,
          proposals,
          waived,
          missing: waived ? 0 : Math.max(0, asked),
          ...(withCandidates ? { candidates } : {}),
          ...(() => {
            const ordered = waived
              ? 0
              : takeOnOrder(`product:${productId}`, missing);
            return {
              onOrder: ordered,
              shortfall: waived ? 0 : Math.max(0, missing - ordered),
            };
          })(),
        });
        continue;
      }

      // A model, or a category: what kind of thing it is follows its
      // category, the way a purchase line's does.
      const target = modelId
        ? await q()
            .selectFrom('models')
            .select(['id', 'name', 'categoryId'])
            .where('id', '=', modelId)
            .executeTakeFirst<Row>()
        : categoryId
          ? await q()
              .selectFrom('categories')
              .select(['id', 'name'])
              .where('id', '=', categoryId)
              .executeTakeFirst<Row>()
          : undefined;
      if (!target) continue;
      const category = await q()
        .selectFrom('categories')
        .select(['appliesTo'])
        .where('id', '=', String(modelId ? target.categoryId : target.id))
        .executeTakeFirst<Row>();
      const appliesTo = asText(category?.appliesTo) ?? '';
      const kind: KitItemKind = STOCK_KINDS.has(appliesTo) ? 'stock' : 'device';
      const categories = categoryId ? await categoryTree(categoryId) : null;
      const fits = (row: Row) =>
        modelId
          ? asText(row.modelId) === modelId
          : Boolean(categories?.has(String(asText(row.categoryId) ?? '')));

      const key = `${modelId ? 'model' : 'category'}:${String(target.id)}`;
      const picks = advisedPicks.get(key);
      const waived = waivedKeys.has(key);
      const prepared: PlanThing[] = [];
      const proposals: PlanThing[] = [];
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
          let query = q()
            .selectFrom('devices')
            .select([
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
            ])
            .where('status', '=', 'inStock')
            .where('reservedForId', 'is', null);
          query = modelId
            ? query.where('modelId', '=', modelId)
            : query.where('categoryId', 'in', [...(categories ?? [])]);
          const rows = (await query.execute<Row>())
            .filter(
              (row) =>
                !proposedDevices.has(String(row.id)) &&
                !held.has(String(row.id)),
            )
            // Nearest first, then the longest warranty left.
            .sort(
              (a, b) =>
                Number(asText(b.locationId) === locationId) -
                  Number(asText(a.locationId) === locationId) ||
                (asText(b.warrantyEndDate) ?? '').localeCompare(
                  asText(a.warrantyEndDate) ?? '',
                ),
            );
          if (withCandidates)
            candidates.push(
              ...(await deviceCandidates(
                rows.slice(0, CANDIDATE_LIMIT),
                locationId,
              )),
            );
          for (const row of preferred(rows, (row) => String(row.id), picks)) {
            if (missing <= 0) break;
            proposedDevices.add(String(row.id));
            proposals.push({
              type: 'device',
              id: String(row.id),
              label: `${String(row.deviceNo)} / ${String(row.name)}`,
              ...advised(picks, String(row.id)),
            });
            missing -= 1;
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
          let query = q()
            .selectFrom('stockItems')
            .select([
              'id',
              'name',
              'modelId',
              'categoryId',
              'locationId',
              'totalQuantity',
              'usedQuantity',
            ]);
          query = modelId
            ? query.where('modelId', '=', modelId)
            : query.where('categoryId', 'in', [...(categories ?? [])]);
          const rows = (await query.execute<Row>())
            .map((row) => ({
              row,
              available:
                (Number(row.totalQuantity) || 0) -
                (Number(row.usedQuantity) || 0) -
                (proposedStock.get(String(row.id)) ?? 0),
            }))
            .filter((entry) => entry.available > 0)
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
          for (const { row, available } of preferred(
            rows,
            (entry) => String(entry.row.id),
            picks,
          )) {
            if (missing <= 0) break;
            const take = Math.min(available, missing);
            proposedStock.set(
              String(row.id),
              (proposedStock.get(String(row.id)) ?? 0) + take,
            );
            proposals.push({
              type: 'stock',
              id: String(row.id),
              label: String(row.name),
              quantity: take,
              ...advised(picks, String(row.id)),
            });
            missing -= take;
          }
        }
      }
      const preparedCount = prepared.reduce(
        (sum, thing) => sum + (thing.quantity ?? 1),
        0,
      );
      lines.push({
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
        preparedCount,
        proposals,
        waived,
        missing: waived ? 0 : Math.max(0, asked),
        ...(withCandidates ? { candidates } : {}),
        // Only a model can be on an order line; a category item is bought
        // as some model, which a person picks.
        ...(() => {
          const ordered =
            modelId && !waived ? takeOnOrder(`model:${modelId}`, missing) : 0;
          return {
            onOrder: ordered,
            shortfall: waived ? 0 : Math.max(0, missing - ordered),
          };
        })(),
      });
    }

    return {
      personId,
      hireDate: asText(person.hireDate) ?? null,
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
      orders: orders.map((order) => ({
        id: String(order.id),
        orderNo: String(order.orderNo),
        status: String(order.status),
      })),
      advice,
    };
  };

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
    const keys = new Set(waivedOf(person?.onboardingWaived));
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

  return { kitFor, plan, waive };
}
