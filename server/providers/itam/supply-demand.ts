import type { DatabaseManager } from '@nocobase/db';

import { asText, type Row } from './collection-query.js';
import { addDays, today } from './dates.js';
import {
  isPrepared,
  type OnboardingPlan,
  type OnboardingService,
} from './onboarding.js';
import { OPEN_DISPOSAL_STATUSES } from './recovery.js';
import type { SettingsService } from './settings.js';

/**
 * 供需分析 (2026-10-23): for every item the register keeps — a device
 * model, a stock item's model, a software product's seats — what will come
 * in and go out over the next days, and what is left or short. It replaced
 * 入职供需, which looked at joiners alone, and is where the shortfall is
 * bought (the purchase order's create dialog, filled in); the joiners'
 * cards no longer buy.
 *
 * Supply: what is in stock and free (not reserved, not on a disposal);
 * what is on an open purchase order (draft to partly received, by its
 * expected or needed-by date); devices at the repairer coming back by their
 * expected return; what people leaving hand back, from their leave date and
 * the days it takes to make ready (devices, reusable stock, seats). Demand:
 * what joiners starting within the window still need; a stock item's
 * minimum level; seats on a subscription that ends unrenewed; and, when
 * asked, devices due for replacement. A row's balance is supply less
 * demand; short, it says the last day to order — the earliest need, less
 * the days to make ready (devices) and the purchase lead time.
 */
export interface SupplyEntry {
  readonly kind:
    | 'stock'
    | 'order'
    | 'repair'
    | 'return'
    | 'joiner'
    | 'minimum'
    | 'expiring'
    | 'replacement';
  /** Signed: what it adds to the row (supply) or takes from it (demand). */
  readonly quantity: number;
  readonly label: string;
  readonly date: string | null;
  /** The record it is about, as an application route. */
  readonly url: string | null;
}

export interface SupplyRow {
  /** `model:<id>`, `category:<id>` or `softwareProduct:<id>`, as the onboarding plan keys. */
  readonly key: string;
  readonly target: {
    readonly type: 'model' | 'category' | 'softwareProduct';
    readonly id: string;
    readonly name: string;
  };
  /** device, accessory, consumable, component, or entitlement. */
  readonly kind: string;
  /** Per source, the sum of its entries' quantities. */
  readonly totals: Readonly<Record<SupplyEntry['kind'], number>>;
  readonly supply: number;
  readonly demand: number;
  /** Supply less demand; null where seats are unlimited. */
  readonly balance: number | null;
  /** When short: the last day to order it in time. */
  readonly orderBy: string | null;
  /** Where it was last bought, for an order proposed from here. */
  readonly vendorId: string | null;
  /**
   * What a purchase line for it would be: the stock kind or device for a
   * model, perpetual or subscription for software (its latest entitlement's
   * kind); null for a category, which is bought by choosing a model.
   */
  readonly itemType: string | null;
  readonly entries: readonly SupplyEntry[];
}

export interface SupplyDemand {
  readonly today: string;
  readonly until: string;
  readonly rows: readonly SupplyRow[];
}

/** Purchase orders not yet over: what is asked for or on its way. */
const OPEN_ORDERS = [
  'draft',
  'pendingApproval',
  'approved',
  'ordered',
  'partiallyReceived',
];
const WITHDRAWN = ['cancelled', 'rejected'];

const SOURCES: readonly SupplyEntry['kind'][] = [
  'stock',
  'order',
  'repair',
  'return',
  'joiner',
  'minimum',
  'expiring',
  'replacement',
];

export async function supplyDemand(
  dependencies: {
    readonly database: DatabaseManager;
    readonly onboarding?: OnboardingService;
    readonly settings: SettingsService;
  },
  options: { readonly days: number; readonly replacements: boolean },
): Promise<SupplyDemand> {
  const { database, onboarding, settings } = dependencies;
  const q = () => database.query();
  const now = today();
  const until = addDays(now, options.days);
  const thresholds = await settings.get('thresholds');
  const prepDays = Math.max(0, Number(thresholds.onboardingPrepDays) || 0);
  const leadDays = Math.max(0, Number(thresholds.purchaseLeadDays) || 0);
  const within = (date: string | null) => !date || date.slice(0, 10) <= until;

  const rows = new Map<
    string,
    {
      target: SupplyRow['target'];
      kind: string;
      entries: SupplyEntry[];
      unlimited: boolean;
      itemType: string | null;
      needs: string[];
    }
  >();
  const names = {
    models: new Map<string, string>(),
    products: new Map<string, string>(),
  };
  const rowOf = (
    type: SupplyRow['target']['type'],
    id: string,
    kind: string,
  ) => {
    const key = `${type}:${id}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        target: { type, id, name: '' },
        kind,
        entries: [],
        unlimited: false,
        itemType: type === 'category' ? null : kind,
        needs: [],
      };
      rows.set(key, row);
    }
    return row;
  };
  const add = (
    type: 'model' | 'softwareProduct',
    id: string | null,
    kind: string,
    entry: SupplyEntry,
  ) => {
    if (!id || entry.quantity === 0) return;
    rowOf(type, id, kind).entries.push(entry);
  };
  const deviceLabel = (row: Row) =>
    [asText(row.deviceNo), asText(row.name)].filter(Boolean).join(' / ');

  // Devices on an open disposal, a draft included, are on their way out.
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

  // Stock: devices in stock and free.
  for (const row of await q()
    .selectFrom('devices')
    .select(['id', 'deviceNo', 'name', 'modelId'])
    .where('status', '=', 'inStock')
    .where('reservedForId', 'is', null)
    .execute<Row>())
    if (!disposing.has(String(row.id)))
      add('model', asText(row.modelId) ?? null, 'device', {
        kind: 'stock',
        quantity: 1,
        label: deviceLabel(row),
        date: null,
        url: `/devices/${String(row.id)}`,
      });

  // Stock items: what is on hand, and the level kept back.
  const stockItems = await q()
    .selectFrom('stockItems')
    .select([
      'id',
      'name',
      'kind',
      'modelId',
      'totalQuantity',
      'usedQuantity',
      'minimumQuantity',
    ])
    .where('modelId', 'is not', null)
    .execute<Row>();
  const STOCK_ROUTES: Readonly<Record<string, string>> = {
    accessory: 'accessories',
    consumable: 'consumables',
    component: 'components',
  };
  const stockKind = new Map<string, string>();
  for (const item of stockItems) {
    const kind = asText(item.kind) ?? 'accessory';
    const modelId = String(item.modelId);
    stockKind.set(modelId, kind);
    const url = `/${STOCK_ROUTES[kind] ?? 'accessories'}/${String(item.id)}`;
    const available =
      (Number(item.totalQuantity) || 0) - (Number(item.usedQuantity) || 0);
    add('model', modelId, kind, {
      kind: 'stock',
      quantity: Math.max(0, available),
      label: String(item.name),
      date: null,
      url,
    });
    add('model', modelId, kind, {
      kind: 'minimum',
      quantity: -(Number(item.minimumQuantity) || 0),
      label: String(item.name),
      date: null,
      url,
    });
  }

  // Seats: those free on entitlements still running, and those lost when a
  // subscription ends unrenewed within the window.
  for (const row of await q()
    .selectFrom('entitlements')
    .select([
      'id',
      'name',
      'kind',
      'softwareProductId',
      'seatCount',
      'assignedCount',
      'expiryDate',
      'autoRenew',
    ])
    .where('softwareProductId', 'is not', null)
    .execute<Row>()) {
    const productId = String(row.softwareProductId);
    // The kind of an entitlement on the books, for a line buying more.
    const product = rowOf('softwareProduct', productId, 'entitlement');
    if (product.itemType === 'entitlement')
      product.itemType =
        asText(row.kind) === 'perpetual' ? 'perpetual' : 'subscription';
    const expiry = asText(row.expiryDate) ?? null;
    if (expiry && expiry.slice(0, 10) < now) continue;
    const url = `/entitlements/${String(row.id)}`;
    if (row.seatCount === null || row.seatCount === undefined) {
      rowOf('softwareProduct', productId, 'entitlement').unlimited = true;
      continue;
    }
    const seats = Number(row.seatCount) || 0;
    const assigned = Number(row.assignedCount) || 0;
    add('softwareProduct', productId, 'entitlement', {
      kind: 'stock',
      quantity: Math.max(0, seats - assigned),
      label: String(row.name),
      date: null,
      url,
    });
    const ends =
      asText(row.kind) === 'subscription' &&
      !row.autoRenew &&
      expiry !== null &&
      expiry.slice(0, 10) <= until;
    if (ends)
      add('softwareProduct', productId, 'entitlement', {
        kind: 'expiring',
        // What it had in use goes too: those people need a seat elsewhere.
        quantity: -seats,
        label: String(row.name),
        date: expiry,
        url,
      });
  }

  // Open purchase orders: what is still to arrive on them.
  const lastVendor = new Map<string, string>();
  for (const line of await q()
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
      'purchaseOrders.expectedAt as expectedAt',
      'purchaseOrders.neededBy as neededBy',
      'purchaseOrders.vendorId as vendorId',
      'purchaseOrders.createdAt as createdAt',
      'purchaseOrderLines.itemType as itemType',
      'purchaseOrderLines.modelId as modelId',
      'purchaseOrderLines.softwareProductId as softwareProductId',
      'purchaseOrderLines.quantity as quantity',
      'purchaseOrderLines.receivedQuantity as receivedQuantity',
    ])
    .where('purchaseOrders.status', 'not in', WITHDRAWN)
    .orderBy('purchaseOrders.createdAt', 'asc')
    .execute<Row>()) {
    const modelId = asText(line.modelId) ?? null;
    const productId = asText(line.softwareProductId) ?? null;
    const target = modelId
      ? `model:${modelId}`
      : `softwareProduct:${productId}`;
    // Oldest first, so the last one seen is the most recent.
    const vendorId = asText(line.vendorId);
    if (vendorId) lastVendor.set(target, vendorId);
    if (!OPEN_ORDERS.includes(String(line.status))) continue;
    const left =
      (Number(line.quantity) || 0) - (Number(line.receivedQuantity) || 0);
    const date =
      asText(line.expectedAt)?.slice(0, 10) ??
      asText(line.neededBy)?.slice(0, 10) ??
      null;
    if (left <= 0 || !within(date)) continue;
    const itemType = String(line.itemType);
    const entry: SupplyEntry = {
      kind: 'order',
      quantity: left,
      label: `${String(line.orderNo)}`,
      date,
      url: `/procurement/${String(line.orderId)}`,
    };
    if (modelId)
      add(
        'model',
        modelId,
        itemType === 'perpetual' || itemType === 'subscription'
          ? 'device'
          : itemType,
        entry,
      );
    else add('softwareProduct', productId, 'entitlement', entry);
  }

  // Devices at the repairer, back by the expected return date.
  for (const row of await q()
    .selectFrom('repairs')
    .innerJoin('devices', 'devices.id', 'repairs.deviceId')
    .select([
      'devices.id as id',
      'devices.deviceNo as deviceNo',
      'devices.name as name',
      'devices.modelId as modelId',
      'repairs.expectedReturnAt as expectedReturnAt',
    ])
    .where('repairs.actualReturnAt', 'is', null)
    .where('devices.status', '=', 'inRepair')
    .execute<Row>()) {
    const date = asText(row.expectedReturnAt)?.slice(0, 10) ?? null;
    if (!date || !within(date) || disposing.has(String(row.id))) continue;
    add('model', asText(row.modelId) ?? null, 'device', {
      kind: 'repair',
      quantity: 1,
      label: deviceLabel(row),
      date,
      url: `/devices/${String(row.id)}`,
    });
  }

  // What people leaving hand back: devices, reusable stock, seats.
  const leavers = new Map(
    (
      await q()
        .selectFrom('people')
        .select(['id', 'name', 'leaveDate'])
        .where('leaveDate', 'is not', null)
        .where('leaveDate', '<=', until)
        .execute<Row>()
    ).map((row) => [String(row.id), row]),
  );
  const backOn = (personId: string, days: number) => {
    const leave = asText(leavers.get(personId)?.leaveDate)?.slice(0, 10) ?? now;
    return addDays(leave > now ? leave : now, days);
  };
  const leaverName = (personId: string) =>
    asText(leavers.get(personId)?.name) ?? '';
  if (leavers.size > 0) {
    const ids = [...leavers.keys()];
    for (const row of await q()
      .selectFrom('devices')
      .select([
        'id',
        'deviceNo',
        'name',
        'modelId',
        'assigneeId',
        'plannedReplacementDate',
        'warrantyEndDate',
      ])
      .where('assigneeType', '=', 'person')
      .where('assigneeId', 'in', ids)
      .where('status', 'in', ['inUse', 'onLoan'])
      .execute<Row>()) {
      const date = backOn(String(row.assigneeId), prepDays);
      // Due for replacement or out of warranty by then: not handed on.
      const replaced = asText(row.plannedReplacementDate)?.slice(0, 10);
      const warranty = asText(row.warrantyEndDate)?.slice(0, 10);
      if (!within(date) || (replaced && replaced <= date)) continue;
      if (warranty && warranty < date) continue;
      add('model', asText(row.modelId) ?? null, 'device', {
        kind: 'return',
        quantity: 1,
        label: `${deviceLabel(row)}（${leaverName(String(row.assigneeId))}）`,
        date,
        url: `/devices/${String(row.id)}`,
      });
    }
    const itemModels = new Map(
      stockItems.map((item) => [String(item.id), item]),
    );
    for (const row of await q()
      .selectFrom('stockHoldings')
      .select(['stockItemId', 'holderId', 'quantity'])
      .where('holderType', '=', 'person')
      .where('holderId', 'in', ids)
      .execute<Row>()) {
      const item = itemModels.get(String(row.stockItemId));
      // A consumable is used up, and a component sits in a device.
      if (!item || asText(item.kind) !== 'accessory') continue;
      const date = backOn(String(row.holderId), 0);
      if (!within(date)) continue;
      add('model', String(item.modelId), 'accessory', {
        kind: 'return',
        quantity: Number(row.quantity) || 0,
        label: `${String(item.name)}（${leaverName(String(row.holderId))}）`,
        date,
        url: `/accessories/${String(item.id)}`,
      });
    }
    for (const row of await q()
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
        'entitlementSeats.holderId as holderId',
      ])
      .where('entitlementSeats.holderType', '=', 'person')
      .where('entitlementSeats.holderId', 'in', ids)
      .where('entitlementSeats.releasedAt', 'is', null)
      .execute<Row>()) {
      const date = backOn(String(row.holderId), 0);
      if (!within(date)) continue;
      add(
        'softwareProduct',
        asText(row.softwareProductId) ?? null,
        'entitlement',
        {
          kind: 'return',
          quantity: 1,
          label: `${String(row.name)}（${leaverName(String(row.holderId))}）`,
          date,
          url: `/entitlements/${String(row.id)}`,
        },
      );
    }
  }

  // What joiners starting within the window still need.
  const plans: ReadonlyMap<string, OnboardingPlan> = onboarding
    ? await onboarding.plans()
    : new Map();
  if (plans.size > 0) {
    const people = new Map(
      (
        await q()
          .selectFrom('people')
          .select(['id', 'name'])
          .where('id', 'in', [...plans.keys()])
          .execute<Row>()
      ).map((row) => [String(row.id), String(row.name)]),
    );
    for (const [personId, plan] of plans) {
      if (isPrepared(plan)) continue;
      const hireDate = plan.hireDate?.slice(0, 10) ?? null;
      if (!within(hireDate)) continue;
      for (const line of plan.lines) {
        if (line.waived) continue;
        // A kit item for any model of a category draws on stock no model
        // row can show; it counts only what the plan itself finds uncovered.
        const missing =
          line.target.type === 'category'
            ? line.shortfall
            : line.required - line.preparedCount;
        if (missing <= 0) continue;
        const type = line.target.type;
        const kind =
          line.kind === 'entitlement'
            ? 'entitlement'
            : (line.itemType ?? 'device');
        const row = rowOf(type, line.target.id, kind);
        if (line.itemType && row.itemType === 'entitlement')
          row.itemType = line.itemType;
        row.target = { ...row.target, name: line.target.name };
        if (hireDate) row.needs.push(hireDate);
        row.entries.push({
          kind: 'joiner',
          quantity: -missing,
          label: people.get(personId) ?? '',
          date: hireDate,
          url: `/people/${personId}/holdings`,
        });
      }
    }
  }

  // Devices due for replacement within the window, when asked.
  if (options.replacements)
    for (const row of await q()
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'name', 'modelId', 'plannedReplacementDate'])
      .where('status', 'in', ['inUse', 'onLoan'])
      .where('plannedReplacementDate', 'is not', null)
      .where('plannedReplacementDate', '<=', until)
      .execute<Row>()) {
      const date = asText(row.plannedReplacementDate)?.slice(0, 10) ?? null;
      const modelId = asText(row.modelId) ?? null;
      if (!modelId) continue;
      const target = rowOf('model', modelId, 'device');
      if (date) target.needs.push(date > now ? date : now);
      target.entries.push({
        kind: 'replacement',
        quantity: -1,
        label: deviceLabel(row),
        date,
        url: `/devices/${String(row.id)}`,
      });
    }

  // Names, for rows that met no joiner line.
  const modelIds = [...rows.values()]
    .filter((row) => row.target.type === 'model' && !row.target.name)
    .map((row) => row.target.id);
  if (modelIds.length > 0)
    for (const row of await q()
      .selectFrom('models')
      .select(['id', 'name'])
      .where('id', 'in', modelIds)
      .execute<Row>())
      names.models.set(String(row.id), String(row.name));
  const productIds = [...rows.values()]
    .filter((row) => row.target.type === 'softwareProduct' && !row.target.name)
    .map((row) => row.target.id);
  if (productIds.length > 0)
    for (const row of await q()
      .selectFrom('softwareProducts')
      .select(['id', 'name'])
      .where('id', 'in', productIds)
      .execute<Row>())
      names.products.set(String(row.id), String(row.name));

  const result: SupplyRow[] = [];
  for (const [key, row] of rows) {
    const totals = Object.fromEntries(
      SOURCES.map((source) => [
        source,
        row.entries
          .filter((entry) => entry.kind === source)
          .reduce((sum, entry) => sum + entry.quantity, 0),
      ]),
    ) as Record<SupplyEntry['kind'], number>;
    const supply = row.entries
      .filter((entry) => entry.quantity > 0)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const demand = -row.entries
      .filter((entry) => entry.quantity < 0)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    // Nothing coming or going: not worth a row.
    if (supply === 0 && demand === 0) continue;
    const balance = row.unlimited ? null : supply - demand;
    const firstNeed = [...row.needs].sort()[0] ?? null;
    // Below the minimum level alone, it is wanted now.
    const orderBy =
      balance !== null && balance < 0
        ? firstNeed
          ? addDays(
              firstNeed,
              -(leadDays + (row.kind === 'device' ? prepDays : 0)),
            )
          : now
        : null;
    result.push({
      key,
      target: {
        ...row.target,
        name:
          row.target.name ||
          (row.target.type === 'model'
            ? names.models.get(row.target.id)
            : names.products.get(row.target.id)) ||
          row.target.id,
      },
      kind:
        row.target.type === 'model'
          ? (stockKind.get(row.target.id) ?? row.kind)
          : row.kind,
      totals,
      supply,
      demand,
      balance,
      orderBy,
      vendorId: lastVendor.get(key) ?? null,
      itemType:
        row.target.type === 'model'
          ? (stockKind.get(row.target.id) ?? row.itemType)
          : row.itemType === 'entitlement'
            ? 'subscription'
            : row.itemType,
      entries: [...row.entries].sort((a, b) =>
        (a.date ?? '').localeCompare(b.date ?? ''),
      ),
    });
  }
  // Short first, the most pressing first; then the rest by name.
  result.sort(
    (a, b) =>
      Number((b.balance ?? 0) < 0) - Number((a.balance ?? 0) < 0) ||
      (a.orderBy ?? '9999').localeCompare(b.orderBy ?? '9999') ||
      a.target.name.localeCompare(b.target.name),
  );
  return { today: now, until, rows: result };
}
