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
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { STOCK_ITEMS_COLLECTION } from './collections.js';
import {
  BusinessRuleError,
  DeleteBlockedError,
  RecordNotFoundError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService, DerivedEvents } from './history.js';
import type { OperationContext } from './devices.js';
import type { SettingsService } from './settings.js';

/**
 * Quantity-managed items. Accessories are issued to people or locations and
 * come back; consumables are issued and gone; components are installed on
 * devices and can be removed. Available = total − used, always.
 */
export const STOCK_KINDS = ['accessory', 'consumable', 'component'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const HOLDER_TYPES = ['person', 'location', 'device'] as const;
export type HolderType = (typeof HOLDER_TYPES)[number];

export interface StockInInput {
  readonly quantity: number;
  readonly notes?: string | null;
  readonly purchaseOrderId?: string | null;
}

/**
 * A quantity counted wrong, lost, broken or written off: a signed change
 * to the total, with the reason it is recorded under.
 */
export interface AdjustInput {
  readonly quantity: number;
  readonly reason: StockAdjustReason;
  /** Required for `other`, optional beside any other reason. */
  readonly notes?: string | null;
}

/** Why a quantity went up … */
export const STOCK_GAIN_REASONS = ['countSurplus', 'found', 'other'] as const;
/** … or down. */
export const STOCK_LOSS_REASONS = [
  'lost',
  'damaged',
  'scrapped',
  'countShortage',
  'other',
] as const;
export const STOCK_ADJUST_REASONS = [
  'countSurplus',
  'found',
  'lost',
  'damaged',
  'scrapped',
  'countShortage',
  'other',
] as const;
export type StockAdjustReason = (typeof STOCK_ADJUST_REASONS)[number];

export interface IssueInput {
  readonly holderType: HolderType;
  readonly holderId: string;
  readonly quantity: number;
  readonly notes?: string | null;
}

export interface StockStats {
  readonly total: number;
  readonly belowMinimum: number;
  readonly outOfStock: number;
  readonly issuedThisMonth: number;
}

export const STOCK_COUNT_FIELDS = [
  'modelId',
  'categoryId',
  'locationId',
  'manufacturerId',
] as const;
export type StockCountField = (typeof STOCK_COUNT_FIELDS)[number];

export interface StockService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  stats(
    kind: StockKind,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<StockStats>;
  /** Total quantity on hand, summed per reference field (for list badges). */
  countsBy(
    field: StockCountField,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Readonly<Record<string, number>>>;
  create(
    input: Row,
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
  stockIn(
    id: string,
    input: StockInInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /**
   * Corrects the quantity in stock outside any purchase or issue — a count
   * that found more, or goods lost, broken or written off. Only what is in
   * stock can be removed: what a holder has is taken back first.
   */
  adjust(
    id: string,
    input: AdjustInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Adds quantity inside a caller-owned transaction (receiving). */
  stockInWithin(
    connection: DatabaseConnection,
    id: string,
    input: StockInInput,
    context: OperationContext,
  ): Promise<void>;
  /** Creates inside a caller-owned transaction (receiving). */
  createWithin(
    connection: DatabaseConnection,
    input: Row,
    context: OperationContext,
  ): Promise<Row>;
  /** Issue (accessory / consumable) or install (component). */
  issue(
    id: string,
    input: IssueInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Return (accessory) or uninstall (component) from a holder. */
  takeBack(
    id: string,
    input: IssueInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Takes back inside a caller-owned transaction (a disposal reclaiming components). */
  takeBackWithin(
    connection: DatabaseConnection,
    id: string,
    input: IssueInput,
    context: OperationContext,
  ): Promise<Row>;
  holdings(id: string): Promise<readonly Row[]>;
  /** Current holdings of one holder across items, e.g. a person's accessories or a device's components. */
  holdingsOf(
    holderType: HolderType,
    holderId: string,
    kind?: StockKind,
  ): Promise<readonly Row[]>;
  /**
   * The purchase orders this item came in through, newest receipt first:
   * order number, vendor, unit price and currency from the order and its
   * line. An item stocked by hand has none.
   */
  purchases(id: string): Promise<readonly Row[]>;
  /**
   * The movement log, newest first. Every issue / install row carries
   * `remaining`: how much of it the holder still has after later returns
   * (netted oldest first). `outstanding` keeps only rows with something
   * remaining — the current holders, straight from the log — and
   * `holderType` narrows those to one kind of holder.
   */
  movements(
    id: string,
    options?: {
      limit?: number;
      offset?: number;
      outstanding?: boolean;
      holderType?: string;
      /** Only movements of this type (in, issue, return, …). */
      type?: string;
    },
  ): Promise<ListResult>;
}

/**
 * Unit price per stock item for valuation: the average of its purchase
 * receipts weighted by quantity. Items stocked by hand have no price.
 */
export async function stockUnitPrices(
  database: DatabaseManager,
): Promise<ReadonlyMap<string, number>> {
  const rows = await database
    .query()
    .selectFrom('purchaseReceipts')
    .innerJoin(
      'purchaseOrderLines',
      'purchaseOrderLines.id',
      'purchaseReceipts.lineId',
    )
    .select([
      'purchaseReceipts.generatedId as itemId',
      'purchaseReceipts.quantity as quantity',
      'purchaseOrderLines.unitPrice as unitPrice',
    ])
    .where('purchaseReceipts.generatedType', '=', 'stockItem')
    .where('purchaseOrderLines.unitPrice', 'is not', null)
    .execute<{ itemId: string; quantity: unknown; unitPrice: unknown }>();
  const totals = new Map<string, { quantity: number; amount: number }>();
  for (const row of rows) {
    const quantity = Number(row.quantity);
    const entry = totals.get(row.itemId) ?? { quantity: 0, amount: 0 };
    entry.quantity += quantity;
    entry.amount += quantity * Number(row.unitPrice);
    totals.set(row.itemId, entry);
  }
  return new Map(
    [...totals].map(([id, { quantity, amount }]) => [
      id,
      quantity > 0 ? amount / quantity : 0,
    ]),
  );
}

export const stockServiceToken: ServiceToken<StockService> =
  createServiceToken<StockService>('itam/stock-service');

const LIFECYCLE_FIELDS = new Set(['totalQuantity', 'usedQuantity', 'kind']);

export function createStockService(
  database: DatabaseManager,
  history: HistoryService,
  settings: SettingsService,
): StockService {
  const definition = STOCK_ITEMS_COLLECTION;

  const load = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('stockItems')
      .selectAll()
      .where('id', '=', id)
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError('stockItems', id);
    return decodeRow(row);
  };

  const findRaw = async (
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('stockItems')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row ? decodeRow(row) : undefined;
  };

  const shape = (row: Row, conditions: DatabaseAuthorizationConditions): Row =>
    pickFields(row, outputFields(definition.fields, conditions));

  const movement = async (
    connection: DatabaseConnection,
    itemId: string,
    type: string,
    quantity: number,
    holder: { holderType?: string | null; holderId?: string | null },
    context: OperationContext,
    notes?: string | null,
    reason?: string | null,
  ) => {
    await connection.query
      .insertInto('stockMovements')
      .values({
        id: crypto.randomUUID(),
        stockItemId: itemId,
        type,
        quantity,
        holderType: holder.holderType ?? null,
        holderId: holder.holderId ?? null,
        sourceType: context.sourceType ?? null,
        sourceId: context.sourceId ?? null,
        notes: notes ?? null,
        reason: reason ?? null,
        actorId: context.actorId,
        createdAt: new Date(),
      })
      .execute();
  };

  /** The holder a movement names must exist, whichever way the goods go. */
  const holderRow = async (
    connection: DatabaseConnection,
    holderType: HolderType,
    holderId: string,
  ): Promise<Row> => {
    const table =
      holderType === 'person'
        ? 'people'
        : holderType === 'location'
          ? 'locations'
          : 'devices';
    const target = await connection.query
      .selectFrom(table)
      .selectAll()
      .where('id', '=', holderId)
      .executeTakeFirst<Row>();
    if (!target)
      throw new ValidationError(`${holderType} not found`, 'holderId');
    return target;
  };

  /**
   * …and, when stock is going *out*, must be able to receive it. Both rules
   * here are about that direction: somebody who has left is given nothing
   * new, and a disposed device is not built on. Taking goods *back* from
   * either is the opposite act, and the very thing offboarding and a
   * disposal exist to do — so it goes through `holderRow` alone. The rules
   * used to sit in the lookup both paths shared, which refused 归还 on a
   * leaver's accessories with "cannot issue to a person who has left", from
   * the button that was trying to collect them.
   */
  const requireIssuable = async (
    connection: DatabaseConnection,
    holderType: HolderType,
    holderId: string,
  ): Promise<void> => {
    const target = await holderRow(connection, holderType, holderId);
    if (holderType === 'person' && target.employmentStatus === 'left') {
      throw new BusinessRuleError(
        'Cannot issue to a person who has left',
        'PERSON_LEFT',
      );
    }
    if (holderType === 'device' && target.status === 'disposed') {
      throw new BusinessRuleError(
        'Cannot install on a disposed device',
        'DISPOSED_READ_ONLY',
      );
    }
  };

  const adjustHolding = async (
    connection: DatabaseConnection,
    itemId: string,
    holderType: string,
    holderId: string,
    delta: number,
  ) => {
    const existing = await connection.query
      .selectFrom('stockHoldings')
      .select(['id', 'quantity'])
      .where('stockItemId', '=', itemId)
      .where('holderType', '=', holderType)
      .where('holderId', '=', holderId)
      .executeTakeFirst<{ id: string; quantity: number }>();
    const current = Number(existing?.quantity ?? 0);
    const next = current + delta;
    if (next < 0)
      throw new BusinessRuleError(
        'The holder does not hold that many',
        'HOLDING_TOO_SMALL',
      );
    if (existing) {
      if (next === 0) {
        await connection.query
          .deleteFrom('stockHoldings')
          .where('id', '=', existing.id)
          .execute();
      } else {
        await connection.query
          .updateTable('stockHoldings')
          .set({ quantity: next, updatedAt: new Date() })
          .where('id', '=', existing.id)
          .execute();
      }
    } else if (next > 0) {
      await connection.query
        .insertInto('stockHoldings')
        .values({
          id: crypto.randomUUID(),
          stockItemId: itemId,
          holderType,
          holderId,
          quantity: next,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }
  };

  // With `within`, runs inside the caller's transaction (a disposal
  // reclaiming components) instead of opening its own.
  const mutate = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    fn: (connection: DatabaseConnection, item: Row) => Promise<void>,
    within?: DatabaseConnection,
  ): Promise<Row> => {
    const run = async (connection: DatabaseConnection) => {
      const item = await load(id, conditions, connection);
      await fn(connection, item);
    };
    if (within) await run(within);
    else await database.transaction(run);
    return shape((await findRaw(id, within)) ?? {}, conditions);
  };

  const setQuantities = async (
    connection: DatabaseConnection,
    id: string,
    total: number,
    used: number,
  ) => {
    await connection.query
      .updateTable('stockItems')
      .set({ totalQuantity: total, usedQuantity: used, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  };

  /**
   * With a model chosen, category and manufacturer follow it (as on
   * devices); the caller's values only count when there is no model.
   */
  const fromModel = async (
    connection: DatabaseConnection,
    modelId: unknown,
  ): Promise<Row> => {
    if (typeof modelId !== 'string' || !modelId) return {};
    const model = await connection.query
      .selectFrom('models')
      .select(['categoryId', 'manufacturerId'])
      .where('id', '=', modelId)
      .executeTakeFirst<{
        categoryId: string | null;
        manufacturerId: string | null;
      }>();
    if (!model) throw new ValidationError('Model not found', 'modelId');
    return {
      ...(model.categoryId ? { categoryId: model.categoryId } : {}),
      ...(model.manufacturerId ? { manufacturerId: model.manufacturerId } : {}),
    };
  };

  const insertItem = async (
    connection: DatabaseConnection,
    raw: Row,
    context: OperationContext,
  ): Promise<string> => {
    const input = { ...raw, ...(await fromModel(connection, raw.modelId)) };
    if (!STOCK_KINDS.includes(input.kind as StockKind))
      throw new ValidationError('Invalid kind', 'kind');
    // Every accessory, consumable and component is a model: it is what
    // says which thing this stock is, and what its category and maker
    // follow from (decided 2026-09-26).
    if (!input.modelId)
      throw new ValidationError('A model is required', 'modelId');
    const id = crypto.randomUUID();
    const category = await connection.query
      .selectFrom('categories')
      .select(['id', 'appliesTo'])
      .where('id', '=', String(input.categoryId))
      .executeTakeFirst<{ id: string; appliesTo: string }>();
    if (!category)
      throw new ValidationError('Category not found', 'categoryId');
    if (category.appliesTo !== input.kind)
      throw new ValidationError(
        'Category does not apply to this kind',
        'categoryId',
      );
    const location = await connection.query
      .selectFrom('locations')
      .select('id')
      .where('id', '=', String(input.locationId))
      .executeTakeFirst();
    if (!location)
      throw new ValidationError('Location not found', 'locationId');
    const total = Number(input.totalQuantity ?? 0);
    const now = new Date();
    await connection.query
      .insertInto('stockItems')
      .values({
        ...input,
        id,
        totalQuantity: total,
        usedQuantity: 0,
        minimumQuantity: Number(
          input.minimumQuantity ??
            (await settings.get('thresholds', connection)).defaultStockMinimum,
        ),
        ownerId: input.ownerId ?? context.actorId,
        createdById: context.actorId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    // One creation line. With opening stock, the movement marked as the
    // creation is that line ("创建，入库 10"); without, the change log's
    // "create" is. Both would read as two lines for one act.
    //
    // Unless the caller named where the goods came from: an item first
    // stocked by receiving a purchase order keeps that order as the
    // movement's source, so the row says which order it arrived on and the
    // item's purchase history and unit price can be read back from it.
    // Stamping `created` there would file the arrival as a manual entry.
    if (total > 0)
      await movement(
        connection,
        id,
        'in',
        total,
        {},
        // A source is a record (`sourceId`); the assistant's `aiAction`
        // names only how the request came, not where the goods did.
        context.sourceType && context.sourceId
          ? context
          : { ...context, sourceType: 'created', sourceId: id },
      );
    else
      await history.log(
        {
          subjectType: 'stockItems',
          subjectId: id,
          action: 'create',
          ...context,
        },
        connection,
      );
    return id;
  };

  const applyStockIn = async (
    connection: DatabaseConnection,
    item: Row,
    input: StockInInput,
    context: OperationContext,
  ): Promise<void> => {
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new ValidationError(
        'quantity must be a positive integer',
        'quantity',
      );
    const id = String(item.id);
    await setQuantities(
      connection,
      id,
      Number(item.totalQuantity) + input.quantity,
      Number(item.usedQuantity),
    );
    await movement(
      connection,
      id,
      'in',
      input.quantity,
      {},
      {
        ...context,
        sourceType: input.purchaseOrderId
          ? 'purchaseOrder'
          : context.sourceType,
        sourceId: input.purchaseOrderId ?? context.sourceId,
      },
      input.notes,
    );
  };

  const takeBackOp = (
    id: string,
    input: IssueInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    within?: DatabaseConnection,
  ): Promise<Row> =>
    mutate(
      id,
      conditions,
      async (connection, item) => {
        if (!Number.isInteger(input.quantity) || input.quantity < 1)
          throw new ValidationError(
            'quantity must be a positive integer',
            'quantity',
          );
        const kind = item.kind as StockKind;
        if (kind === 'consumable')
          throw new BusinessRuleError(
            'Consumables are not returned',
            'CONSUMABLE',
          );
        // The holder must exist, and that is all this direction asks: a
        // person who has left is exactly who stock is taken back from.
        await holderRow(connection, input.holderType, input.holderId);
        await adjustHolding(
          connection,
          id,
          input.holderType,
          input.holderId,
          -input.quantity,
        );
        await setQuantities(
          connection,
          id,
          Number(item.totalQuantity),
          Number(item.usedQuantity) - input.quantity,
        );
        const type = kind === 'component' ? 'uninstall' : 'return';
        await movement(
          connection,
          id,
          type,
          input.quantity,
          input,
          context,
          input.notes,
        );
        // The movement row is the record of a movement; an event on the
        // item would say the same thing again in the timeline. The holder's
        // own event (below) is what a person's or device's page shows.
        await history.record(
          {
            subjectType:
              input.holderType === 'person'
                ? 'people'
                : input.holderType === 'device'
                  ? 'devices'
                  : 'locations',
            subjectId: input.holderId,
            type: kind === 'component' ? 'componentRemoved' : 'stockReturned',
            summary: `${String(item.name)} ×${input.quantity}`,
            payload: {
              stockItemId: id,
              // The kind routes the link: an accessory, a consumable and a
              // component each have their own page.
              stockKind: kind,
              quantity: input.quantity,
              targetLabel: String(item.name),
            },
            ...context,
          },
          connection,
        );
      },
      within,
    );

  // What is on the shelf: stocked in total, minus what is out or used up.
  const withAvailable = (row: Row): Row => ({
    ...row,
    availableQuantity:
      Number(row.totalQuantity ?? 0) - Number(row.usedQuantity ?? 0),
  });

  /**
   * The items whose free quantity is under their water level — the same
   * predicate the `lowStock` reminder counts, for all three kinds. It
   * compares two columns minus a third, which neither a filter parameter
   * nor `whereRef` can state, so the ids are resolved first and the list
   * filters on them (as `itam.myAudits` does for its JSON column). Empty
   * means no row: `''` is nobody's id.
   */
  const lowStockIds = async (): Promise<readonly string[]> => {
    const rows = await database
      .query()
      .selectFrom('stockItems')
      .select(['id', 'totalQuantity', 'usedQuantity', 'minimumQuantity'])
      .where('minimumQuantity', '>', 0)
      .execute<Row>();
    const ids = rows
      .filter(
        (row) =>
          Number(row.totalQuantity ?? 0) - Number(row.usedQuantity ?? 0) <
          Number(row.minimumQuantity ?? 0),
      )
      .map((row) => String(row.id));
    return ids.length > 0 ? ids : [''];
  };

  return {
    async list(options, conditions) {
      const { view, ...filter } = options.filter ?? {};
      const ids = view === 'lowStock' ? await lowStockIds() : undefined;
      const result = await listCollection(
        database,
        definition,
        { ...options, filter },
        conditions,
        {},
        ids ? (query) => query.where('id', 'in', ids) : undefined,
      );
      return { ...result, data: result.data.map(withAvailable) };
    },

    async get(id, conditions) {
      const row = await database
        .query()
        .selectFrom('stockItems')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      return row ? withAvailable(shape(decodeRow(row), conditions)) : undefined;
    },

    async countsBy(field, conditions) {
      const rows = await database
        .query()
        .selectFrom('stockItems')
        .select((eb) => [field, eb.fn.sum('totalQuantity').as('total')])
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .groupBy(field)
        .execute<Record<string, unknown>>();
      return Object.fromEntries(
        rows
          .filter((row) => row[field] !== null && row[field] !== undefined)
          .map((row) => [String(row[field]), Number(row.total)]),
      );
    },

    async stats(kind, conditions) {
      const count = (
        filter: ListOptions['filter'],
        extra?: (
          query: import('@nocobase/db').SelectQuery,
        ) => import('@nocobase/db').SelectQuery,
      ) =>
        countCollection(
          database,
          definition,
          { kind, ...filter },
          conditions,
          extra,
        );
      const monthStart = new Date(
        `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`,
      );
      const [total, belowMinimum, outOfStock] = await Promise.all([
        count({}),
        count({}, (query) =>
          query
            .whereRef('totalQuantity', '<', 'minimumQuantity')
            .where('minimumQuantity', '>', 0),
        ),
        count({}, (query) =>
          query.whereRef('totalQuantity', '<=', 'usedQuantity'),
        ),
      ]);
      const issued = await database
        .query()
        .selectFrom('stockMovements')
        .innerJoin('stockItems', 'stockItems.id', 'stockMovements.stockItemId')
        .select((eb) => [eb.fn.sum('stockMovements.quantity').as('total')])
        .where('stockItems.kind', '=', kind)
        .where('stockMovements.type', 'in', ['issue', 'consume', 'install'])
        .where('stockMovements.createdAt', '>=', monthStart)
        .executeTakeFirst<{ total: number | string | null }>();
      return {
        total,
        belowMinimum,
        outOfStock,
        issuedThisMonth: Number(issued?.total ?? 0),
      };
    },

    async createWithin(connection, input, context) {
      const id = await insertItem(connection, input, context);
      const created = await connection.query
        .selectFrom('stockItems')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      return decodeRow(created ?? {});
    },

    async stockInWithin(connection, id, input, context) {
      const item = await connection.query
        .selectFrom('stockItems')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      if (!item) throw new RecordNotFoundError('stockItems', id);
      await applyStockIn(connection, decodeRow(item), input, context);
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      const id = await database.transaction((connection) =>
        insertItem(connection, input, context),
      );
      return shape((await findRaw(id)) ?? {}, conditions);
    },

    async update(id, input, context, conditions) {
      const blocked = Object.keys(input).filter((field) =>
        LIFECYCLE_FIELDS.has(field),
      );
      if (blocked.length > 0)
        throw new ValidationError(
          `Fields change only through operations: ${blocked.join(', ')}`,
          blocked[0],
        );
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      return mutate(id, conditions, async (connection, item) => {
        const values =
          typeof input.modelId === 'string' && input.modelId !== item.modelId
            ? { ...input, ...(await fromModel(connection, input.modelId)) }
            : input;
        if (
          typeof values.categoryId === 'string' &&
          values.categoryId !== item.categoryId
        ) {
          const category = await connection.query
            .selectFrom('categories')
            .select('appliesTo')
            .where('id', '=', values.categoryId)
            .executeTakeFirst<{ appliesTo: string }>();
          if (!category)
            throw new ValidationError('Category not found', 'categoryId');
          if (category.appliesTo !== item.kind)
            throw new ValidationError(
              'Category does not apply to this kind',
              'categoryId',
            );
        }
        await connection.query
          .updateTable('stockItems')
          .set({ ...values, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'stockItems', subjectId: id },
          item,
          values,
          context,
          connection,
        );
      });
    },

    async deleteImpact(id) {
      const holdings = await database
        .query()
        .selectFrom('stockHoldings')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('stockItemId', '=', id)
        .executeTakeFirst<{ total: number | string }>();
      const movements = await database
        .query()
        .selectFrom('stockMovements')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('stockItemId', '=', id)
        .where('type', 'in', [
          'issue',
          'consume',
          'install',
          'return',
          'uninstall',
        ])
        .executeTakeFirst<{ total: number | string }>();
      const references = [
        ...(Number(holdings?.total ?? 0) > 0
          ? [
              {
                collection: 'stockHoldings',
                field: 'stockItemId',
                count: Number(holdings?.total),
              },
            ]
          : []),
        ...(Number(movements?.total ?? 0) > 0
          ? [
              {
                collection: 'stockMovements',
                field: 'stockItemId',
                count: Number(movements?.total),
              },
            ]
          : []),
      ];
      return { level: references.length > 0 ? 'blocked' : 'plain', references };
    },

    async delete(id, context, conditions) {
      // The impact check runs outside the transaction: SQLite holds one
      // connection, so a manager-level query inside would wait forever.
      const impact = await this.deleteImpact(id);
      if (impact.level === 'blocked') throw new DeleteBlockedError(impact);
      await database.transaction(async (connection) => {
        await load(id, conditions, connection);
        await connection.query
          .deleteFrom('stockMovements')
          .where('stockItemId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('stockItems')
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        await history.log(
          {
            subjectType: 'stockItems',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    stockIn: (id, input, context, conditions) =>
      mutate(id, conditions, (connection, item) =>
        applyStockIn(connection, item, input, context),
      ),

    adjust: (id, input, context, conditions) =>
      mutate(id, conditions, async (connection, item) => {
        if (!Number.isInteger(input.quantity) || input.quantity === 0)
          throw new ValidationError(
            'quantity must be a non-zero integer',
            'quantity',
          );
        // A gain is counted or found, a loss lost, broken, written off or
        // short on a count; 其他 says what in a note.
        const allowed: readonly string[] =
          input.quantity > 0 ? STOCK_GAIN_REASONS : STOCK_LOSS_REASONS;
        if (!allowed.includes(input.reason))
          throw new ValidationError(
            'The reason does not match the direction',
            'reason',
          );
        const notes = input.notes?.trim() || null;
        if (input.reason === 'other' && !notes)
          throw new ValidationError('A reason is required', 'notes');
        const total = Number(item.totalQuantity);
        const used = Number(item.usedQuantity);
        const available = total - used;
        if (-input.quantity > available)
          throw new BusinessRuleError(
            `Only ${available} available`,
            'INSUFFICIENT_STOCK',
          );
        await setQuantities(connection, id, total + input.quantity, used);
        // The signed change and its reason; the timeline reads it from here.
        await movement(
          connection,
          id,
          'adjust',
          input.quantity,
          {},
          context,
          notes,
          input.reason,
        );
      }),

    issue: (id, input, context, conditions) =>
      mutate(id, conditions, async (connection, item) => {
        if (!Number.isInteger(input.quantity) || input.quantity < 1)
          throw new ValidationError(
            'quantity must be a positive integer',
            'quantity',
          );
        const kind = item.kind as StockKind;
        if (kind === 'component' && input.holderType !== 'device')
          throw new ValidationError(
            'Components install on devices',
            'holderType',
          );
        if (kind !== 'component' && input.holderType === 'device')
          throw new ValidationError(
            'Accessories and consumables go to people or locations',
            'holderType',
          );
        const available =
          Number(item.totalQuantity) - Number(item.usedQuantity);
        if (input.quantity > available)
          throw new BusinessRuleError(
            `Only ${available} available`,
            'INSUFFICIENT_STOCK',
          );
        // Going out, so the holder must be able to receive it.
        await requireIssuable(connection, input.holderType, input.holderId);
        const type =
          kind === 'consumable'
            ? 'consume'
            : kind === 'component'
              ? 'install'
              : 'issue';
        if (kind !== 'consumable')
          await adjustHolding(
            connection,
            id,
            input.holderType,
            input.holderId,
            input.quantity,
          );
        await setQuantities(
          connection,
          id,
          Number(item.totalQuantity),
          Number(item.usedQuantity) + input.quantity,
        );
        await movement(
          connection,
          id,
          type,
          input.quantity,
          input,
          context,
          input.notes,
        );
        // The movement row is the record of a movement; an event on the
        // item would say the same thing again in the timeline. The holder's
        // own event (below) is what a person's or device's page shows.
        await history.record(
          {
            subjectType:
              input.holderType === 'person'
                ? 'people'
                : input.holderType === 'device'
                  ? 'devices'
                  : 'locations',
            subjectId: input.holderId,
            type: kind === 'component' ? 'componentInstalled' : 'stockIssued',
            summary: `${String(item.name)} ×${input.quantity}`,
            payload: {
              stockItemId: id,
              // The kind routes the link: an accessory, a consumable and a
              // component each have their own page.
              stockKind: kind,
              quantity: input.quantity,
              targetLabel: String(item.name),
            },
            ...context,
          },
          connection,
        );
      }),

    takeBack: (id, input, context, conditions) =>
      takeBackOp(id, input, context, conditions),

    takeBackWithin: (connection, id, input, context) =>
      takeBackOp(
        id,
        input,
        context,
        unrestricted('stockItems', 'issue'),
        connection,
      ),

    async holdings(id) {
      return database
        .query()
        .selectFrom('stockHoldings')
        .selectAll()
        .where('stockItemId', '=', id)
        .orderBy('updatedAt', 'desc')
        .execute<Row>()
        .then((rows) => rows.map((row) => decodeRow(row)));
    },

    async holdingsOf(holderType, holderId, kind) {
      let query = database
        .query()
        .selectFrom('stockHoldings')
        .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
        .select([
          'stockHoldings.id as id',
          'stockHoldings.stockItemId as stockItemId',
          'stockHoldings.quantity as quantity',
          'stockHoldings.updatedAt as updatedAt',
          'stockItems.name as name',
          'stockItems.kind as kind',
          'stockItems.categoryId as categoryId',
          'stockItems.modelId as modelId',
        ])
        .where('stockHoldings.holderType', '=', holderType)
        .where('stockHoldings.holderId', '=', holderId);
      if (kind) query = query.where('stockItems.kind', '=', kind);
      return (await query.orderBy('stockItems.name', 'asc').execute<Row>()).map(
        (row) => decodeRow(row),
      );
    },

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
        .where('purchaseReceipts.generatedType', '=', 'stockItem')
        .where('purchaseReceipts.generatedId', '=', id)
        .orderBy('purchaseReceipts.createdAt', 'desc')
        .execute<Row>()
        .then((rows) => rows.map((row) => decodeRow(row)));
    },

    async movements(id, options = {}) {
      const limit = options.limit ?? 30;
      const offset = options.offset ?? 0;
      const all = (
        await database
          .query()
          .selectFrom('stockMovements')
          .selectAll()
          .where('stockItemId', '=', id)
          .orderBy('createdAt', 'asc')
          .execute<Row>()
      ).map((row) => decodeRow(row));
      // Walk the log oldest first: an issue opens a balance for its holder,
      // a return closes the oldest open balances of that holder.
      const open = new Map<string, Row[]>();
      const remaining = new Map<unknown, number>();
      for (const row of all) {
        const key = `${String(row.holderType)}:${String(row.holderId)}`;
        const type = String(row.type);
        if (type === 'issue' || type === 'install') {
          remaining.set(row.id, Number(row.quantity));
          open.set(key, [...(open.get(key) ?? []), row]);
        } else if (type === 'return' || type === 'uninstall') {
          let left = Number(row.quantity);
          for (const issue of open.get(key) ?? []) {
            if (left <= 0) break;
            const balance = remaining.get(issue.id) ?? 0;
            const taken = Math.min(balance, left);
            remaining.set(issue.id, balance - taken);
            left -= taken;
          }
        }
      }
      const annotated = all
        .map((row) =>
          remaining.has(row.id)
            ? { ...row, remaining: remaining.get(row.id) }
            : row,
        )
        .filter(
          (row) =>
            (!options.type || row.type === options.type) &&
            (!options.outstanding ||
              (Number(row.remaining ?? 0) > 0 &&
                (!options.holderType ||
                  row.holderType === options.holderType))),
        )
        .reverse();
      return {
        data: annotated.slice(offset, offset + limit),
        total: annotated.length,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
      };
    },
  };
}

/**
 * The item's movements as timeline lines.
 *
 * A movement is recorded once, in `stockMovements`: it carries the quantity,
 * the direction and the balance the ledger shows. The timeline renders the
 * same rows so a stock item's story is whole, rather than a second copy of
 * the facts that could drift from the first.
 */
export function stockMovementEvents(database: DatabaseManager): DerivedEvents {
  const TYPES: Readonly<Record<string, string>> = { in: 'stockIn' };
  return async (stockItemId) => {
    const rows = await database
      .query()
      .selectFrom('stockMovements')
      .selectAll()
      .where('stockItemId', '=', stockItemId)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .execute<Row>();
    if (rows.length === 0) return [];
    const kind = asText(
      (
        await database
          .query()
          .selectFrom('stockItems')
          .select('kind')
          .where('id', '=', stockItemId)
          .executeTakeFirst<Row>()
      )?.kind,
    );
    // One lookup per holder kind, not one per row.
    const names = new Map<string, string>();
    for (const [holderType, collection] of [
      ['person', 'people'],
      ['device', 'devices'],
      ['location', 'locations'],
    ] as const) {
      const ids = [
        ...new Set(
          rows
            .filter((row) => row.holderType === holderType && row.holderId)
            .map((row) => asText(row.holderId) ?? ''),
        ),
      ].filter(Boolean);
      if (ids.length === 0) continue;
      for (const holder of await database
        .query()
        .selectFrom(collection)
        .select(['id', 'name'])
        .where('id', 'in', ids)
        .execute<{ id: string; name: string }>())
        names.set(`${holderType}:${holder.id}`, holder.name);
    }
    return rows.map((row) => {
      const holderType = asText(row.holderType) ?? '';
      const holderId = asText(row.holderId) ?? '';
      const target = names.get(`${holderType}:${holderId}`) ?? '';
      // The opening stock reads as the creation itself.
      const type =
        asText(row.sourceType) === 'created'
          ? 'created'
          : (TYPES[asText(row.type) ?? ''] ?? asText(row.type) ?? '');
      return {
        id: `movement:${asText(row.id) ?? ''}`,
        subjectType: 'stockItems',
        subjectId: stockItemId,
        type,
        summary: `${type} ${Number(row.quantity)}`,
        payload: {
          quantity: Number(row.quantity),
          ...(holderType ? { holderType } : {}),
          ...(holderId ? { holderId } : {}),
          ...(target ? { targetLabel: target } : {}),
          ...(kind ? { stockKind: kind } : {}),
          // An adjustment's reason; any other note the movement carries.
          ...(asText(row.notes) ? { notes: asText(row.notes) } : {}),
          ...(asText(row.reason) ? { reason: asText(row.reason) } : {}),
        },
        sourceType: asText(row.sourceType) ?? null,
        sourceId: asText(row.sourceId) ?? null,
        actorId: asText(row.actorId) ?? null,
        // A movement records who, not through what; the line it derives
        // says so rather than claiming a provenance nobody wrote down.
        origin: null,
        operationId: null,
        createdAt: row.createdAt as string,
      };
    });
  };
}
