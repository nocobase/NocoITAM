import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  assertInputFields,
  compileAuthzScope,
  outputFields,
  pickFields,
  unrestricted,
} from './authz-filter.js';
import {
  asText,
  countCollection,
  decodeRow,
  listCollection,
  type ExtraWhere,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { ENTITLEMENTS_COLLECTION } from './collections.js';
import {
  BusinessRuleError,
  DeleteBlockedError,
  RecordNotFoundError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { OperationContext } from './devices.js';
import type { SettingsService } from './settings.js';
import { addDays, isoDate, today } from './dates.js';

/**
 * Software entitlements (授权): what was bought for a software product. One
 * table carries both kinds — `perpetual` (bought once; seats to people or
 * devices) and `subscription` (paid per cycle; seats are accounts; the
 * renewal decision). Compliance is recomputed after
 * every seat change for both kinds: over-allocated when seats exceed the
 * entitlement, idle when the free share exceeds the configured ratio. A subscription's
 * annualised cost follows its billing cycle.
 */
export const ENTITLEMENT_KINDS = ['perpetual', 'subscription'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];
export const LICENSING_MODELS = [
  'perUser',
  'perDevice',
  'site',
  'free',
] as const;
/**
 * How a subscription's price reads: per seat per cycle, or one amount per
 * cycle for the whole subscription (a bundle, a usage estimate). There is no
 * second cost field to override it.
 */
export const BILLING_MODELS = ['perSeat', 'flat'] as const;
export const BILLING_CYCLES = ['month', 'quarter', 'year'] as const;
export const SEAT_HOLDER_TYPES = ['person', 'device'] as const;
export type SeatHolderType = (typeof SEAT_HOLDER_TYPES)[number];

/**
 * One seat to assign. Perpetual entitlements need the holder (a person or
 * device, by the licensing model); subscriptions need the account and may
 * name the person behind it.
 */
export interface SeatInput {
  readonly holderType?: SeatHolderType;
  readonly holderId?: string | null;
  readonly account?: string | null;
  /** A perpetual seat's own key, where the licence issues one per copy. */
  readonly productKey?: string | null;
}

export interface EntitlementStats {
  readonly total: number;
  readonly perpetual: number;
  readonly subscription: number;
  readonly overAllocated: number;
  readonly overAllocatedSeats: number;
  readonly idle: number;
  readonly idleSeats: number;
  readonly expiring: number;
  /** What was paid for entitlements received this year (receipts × unit price). */
  readonly spendThisYear: number | null;
  /** Annualised cost of subscriptions that have not expired. */
  readonly annualSpend: number | null;
}

export interface EntitlementService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  stats(conditions: DatabaseAuthorizationConditions): Promise<EntitlementStats>;
  create(
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Creates inside a caller-owned transaction (receiving). */
  createWithin(
    connection: DatabaseConnection,
    input: Row,
    context: OperationContext,
  ): Promise<Row>;
  /**
   * Receives a further batch into an existing entitlement inside the
   * caller's transaction: seats are added when they are counted, and a
   * subscription's expiry moves to the new period when one is given.
   */
  receiveWithin(
    connection: DatabaseConnection,
    id: string,
    input: { readonly quantity: number; readonly expiryDate?: string | null },
    context: OperationContext,
  ): Promise<Row>;
  /** The purchase orders the entitlement came in through, newest receipt first. */
  purchases(id: string): Promise<readonly Row[]>;
  /**
   * Adds or removes seats outside a purchase, the way a stock item takes
   * manual stock in: the count is not an editable field, so a change to it
   * states how many and why. A negative quantity removes seats.
   */
  adjustSeats(
    id: string,
    input: { readonly quantity: number; readonly notes?: string | null },
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  update(
    id: string,
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  deleteImpact(id: string): Promise<DeleteImpact>;
  delete(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<void>;
  assignSeats(
    id: string,
    seats: readonly SeatInput[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  reclaimSeats(
    id: string,
    seatIds: readonly string[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Reclaims inside a caller-owned transaction (a disposal). */
  reclaimSeatsWithin(
    connection: DatabaseConnection,
    id: string,
    seatIds: readonly string[],
    context: OperationContext,
  ): Promise<Row>;
  seats(id: string): Promise<readonly Row[]>;
  /** Active seats held by one person or device across entitlements. */
  seatsOf(
    holderType: SeatHolderType,
    holderId: string,
  ): Promise<readonly Row[]>;
  /** Reveals the shared key, or one seat's own; the read is audited. */
  revealKey(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    seatId?: string,
  ): Promise<string | null>;
  /** Sets or clears one seat's own key. */
  setSeatKey(
    id: string,
    seatId: string,
    productKey: string | null,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  recomputeCompliance(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<string>;
  /**
   * Rolls every auto-renewing subscription whose renewal date has passed
   * forward by whole billing cycles to its next renewal date.
   */
  advanceRenewals(today: Date): Promise<number>;
}

export const entitlementServiceToken: ServiceToken<EntitlementService> =
  createServiceToken<EntitlementService>('itam/entitlement-service');

const LIFECYCLE_FIELDS = new Set([
  'kind',
  'assignedCount',
  'complianceStatus',
  'annualCost',
]);
const CYCLES_PER_YEAR: Readonly<Record<string, number>> = {
  month: 12,
  quarter: 4,
  year: 1,
};

/**
 * `date` (YYYY-MM-DD) moved on by whole billing cycles until it is on or
 * after `today`: where an auto-renewing subscription renews next. A day
 * past the target month's end clamps to its last day, as billing does.
 */
export function nextRenewalDate(
  date: string,
  cycle: string,
  today: string,
): string {
  const months = cycle === 'month' ? 1 : cycle === 'quarter' ? 3 : 12;
  const [year, month, day] = date.slice(0, 10).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let step = 0;
  let next = date.slice(0, 10);
  while (next < today) {
    step += months;
    const target = month - 1 + step;
    const last = new Date(Date.UTC(year, target + 1, 0)).getUTCDate();
    next = new Date(Date.UTC(year, target, Math.min(day, last)))
      .toISOString()
      .slice(0, 10);
  }
  return next;
}

export function annualCost(input: {
  billingModel: unknown;
  billingCycle: unknown;
  unitPrice: unknown;
  seatCount: unknown;
}): number | null {
  if (input.unitPrice === null || input.unitPrice === undefined) return null;
  const perYear = CYCLES_PER_YEAR[String(input.billingCycle)] ?? 1;
  // A flat price is already the whole cycle; a seat price counts every
  // seat bought, held or not.
  const units =
    input.billingModel === 'perSeat' ? Number(input.seatCount ?? 0) : 1;
  const cycle = Number(input.unitPrice) * units;
  if (!Number.isFinite(cycle)) return null;
  return Math.round(cycle * perYear * 100) / 100;
}

/**
 * Whether the entitlement must state a seat count: every perpetual one but
 * site and free licences, and subscriptions billed per seat. A flat-priced
 * subscription may state one as its cap.
 */
export function seatsRequired(record: Row): boolean {
  return record.kind === 'perpetual'
    ? record.licensingModel !== 'site' && record.licensingModel !== 'free'
    : record.billingModel === 'perSeat';
}

/**
 * Whether the entitlement counts no seats: site and free perpetual licences
 * always, a flat-priced subscription when it states no cap.
 */
export function seatsUnlimited(record: Row): boolean {
  if (record.kind === 'perpetual') return !seatsRequired(record);
  return (
    !seatsRequired(record) &&
    (record.seatCount === null ||
      record.seatCount === undefined ||
      record.seatCount === '')
  );
}

/** The holder a perpetual entitlement's seats go to, by licensing model. */
export function defaultHolderType(record: Row): SeatHolderType {
  return record.kind === 'perpetual' && record.licensingModel === 'perDevice'
    ? 'device'
    : 'person';
}

export function createEntitlementService(
  database: DatabaseManager,
  history: HistoryService,
  settings: SettingsService,
  /** Where a key read is recorded; the change log holds changes, not reads. */
  auditRead: (entry: {
    readonly entitlementId: string;
    readonly seatId?: string;
    readonly actorId: string;
  }) => void = () => {},
): EntitlementService {
  const definition = ENTITLEMENTS_COLLECTION;

  const load = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('entitlements')
      .selectAll()
      .where('id', '=', id)
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError('entitlements', id);
    return decodeRow(row);
  };

  const findRaw = async (
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('entitlements')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row ? decodeRow(row) : undefined;
  };

  /**
   * A seat's own key reads as a mask, like the entitlement's shared one:
   * `hasProductKey` says whether there is one to reveal.
   */
  const maskSeatKey = (row: Row): Row => ({
    ...row,
    productKey: row.productKey ? '••••••••' : null,
    hasProductKey: Boolean(row.productKey),
  });

  /** Never returns the product key unless the caller's read grant lists it. */
  const shape = (
    row: Row,
    conditions: DatabaseAuthorizationConditions,
  ): Row => {
    const fields = outputFields(definition.fields, conditions);
    const picked = pickFields(row, fields) as Record<string, unknown>;
    if ('productKey' in picked)
      picked.productKey = picked.productKey ? '••••••••' : null;
    picked.hasProductKey = Boolean(row.productKey);
    return picked;
  };

  const recompute = async (
    id: string,
    connection: DatabaseConnection,
  ): Promise<string> => {
    const record = await findRaw(id, connection);
    if (!record) throw new RecordNotFoundError('entitlements', id);
    const assigned = await connection.query
      .selectFrom('entitlementSeats')
      .select((eb) => [eb.fn.countAll().as('total')])
      .where('entitlementId', '=', id)
      .where('releasedAt', 'is', null)
      .executeTakeFirst<{ total: number | string }>();
    const assignedCount = Number(assigned?.total ?? 0);
    const seatCount =
      record.seatCount === null || record.seatCount === undefined
        ? null
        : Number(record.seatCount);
    const ratio = (await settings.get('thresholds', connection)).idleSeatRatio;
    let status = 'compliant';
    if (seatCount !== null) {
      if (assignedCount > seatCount) status = 'overAllocated';
      else if (seatCount > 0 && (seatCount - assignedCount) / seatCount > ratio)
        status = 'idle';
    }
    await connection.query
      .updateTable('entitlements')
      .set({
        assignedCount,
        complianceStatus: status,
        annualCost:
          record.kind === 'subscription' ? annualCost(record as never) : null,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return status;
  };

  // With `within`, runs inside the caller's transaction (a disposal
  // reclaiming seats) instead of opening its own.
  const mutate = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    fn: (connection: DatabaseConnection, record: Row) => Promise<void>,
    within?: DatabaseConnection,
  ): Promise<Row> => {
    const run = async (connection: DatabaseConnection) => {
      const record = await load(id, conditions, connection);
      await fn(connection, record);
      await recompute(id, connection);
    };
    if (within) await run(within);
    else await database.transaction(run);
    return shape((await findRaw(id, within)) ?? {}, conditions);
  };

  const holderLabel = async (
    connection: DatabaseConnection,
    holderType: SeatHolderType,
    holderId: string,
    field = 'holderId',
  ): Promise<string> => {
    const table = holderType === 'person' ? 'people' : 'devices';
    const target = await connection.query
      .selectFrom(table)
      .selectAll()
      .where('id', '=', holderId)
      .executeTakeFirst<Row>();
    if (!target) throw new ValidationError(`${holderType} not found`, field);
    if (holderType === 'person' && target.employmentStatus === 'left')
      throw new BusinessRuleError(
        'Cannot assign a seat to a person who has left',
        'PERSON_LEFT',
      );
    return holderType === 'device'
      ? `${String(target.deviceNo)} ${String(target.name)}`
      : String(target.name);
  };

  const validateKind = (input: Row) => {
    const kind = input.kind;
    if (!(ENTITLEMENT_KINDS as readonly unknown[]).includes(kind))
      throw new ValidationError('kind is required', 'kind');
    if (kind === 'perpetual') {
      if (!input.licensingModel)
        throw new ValidationError(
          'Perpetual entitlements need a licensing model',
          'licensingModel',
        );
      if (
        seatsRequired(input) &&
        (input.seatCount === null || input.seatCount === undefined)
      )
        throw new ValidationError(
          'Perpetual entitlements need a seat count',
          'seatCount',
        );
    } else {
      if (!input.billingModel)
        throw new ValidationError(
          'Subscriptions need a billing model',
          'billingModel',
        );
      if (!input.billingCycle)
        throw new ValidationError(
          'Subscriptions need a billing cycle',
          'billingCycle',
        );
      if (!input.expiryDate)
        throw new ValidationError(
          'Subscriptions need an expiry date',
          'expiryDate',
        );
      if (
        seatsRequired(input) &&
        (input.seatCount === null || input.seatCount === undefined)
      )
        throw new ValidationError(
          'Per-seat subscriptions need a seat count',
          'seatCount',
        );
    }
  };

  /**
   * Category and manufacturer follow the software product, the way a
   * device's follow its model; whatever the caller sent for them is
   * replaced.
   */
  const fromProduct = async (
    connection: DatabaseConnection,
    softwareProductId: unknown,
  ): Promise<Row> => {
    const product = await connection.query
      .selectFrom('softwareProducts')
      .select(['categoryId', 'manufacturerId'])
      .where('id', '=', String(softwareProductId))
      .executeTakeFirst<{
        categoryId: string | null;
        manufacturerId: string | null;
      }>();
    if (!product)
      throw new ValidationError(
        'Software product not found',
        'softwareProductId',
      );
    return {
      categoryId: product.categoryId ?? null,
      manufacturerId: product.manufacturerId ?? null,
    };
  };

  const insertRecord = async (
    connection: DatabaseConnection,
    raw: Row,
    context: OperationContext,
  ): Promise<string> => {
    const id = crypto.randomUUID();
    validateKind(raw);
    const input = {
      ...raw,
      ...(await fromProduct(connection, raw.softwareProductId)),
    };
    const perpetual = input.kind === 'perpetual';
    const now = new Date();
    const values = {
      ...input,
      id,
      seatCount: seatsUnlimited(input) ? null : Number(input.seatCount),
      assignedCount: 0,
      complianceStatus: 'compliant',
      reassignable: input.reassignable ?? true,
      // A subscription renews unless told otherwise, as SaaS does; a
      // perpetual licence has nothing to renew.
      autoRenew: perpetual ? false : (input.autoRenew ?? true),
      // A perpetual entitlement never expires; only its maintenance does.
      expiryDate: perpetual ? null : input.expiryDate,
      maintenanceExpiryDate: perpetual
        ? (input.maintenanceExpiryDate ?? null)
        : null,
      // Money lives on subscriptions (one price, per seat or per cycle).
      currency: perpetual
        ? null
        : (input.currency ??
          (await settings.get('general', connection)).currency),
      ownerId: input.ownerId ?? context.actorId,
      createdById: context.actorId,
      createdAt: now,
      updatedAt: now,
    };
    await connection.query
      .insertInto('entitlements')
      .values({
        ...values,
        annualCost: perpetual ? null : annualCost(values as never),
      })
      .execute();
    // One creation line that says how many seats it starts with (or that
    // it counts none), as a disposal's says how many devices it lists.
    await history.record(
      {
        subjectType: 'entitlements',
        subjectId: id,
        type: 'created',
        summary:
          values.seatCount === null
            ? 'Created with unlimited seats'
            : `Created with ${String(values.seatCount)} seat(s)`,
        payload: { seatCount: values.seatCount },
        ...context,
      },
      connection,
    );
    await recompute(id, connection);
    return id;
  };

  const reclaimOp = (
    id: string,
    seatIds: readonly string[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    within?: DatabaseConnection,
  ): Promise<Row> =>
    mutate(
      id,
      conditions,
      async (connection, record) => {
        for (const seatId of seatIds) {
          const seat = await connection.query
            .selectFrom('entitlementSeats')
            .selectAll()
            .where('id', '=', seatId)
            .where('entitlementId', '=', id)
            .where('releasedAt', 'is', null)
            .executeTakeFirst<Row>();
          if (!seat) throw new RecordNotFoundError('entitlementSeats', seatId);
          await connection.query
            .updateTable('entitlementSeats')
            .set({ releasedAt: new Date() })
            .where('id', '=', seatId)
            .execute();
          const holderId =
            typeof seat.holderId === 'string' ? seat.holderId : null;
          const label = holderId
            ? await holderLabel(
                connection,
                seat.holderType as SeatHolderType,
                holderId,
              ).catch(() => holderId)
            : (asText(seat.account) ?? '');
          await history.record(
            {
              subjectType: 'entitlements',
              subjectId: id,
              type: 'seatReclaim',
              summary: `Seat reclaimed from ${label}`,
              payload: {
                holderType: seat.holderType,
                holderId,
                account: seat.account ?? null,
                targetLabel: label,
              },
              ...context,
            },
            connection,
          );
          if (holderId)
            await history.record(
              {
                subjectType:
                  seat.holderType === 'person' ? 'people' : 'devices',
                subjectId: holderId,
                type: 'seatReclaim',
                summary: String(record.name),
                payload: {
                  entitlementId: id,
                  targetLabel: String(record.name),
                },
                ...context,
              },
              connection,
            );
        }
      },
      within,
    );

  /**
   * Seats left to hand out, reported the way stock reports its available
   * quantity: computed after shaping, so it is not a stored field and no
   * field grant can hide half of the arithmetic. Unlimited seats leave it
   * empty rather than pretending to a number.
   */
  const withAvailable = (row: Row): Row =>
    row.seatCount === null || row.seatCount === undefined
      ? row
      : {
          ...row,
          availableSeats:
            Number(row.seatCount) - Number(row.assignedCount ?? 0),
        };

  return {
    async list(options, conditions) {
      const { view, ...rest } = options.filter ?? {};
      const named = await viewWhere(
        typeof view === 'string' ? view : undefined,
        settings,
      );
      return listCollection(
        database,
        definition,
        { ...options, filter: { ...rest, ...named.filter } },
        conditions,
        {},
        named.extra,
      ).then((result) => ({
        ...result,
        data: result.data.map((row) => withAvailable(shape(row, conditions))),
      }));
    },

    async get(id, conditions) {
      const row = await database
        .query()
        .selectFrom('entitlements')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      return row ? withAvailable(shape(decodeRow(row), conditions)) : undefined;
    },

    async stats(conditions) {
      const count = (filter: ListOptions['filter'], extra?: ExtraWhere) =>
        countCollection(database, definition, filter, conditions, extra);
      const view = async (name: string) => {
        const named = await viewWhere(name, settings);
        return count(named.filter, named.extra);
      };
      const year = new Date().getUTCFullYear();
      const day = today();
      const [total, perpetual, subscription, overAllocated, idle, expiring] =
        await Promise.all([
          count({}),
          count({ kind: 'perpetual' }),
          count({ kind: 'subscription' }),
          view('overAllocated'),
          view('idle'),
          view('expiring'),
        ]);
      const seatSums = async (status: string) =>
        database
          .query()
          .selectFrom('entitlements')
          .select((eb) => [
            eb.fn.sum('assignedCount').as('assigned'),
            eb.fn.sum('seatCount').as('seats'),
          ])
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .where('complianceStatus', '=', status)
          .executeTakeFirst<{
            assigned: number | string | null;
            seats: number | string | null;
          }>();
      const [overSums, idleSums] = await Promise.all([
        seatSums('overAllocated'),
        seatSums('idle'),
      ]);
      const canSee = (field: string) =>
        (conditions.fieldAccess?.output ?? '*') === '*' ||
        (conditions.fieldAccess?.output ?? '*').includes(field);
      const sum = async (field: 'annualCost', extra: ExtraWhere) =>
        Number(
          (
            await extra(
              database
                .query()
                .selectFrom('entitlements')
                .select((eb) => [eb.fn.sum(field).as('total')])
                .where((eb) => compileAuthzScope(eb, conditions.scope)),
            ).executeTakeFirst<{ total: number | string | null }>()
          )?.total ?? 0,
        );
      return {
        total,
        perpetual,
        subscription,
        overAllocated,
        overAllocatedSeats: Math.max(
          0,
          Number(overSums?.assigned ?? 0) - Number(overSums?.seats ?? 0),
        ),
        idle,
        idleSeats: Math.max(
          0,
          Number(idleSums?.seats ?? 0) - Number(idleSums?.assigned ?? 0),
        ),
        expiring,
        spendThisYear: canSee('unitPrice')
          ? await receivedSpend(database, new Date(`${year}-01-01T00:00:00Z`))
          : null,
        annualSpend: canSee('annualCost')
          ? await sum('annualCost', (query) =>
              query
                .where('kind', '=', 'subscription')
                .where('expiryDate', '>=', day),
            )
          : null,
      };
    },

    async createWithin(connection, input, context) {
      const id = await insertRecord(connection, input, context);
      return (await findRaw(id, connection)) ?? {};
    },

    receiveWithin: (connection, id, input, context) =>
      mutate(
        id,
        unrestricted('entitlements', 'update'),
        async (tx, record) => {
          if (input.quantity <= 0)
            throw new ValidationError('quantity must be positive', 'quantity');
          const counted = !seatsUnlimited(record);
          const seatCount = counted
            ? Number(record.seatCount ?? 0) + input.quantity
            : null;
          const expiryDate =
            record.kind === 'subscription' && input.expiryDate
              ? input.expiryDate
              : undefined;
          await tx.query
            .updateTable('entitlements')
            .set({
              ...(counted ? { seatCount } : {}),
              // Paying for the next term through an order is a renewal, as
              // the 续订 operation is.
              // Paying for the next term moves the renewal date.
              ...(expiryDate ? { expiryDate } : {}),
              updatedAt: new Date(),
            })
            .where('id', '=', id)
            .execute();
          await history.record(
            {
              subjectType: 'entitlements',
              subjectId: id,
              type: 'seatsAdded',
              summary: `Seats added: ${input.quantity}`,
              payload: {
                quantity: input.quantity,
                seatCount,
                ...(expiryDate ? { expiryDate } : {}),
              },
              ...context,
            },
            tx,
          );
        },
        connection,
      ),

    async purchases(id) {
      return database
        .query()
        .selectFrom('purchaseReceipts')
        .innerJoin(
          'purchaseOrders',
          'purchaseOrders.id',
          'purchaseReceipts.purchaseOrderId',
        )
        .innerJoin(
          'purchaseOrderLines',
          'purchaseOrderLines.id',
          'purchaseReceipts.lineId',
        )
        .select([
          'purchaseReceipts.id as id',
          'purchaseReceipts.quantity as quantity',
          'purchaseReceipts.createdAt as receivedAt',
          'purchaseOrders.id as purchaseOrderId',
          'purchaseOrders.orderNo as orderNo',
          'purchaseOrders.reason as reason',
          'purchaseOrders.status as status',
          'purchaseOrders.vendorId as vendorId',
          'purchaseOrders.orderedAt as orderedAt',
          'purchaseOrders.currency as currency',
          'purchaseOrderLines.unitPrice as unitPrice',
        ])
        .where('purchaseReceipts.generatedType', '=', 'entitlement')
        .where('purchaseReceipts.generatedId', '=', id)
        .orderBy('purchaseReceipts.createdAt', 'desc')
        .execute<Row>()
        .then((rows) => rows.map((row) => decodeRow(row)));
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      const id = await database.transaction((connection) =>
        insertRecord(connection, input, context),
      );
      return shape((await findRaw(id)) ?? {}, conditions);
    },

    async update(id, raw, context, conditions) {
      const blocked = Object.keys(raw).filter((field) =>
        LIFECYCLE_FIELDS.has(field),
      );
      if (blocked.length > 0)
        throw new ValidationError(
          `Fields change only through operations: ${blocked.join(', ')}`,
          blocked[0],
        );
      assertInputFields(raw, conditions.fieldAccess?.input ?? '*');
      return mutate(id, conditions, async (connection, record) => {
        // Category and manufacturer are never edited directly: they change
        // only with the software product.
        const {
          categoryId: _category,
          manufacturerId: _manufacturer,
          ...rest
        } = raw;
        const input: Row =
          typeof rest.softwareProductId === 'string' &&
          rest.softwareProductId !== record.softwareProductId
            ? {
                ...rest,
                ...(await fromProduct(connection, rest.softwareProductId)),
              }
            : rest;
        // Required at creation and just as required afterwards: it decides
        // whether seats are counted and who may hold one.
        if (
          record.kind === 'perpetual' &&
          'licensingModel' in input &&
          !input.licensingModel
        )
          throw new ValidationError(
            'Perpetual entitlements need a licensing model',
            'licensingModel',
          );
        if (record.kind === 'subscription' && input.expiryDate === null)
          throw new ValidationError(
            'Subscriptions need an expiry date',
            'expiryDate',
          );
        if (record.kind === 'perpetual' && input.expiryDate)
          throw new ValidationError(
            'Perpetual entitlements have no expiry date',
            'expiryDate',
          );
        // The seat rule follows the record as it will be after the change.
        const next = { ...record, ...input };
        const unlimited = seatsUnlimited(next);
        if (
          seatsRequired(next) &&
          (next.seatCount === null || next.seatCount === undefined)
        )
          throw new ValidationError(
            record.kind === 'perpetual'
              ? 'Perpetual entitlements need a seat count'
              : 'Per-seat subscriptions need a seat count',
            'seatCount',
          );
        await connection.query
          .updateTable('entitlements')
          .set({
            ...input,
            ...(unlimited ? { seatCount: null } : {}),
            updatedAt: new Date(),
          })
          .where('id', '=', id)
          .execute();
        // The key never reaches the change log: masking both sides made one
        // key look like any other, so replacing a key recorded nothing at
        // all. It gets an event of its own instead, like a seat's key.
        const { productKey: nextKey, ...logged } = input;
        await history.logChanges(
          { subjectType: 'entitlements', subjectId: id },
          record,
          logged,
          context,
          connection,
        );
        if ('productKey' in input) {
          const before = asText(record.productKey) ?? '';
          const after = asText(nextKey) ?? '';
          if (before !== after)
            await history.record(
              {
                subjectType: 'entitlements',
                subjectId: id,
                type: 'productKey',
                summary: after
                  ? before
                    ? 'Shared key replaced'
                    : 'Shared key set'
                  : 'Shared key cleared',
                payload: {
                  cleared: !after,
                  replaced: Boolean(before && after),
                },
                ...context,
              },
              connection,
            );
        }
      });
    },

    async deleteImpact(id) {
      const count = async (table: string, extra: ExtraWhere) =>
        Number(
          (
            await extra(
              database
                .query()
                .selectFrom(table)
                .select((eb) => [eb.fn.countAll().as('total')]),
            ).executeTakeFirst<{ total: number | string }>()
          )?.total ?? 0,
        );
      const seats = await count('entitlementSeats', (q) =>
        q.where('entitlementId', '=', id).where('releasedAt', 'is', null),
      );
      const references = [] as {
        collection: string;
        field: string;
        count: number;
      }[];
      if (seats > 0)
        references.push({
          collection: 'entitlementSeats',
          field: 'entitlementId',
          count: seats,
        });
      // Receipts brought it in; deleting only leaves them pointing at
      // nothing.
      const warn = [] as { collection: string; field: string; count: number }[];
      const receipts = await count('purchaseReceipts', (q) =>
        q
          .where('generatedType', '=', 'entitlement')
          .where('generatedId', '=', id),
      );
      if (receipts > 0)
        warn.push({
          collection: 'purchaseReceipts',
          field: 'generatedId',
          count: receipts,
        });
      return {
        level:
          references.length > 0
            ? 'blocked'
            : warn.length > 0
              ? 'warn'
              : 'plain',
        references: [...references, ...warn],
      };
    },

    async delete(id, context, conditions) {
      // The impact check runs outside the transaction: SQLite holds one
      // connection, so a manager-level query inside would wait forever.
      const impact = await this.deleteImpact(id);
      if (impact.level === 'blocked') throw new DeleteBlockedError(impact);
      await database.transaction(async (connection) => {
        await load(id, conditions, connection);
        await connection.query
          .deleteFrom('entitlementSeats')
          .where('entitlementId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('entitlements')
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        await history.log(
          {
            subjectType: 'entitlements',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    assignSeats: (id, seats, context, conditions) =>
      mutate(id, conditions, async (connection, record) => {
        if (seats.length === 0)
          throw new ValidationError('seats is required', 'seats');
        const perpetual = record.kind === 'perpetual';
        const model = asText(record.licensingModel) ?? '';
        const seatCount =
          record.seatCount === null || record.seatCount === undefined
            ? null
            : Number(record.seatCount);
        if (
          seatCount !== null &&
          Number(record.assignedCount) + seats.length > seatCount
        ) {
          throw new BusinessRuleError(
            `Only ${seatCount - Number(record.assignedCount)} seats available`,
            'INSUFFICIENT_SEATS',
          );
        }
        const seen = new Set<string>();
        for (const seat of seats) {
          const holderType: SeatHolderType =
            seat.holderType ?? defaultHolderType(record);
          if (!(SEAT_HOLDER_TYPES as readonly string[]).includes(holderType))
            throw new ValidationError('Invalid holder', 'holderType');
          const holderId = seat.holderId ? String(seat.holderId) : null;
          const account = perpetual
            ? null
            : String(seat.account ?? '')
                .trim()
                .toLowerCase();
          // Only a perpetual seat carries a key of its own; a subscription
          // seat is an account on the vendor's console.
          const seatKey = perpetual
            ? String(seat.productKey ?? '').trim() || null
            : null;
          if (perpetual) {
            if (!holderId)
              throw new ValidationError('holderId is required', 'holderId');
            if (model === 'perDevice' && holderType === 'person')
              throw new ValidationError(
                'Per-device entitlements are assigned to devices',
                'holderType',
              );
            if (model === 'perUser' && holderType === 'device')
              throw new ValidationError(
                'Per-user entitlements are assigned to people',
                'holderType',
              );
          } else {
            if (!account)
              throw new ValidationError('account is required', 'account');
            if (holderType !== 'person')
              throw new ValidationError(
                'Subscription seats are assigned to people',
                'holderType',
              );
          }
          // One holder (or account) once per call and once per entitlement.
          const key = perpetual ? `${holderType}:${holderId}` : account!;
          if (seen.has(key)) continue;
          seen.add(key);
          let duplicate = connection.query
            .selectFrom('entitlementSeats')
            .select('id')
            .where('entitlementId', '=', id)
            .where('releasedAt', 'is', null);
          duplicate = perpetual
            ? duplicate
                .where('holderType', '=', holderType)
                .where('holderId', '=', holderId)
            : duplicate.where('account', '=', account);
          if (await duplicate.executeTakeFirst())
            throw new BusinessRuleError(
              perpetual
                ? 'Holder already has a seat'
                : `Account ${account} already has a seat`,
              'DUPLICATE_SEAT',
            );
          let label = account ?? '';
          if (holderId) {
            const holder = await holderLabel(
              connection,
              holderType,
              holderId,
              perpetual ? 'holderId' : 'personId',
            );
            label = account ? `${holder} (${account})` : holder;
          }
          await connection.query
            .insertInto('entitlementSeats')
            .values({
              id: crypto.randomUUID(),
              entitlementId: id,
              holderType,
              holderId,
              account,
              productKey: seatKey,
              assignedAt: new Date(),
              releasedAt: null,
              actorId: context.actorId,
            })
            .execute();
          await history.record(
            {
              subjectType: 'entitlements',
              subjectId: id,
              type: 'seatAssign',
              summary: `Seat assigned to ${label}`,
              payload: { holderType, holderId, account, targetLabel: label },
              ...context,
            },
            connection,
          );
          if (holderId)
            await history.record(
              {
                subjectType: holderType === 'person' ? 'people' : 'devices',
                subjectId: holderId,
                type: 'seatAssign',
                summary: String(record.name),
                payload: {
                  entitlementId: id,
                  targetLabel: String(record.name),
                },
                ...context,
              },
              connection,
            );
        }
      }),

    adjustSeats: (id, input, context, conditions) =>
      mutate(id, conditions, async (tx, record) => {
        if (!Number.isInteger(input.quantity) || input.quantity === 0)
          throw new ValidationError(
            'quantity must be a non-zero integer',
            'quantity',
          );
        // An entitlement without a seat count has nothing to adjust: site
        // and free licences, and flat-priced subscriptions without a cap.
        if (seatsUnlimited(record))
          throw new BusinessRuleError(
            'This entitlement does not count seats',
            'SEATS_UNLIMITED',
          );
        const assigned = Number(
          (
            await tx.query
              .selectFrom('entitlementSeats')
              .select((eb) => [eb.fn.countAll().as('total')])
              .where('entitlementId', '=', id)
              .where('releasedAt', 'is', null)
              .executeTakeFirst<{ total: number | string }>()
          )?.total ?? 0,
        );
        const seatCount = Number(record.seatCount ?? 0) + input.quantity;
        // Seats already held are the floor: reclaim them first.
        if (seatCount < assigned)
          throw new BusinessRuleError(
            `Cannot reduce below the ${assigned} seats in use`,
            'SEATS_IN_USE',
          );
        await tx.query
          .updateTable('entitlements')
          .set({ seatCount, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.record(
          {
            subjectType: 'entitlements',
            subjectId: id,
            type: input.quantity > 0 ? 'seatsAdded' : 'seatsRemoved',
            summary:
              input.quantity > 0
                ? `Seats added: ${input.quantity}`
                : `Seats removed: ${-input.quantity}`,
            payload: {
              quantity: Math.abs(input.quantity),
              seatCount,
              ...(input.notes ? { notes: input.notes } : {}),
            },
            ...context,
          },
          tx,
        );
      }),

    reclaimSeats: (id, seatIds, context, conditions) =>
      reclaimOp(id, seatIds, context, conditions),

    reclaimSeatsWithin: (connection, id, seatIds, context) =>
      reclaimOp(
        id,
        seatIds,
        context,
        unrestricted('entitlements', 'assignSeat'),
        connection,
      ),

    async seats(id) {
      return (
        await database
          .query()
          .selectFrom('entitlementSeats')
          .selectAll()
          .where('entitlementId', '=', id)
          .where('releasedAt', 'is', null)
          .orderBy('assignedAt', 'desc')
          .execute<Row>()
      ).map((row) => maskSeatKey(decodeRow(row)));
    },

    async seatsOf(holderType, holderId) {
      const rows = await database
        .query()
        .selectFrom('entitlementSeats')
        .innerJoin(
          'entitlements',
          'entitlements.id',
          'entitlementSeats.entitlementId',
        )
        .select([
          'entitlementSeats.id as id',
          'entitlementSeats.entitlementId as entitlementId',
          'entitlementSeats.account as account',
          'entitlementSeats.assignedAt as assignedAt',
          'entitlements.kind as kind',
          'entitlements.name as name',
          'entitlements.softwareProductId as softwareProductId',
          'entitlements.categoryId as categoryId',
        ])
        .where('entitlementSeats.holderType', '=', holderType)
        .where('entitlementSeats.holderId', '=', holderId)
        .where('entitlementSeats.releasedAt', 'is', null)
        .orderBy('entitlements.name', 'asc')
        .execute<Row>();
      return rows.map((row) => decodeRow(row));
    },

    async revealKey(id, context, conditions, seatId) {
      const record = await load(id, conditions);
      const source = seatId
        ? await database
            .query()
            .selectFrom('entitlementSeats')
            .selectAll()
            .where('id', '=', seatId)
            .where('entitlementId', '=', id)
            .executeTakeFirst<Row>()
        : record;
      if (!source)
        throw new RecordNotFoundError('entitlementSeats', seatId ?? id);
      // Reading a key is audited, but it changes nothing: it goes to the
      // application log rather than the record's change log, which would
      // otherwise collect a blank row for every look and every copy.
      auditRead({
        entitlementId: id,
        ...(seatId ? { seatId } : {}),
        actorId: context.actorId,
      });
      return typeof source.productKey === 'string' && source.productKey
        ? source.productKey
        : null;
    },

    setSeatKey: (id, seatId, productKey, context, conditions) =>
      mutate(id, conditions, async (connection, record) => {
        if (record.kind !== 'perpetual')
          throw new BusinessRuleError(
            'Only a perpetual seat carries its own key',
            'SEAT_KEY_NOT_APPLICABLE',
          );
        const seat = await connection.query
          .selectFrom('entitlementSeats')
          .selectAll()
          .where('id', '=', seatId)
          .where('entitlementId', '=', id)
          .where('releasedAt', 'is', null)
          .executeTakeFirst<Row>();
        if (!seat) throw new RecordNotFoundError('entitlementSeats', seatId);
        const next = (productKey ?? '').trim() || null;
        await connection.query
          .updateTable('entitlementSeats')
          .set({ productKey: next })
          .where('id', '=', seatId)
          .execute();
        // The key itself never reaches the log; only that it changed, and
        // whose seat it was.
        const holder = seat.holderId
          ? await holderLabel(
              connection,
              seat.holderType as SeatHolderType,
              asText(seat.holderId) ?? '',
            )
          : (asText(seat.account) ?? '');
        await history.record(
          {
            subjectType: 'entitlements',
            subjectId: id,
            type: 'seatKey',
            summary: next
              ? `Seat key set for ${holder}`
              : `Seat key cleared for ${holder}`,
            payload: {
              seatId,
              cleared: next === null,
              ...(holder ? { targetLabel: holder } : {}),
              // Who the seat belongs to, so the timeline can link the name.
              ...(seat.holderId
                ? { holderType: seat.holderType, holderId: seat.holderId }
                : {}),
            },
            ...context,
          },
          connection,
        );
      }),

    async recomputeCompliance(id, connection) {
      if (connection) return recompute(id, connection);
      return database.transaction((tx) => recompute(id, tx));
    },

    async advanceRenewals(today) {
      const day = isoDate(today);
      const due = await database
        .query()
        .selectFrom('entitlements')
        .select(['id', 'expiryDate', 'billingCycle'])
        .where('kind', '=', 'subscription')
        .where('autoRenew', '=', true)
        .where('expiryDate', '<', day)
        .execute<{ id: string; expiryDate: unknown; billingCycle: unknown }>();
      for (const row of due) {
        const from = asText(row.expiryDate)?.slice(0, 10);
        if (!from) continue;
        const to = nextRenewalDate(from, asText(row.billingCycle) ?? '', day);
        await database.transaction(async (connection) => {
          await connection.query
            .updateTable('entitlements')
            .set({ expiryDate: to, updatedAt: new Date() })
            .where('id', '=', row.id)
            .execute();
          await history.record(
            {
              subjectType: 'entitlements',
              subjectId: row.id,
              type: 'renewalAdvanced',
              summary: `Renewal date ${from} → ${to}`,
              payload: { from, to },
              sourceType: 'scheduler',
            },
            connection,
          );
        });
      }
      return due.length;
    },
  };
}

/**
 * What each entitlement cost so far: every receipt's quantity times its
 * line's unit price. Reports spread a perpetual entitlement's cost over
 * its seats; the record itself keeps no price.
 */
export async function entitlementPurchaseCosts(
  database: DatabaseManager,
): Promise<Map<string, number>> {
  const rows = await database
    .query()
    .selectFrom('purchaseReceipts')
    .innerJoin(
      'purchaseOrderLines',
      'purchaseOrderLines.id',
      'purchaseReceipts.lineId',
    )
    .select([
      'purchaseReceipts.generatedId as id',
      'purchaseReceipts.quantity as quantity',
      'purchaseOrderLines.unitPrice as unitPrice',
    ])
    .where('purchaseReceipts.generatedType', '=', 'entitlement')
    .execute<{ id: string; quantity: unknown; unitPrice: unknown }>();
  const costs = new Map<string, number>();
  for (const row of rows) {
    const price = Number(row.unitPrice);
    if (!Number.isFinite(price)) continue;
    costs.set(row.id, (costs.get(row.id) ?? 0) + price * Number(row.quantity));
  }
  return costs;
}

/** What was paid for entitlements received since `from`. */
async function receivedSpend(
  database: DatabaseManager,
  from: Date,
): Promise<number> {
  const rows = await database
    .query()
    .selectFrom('purchaseReceipts')
    .innerJoin(
      'purchaseOrderLines',
      'purchaseOrderLines.id',
      'purchaseReceipts.lineId',
    )
    .select([
      'purchaseReceipts.quantity as quantity',
      'purchaseOrderLines.unitPrice as unitPrice',
    ])
    .where('purchaseReceipts.generatedType', '=', 'entitlement')
    .where('purchaseReceipts.createdAt', '>=', from)
    .execute<{ quantity: unknown; unitPrice: unknown }>();
  return (
    Math.round(
      rows.reduce((sum, row) => {
        const price = Number(row.unitPrice);
        return Number.isFinite(price)
          ? sum + price * Number(row.quantity)
          : sum;
      }, 0) * 100,
    ) / 100
  );
}

/** The window an entitlement counts as expiring in: a subscription's expiry, or a perpetual one's maintenance end. */
/**
 * Entitlements whose date comes up within the window: a subscription's
 * renewal (or its end, when it does not renew) and a perpetual licence's
 * maintenance end. A monthly subscription that renews by itself is left
 * out — it would be due every month, and nothing is decided each month.
 */
/**
 * Entitlements coming up for renewal or ending: a subscription within
 * `subscriptionLimit` (a monthly one that renews itself is left out — it
 * would be flagged every month), a perpetual one's maintenance within
 * `maintenanceLimit`. The two horizons are separate settings.
 */
/**
 * The three ways an entitlement's date asks for something, each a different
 * act (split 2026-09-28 — one line saying "renewing or ending" could not
 * say which):
 *
 * - `renewing`: a subscription that will **charge** on its date. Monthly
 *   ones are left out: they renew every month, and twelve notices a year
 *   that the same bill is coming is noise.
 * - `ending`: a subscription that will **stop** on its date, because it is
 *   not set to renew. The opposite action — renew it or lose access.
 * - `maintenance`: a perpetual licence whose support and updates end. The
 *   licence itself never expires.
 */
export type ExpiryHorizon = 'renewing' | 'ending' | 'maintenance';

/**
 * `any` is the three together — the entitlements page counts "anything with
 * a date coming up" as one statistic, while the workbench asks for each act
 * on its own. It takes both limits, because a subscription's horizon and a
 * maintenance contract's are separate thresholds.
 */
export function expiringWhere(
  horizon: ExpiryHorizon | 'any',
  day: string,
  limit: string,
  maintenanceLimit: string = limit,
): ExtraWhere {
  return (query) =>
    query.where((eb) => {
      const dated = [
        eb('kind', '=', 'subscription'),
        eb('expiryDate', '>=', day),
        eb('expiryDate', '<=', limit),
      ];
      // Charges on its date, unless it charges every month.
      const renewing = eb.and([
        ...dated,
        eb('autoRenew', '=', true),
        eb('billingCycle', '!=', 'month'),
      ]);
      // Stops on its date, because nothing renews it.
      const ending = eb.and([...dated, eb('autoRenew', '=', false)]);
      // The licence stays; its support and updates end.
      const maintenance = eb.and([
        eb('kind', '=', 'perpetual'),
        eb('maintenanceExpiryDate', '>=', day),
        eb('maintenanceExpiryDate', '<=', maintenanceLimit),
      ]);
      if (horizon === 'renewing') return renewing;
      if (horizon === 'ending') return ending;
      if (horizon === 'maintenance') return maintenance;
      return eb.or([renewing, ending, maintenance]);
    });
}

/**
 * Subscriptions that ended — set not to renew, their date passed — and
 * still hold seats: those seats cost nothing any more and should be taken
 * back.
 */
export function endedWhere(day: string): ExtraWhere {
  return (query) =>
    query
      .where('kind', '=', 'subscription')
      .where('autoRenew', '=', false)
      .where('expiryDate', '<', day)
      .where('assignedCount', '>', 0);
}

async function viewWhere(
  view: string | undefined,
  settings: SettingsService,
): Promise<{ filter: ListOptions['filter']; extra?: ExtraWhere }> {
  if (!view) return { filter: {} };
  const thresholds = await settings.get('thresholds');
  const day = today();
  switch (view) {
    case 'overAllocated':
      return { filter: { complianceStatus: 'overAllocated' } };
    case 'idle':
      return { filter: { complianceStatus: 'idle' } };
    case 'expiring':
      return {
        filter: {},
        extra: expiringWhere(
          'any',
          day,
          addDays(day, thresholds.subscriptionExpiryDays),
          addDays(day, thresholds.maintenanceExpiryDays),
        ),
      };
    case 'renewing':
    case 'ending':
      return {
        filter: {},
        extra: expiringWhere(
          view,
          day,
          addDays(day, thresholds.subscriptionExpiryDays),
        ),
      };
    case 'maintenance':
      return {
        filter: {},
        extra: expiringWhere(
          'maintenance',
          day,
          addDays(day, thresholds.maintenanceExpiryDays),
        ),
      };
    case 'ended':
      return { filter: {}, extra: endedWhere(day) };
    default:
      throw new ValidationError(`Unknown view: ${view}`, 'view');
  }
}
