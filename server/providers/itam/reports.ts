import { entitlementPurchaseCosts } from './entitlements.js';
import { stockUnitPrices } from './stock.js';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, SelectQuery } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { DEVICE_STATUSES } from './device-status.js';
import { compileAuthzScope } from './authz-filter.js';
import { asText, decodeRow, type Row } from './collection-query.js';
import { ValidationError } from './errors.js';
import type { SettingsService } from './settings.js';
import { subtreeIds } from './tree-scope.js';
import { isoDate } from './dates.js';

/**
 * The preset reports and the workbench overview. Every report takes the same
 * filters (period, location subtree, department subtree, category) and
 * returns named sections of rows, so the client renders and exports them the
 * same way. Device rows honour the caller's record filter; cost columns are
 * dropped when the caller may not read cost fields.
 */
export const REPORT_NAMES = [
  'overview',
  'ledger',
  'distribution',
  'costs',
  'perPersonCost',
  'expiry',
  'softwareCompliance',
  'repairs',
  'auditResults',
  'changes',
] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export interface ReportFilters {
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: string;
  readonly departmentId?: string;
  readonly categoryId?: string;
}

export interface ReportSection {
  readonly key: string;
  readonly columns: readonly string[];
  readonly rows: readonly Row[];
}

export interface ReportResult {
  readonly name: ReportName;
  readonly filters: ReportFilters;
  readonly generatedAt: string;
  readonly canSeeCost: boolean;
  readonly sections: readonly ReportSection[];
  readonly totals: Readonly<Record<string, number | string | null>>;
}

export interface ReportService {
  run(
    name: ReportName,
    filters: ReportFilters,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ReportResult>;
}

export const reportServiceToken: ServiceToken<ReportService> =
  createServiceToken<ReportService>('itam/report-service');

const DAY = 86_400_000;
const monthOf = (value: unknown): string => (asText(value) ?? '').slice(0, 7);
const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number): number => Math.round(value * 100) / 100;
/** When an entitlement ends: a subscription's expiry, a perpetual one's maintenance end. */
const entitlementEnd = (row: Row): string | null =>
  asText(
    row.kind === 'subscription' ? row.expiryDate : row.maintenanceExpiryDate,
  ) ?? null;
const inPeriod = (
  date: unknown,
  scope: { readonly from: string; readonly to: string },
): boolean => {
  const value = asText(date);
  return Boolean(value && value >= scope.from && value <= scope.to);
};

interface Scope {
  readonly from: string;
  readonly to: string;
  readonly locationIds?: readonly string[];
  readonly departmentIds?: readonly string[];
  readonly categoryId?: string;
}

export function createReportService(
  database: DatabaseManager,
  settings: SettingsService,
): ReportService {
  const resolveScope = async (filters: ReportFilters): Promise<Scope> => {
    const today = new Date();
    const from =
      filters.from ??
      isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const to = filters.to ?? isoDate(today);
    if (to < from) throw new ValidationError('to is before from', 'to');
    return {
      from,
      to,
      locationIds: filters.locationId
        ? await subtreeIds(database, 'locations', [filters.locationId])
        : undefined,
      departmentIds: filters.departmentId
        ? await subtreeIds(database, 'departments', [filters.departmentId])
        : undefined,
      categoryId: filters.categoryId,
    };
  };

  /** Non-disposed devices under the caller's filter and the report scope. */
  const scopedDevices = (
    scope: Scope,
    conditions: DatabaseAuthorizationConditions,
    includeDisposed = false,
  ): SelectQuery => {
    let query = database
      .query()
      .selectFrom('devices')
      .where((eb) => compileAuthzScope(eb, conditions.scope));
    if (!includeDisposed) query = query.where('status', '!=', 'disposed');
    if (scope.locationIds)
      query = query.where(
        'locationId',
        'in',
        scope.locationIds.length ? [...scope.locationIds] : ['__none__'],
      );
    if (scope.departmentIds)
      query = query.where(
        'departmentId',
        'in',
        scope.departmentIds.length ? [...scope.departmentIds] : ['__none__'],
      );
    if (scope.categoryId)
      query = query.where('categoryId', '=', scope.categoryId);
    return query;
  };

  const names = async (table: string, ids: readonly string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map<string, string>();
    const rows = await database
      .query()
      .selectFrom(table)
      .select(['id', 'name'])
      .where('id', 'in', unique)
      .execute<{ id: string; name: string }>();
    return new Map(rows.map((row) => [row.id, row.name]));
  };

  const groupBy = (
    rows: readonly Row[],
    key: (row: Row) => string,
    value: (row: Row) => number = () => 1,
  ): Map<string, number> => {
    const result = new Map<string, number>();
    for (const row of rows) {
      const bucket = key(row);
      result.set(bucket, (result.get(bucket) ?? 0) + value(row));
    }
    return result;
  };

  const ageBucket = (purchaseDate: unknown, today: Date): string => {
    const purchased = asText(purchaseDate);
    if (!purchased) return 'unknown';
    const years =
      (today.getTime() - new Date(purchased).getTime()) / (365 * DAY);
    if (years < 1) return '<1';
    if (years < 2) return '1-2';
    if (years < 3) return '2-3';
    if (years < 4) return '3-4';
    return '>4';
  };

  const monthlyDepreciation = (device: Row): number => {
    if (device.depreciationMethod !== 'straightLine') return 0;
    const price = num(device.purchasePrice);
    const months = num(device.usefulLifeMonths);
    if (price <= 0 || months <= 0) return 0;
    const residual = price * num(device.residualRate);
    return (price - residual) / months;
  };

  const monthsBetween = (from: string, to: string): number =>
    Math.max(
      1,
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
        (Number(to.slice(5, 7)) - Number(from.slice(5, 7))) +
        1,
    );

  const builders: Record<
    ReportName,
    (
      scope: Scope,
      conditions: DatabaseAuthorizationConditions,
      canSeeCost: boolean,
    ) => Promise<{
      sections: ReportSection[];
      totals: Record<string, number | string | null>;
    }>
  > = {
    async overview(scope, conditions, canSeeCost) {
      const today = new Date();
      const devices = (
        await scopedDevices(scope, conditions, true).selectAll().execute<Row>()
      ).map((row) => decodeRow(row));
      const live = devices.filter((device) => device.status !== 'disposed');
      const inUse = live.filter(
        (device) => device.status === 'inUse' || device.status === 'onLoan',
      );
      const byStatus = DEVICE_STATUSES.map((status) => ({
        status,
        count: devices.filter((device) => device.status === status).length,
      }));
      const created = devices.filter(
        (device) =>
          isoDate(new Date(String(device.createdAt))) >= scope.from &&
          isoDate(new Date(String(device.createdAt))) <= scope.to,
      ).length;
      const disposals = await database
        .query()
        .selectFrom('disposals')
        .select((eb) => [
          eb.fn.sum('deviceCount').as('devices'),
          eb.fn.sum('proceeds').as('proceeds'),
        ])
        .where('status', '=', 'executed')
        .where('disposedAt', '>=', scope.from)
        .where('disposedAt', '<=', scope.to)
        .executeTakeFirst<{ devices: unknown; proceeds: unknown }>();
      const purchaseSpend = live
        .filter((device) => inPeriod(device.purchaseDate, scope))
        .reduce((sum, device) => sum + num(device.purchasePrice), 0);
      const repairSpend = await database
        .query()
        .selectFrom('repairs')
        .select((eb) => [eb.fn.sum('cost').as('total')])
        .where('actualReturnAt', '>=', scope.from)
        .where('actualReturnAt', '<=', scope.to)
        .executeTakeFirst<{ total: unknown }>();
      const departmentNames = await names(
        'departments',
        live.map((device) => asText(device.departmentId) ?? ''),
      );
      const locationNames = await names(
        'locations',
        live.map((device) => asText(device.locationId) ?? ''),
      );
      const byDepartment = [
        ...groupBy(live, (device) => asText(device.departmentId) ?? ''),
      ].map(([id, count]) => ({
        id,
        name: departmentNames.get(id) ?? '—',
        count,
        bookValue: canSeeCost
          ? round(
              live
                .filter((device) => (asText(device.departmentId) ?? '') === id)
                .reduce((sum, device) => sum + num(device.bookValue), 0),
            )
          : null,
      }));
      const byLocation = [
        ...groupBy(live, (device) => asText(device.locationId) ?? ''),
      ].map(([id, count]) => ({
        id,
        name: locationNames.get(id) ?? '—',
        count,
        bookValue: canSeeCost
          ? round(
              live
                .filter((device) => (asText(device.locationId) ?? '') === id)
                .reduce((sum, device) => sum + num(device.bookValue), 0),
            )
          : null,
      }));
      const byAge = ['<1', '1-2', '2-3', '3-4', '>4', 'unknown'].map(
        (bucket) => ({
          bucket,
          count: live.filter(
            (device) => ageBucket(device.purchaseDate, today) === bucket,
          ).length,
        }),
      );
      const entitlementStatuses = await database
        .query()
        .selectFrom('entitlements')
        .select(['complianceStatus'])
        .execute<Row>();
      const compliance = [
        ...groupBy(
          entitlementStatuses,
          (row) => asText(row.complianceStatus) ?? 'unknown',
        ),
      ].map(([status, count]) => ({ status, count }));
      const horizon = isoDate(new Date(today.getTime() + 365 * DAY));
      const forecast = new Map<
        string,
        {
          warranty: number;
          entitlements: number;
          replacements: number;
        }
      >();
      const bump = (
        month: string,
        key: 'warranty' | 'entitlements' | 'replacements',
      ) => {
        if (month < isoDate(today).slice(0, 7) || month > horizon.slice(0, 7))
          return;
        const entry = forecast.get(month) ?? {
          warranty: 0,
          entitlements: 0,
          replacements: 0,
        };
        entry[key] += 1;
        forecast.set(month, entry);
      };
      for (const device of live) {
        if (device.warrantyEndDate)
          bump(monthOf(device.warrantyEndDate), 'warranty');
        if (device.plannedReplacementDate)
          bump(monthOf(device.plannedReplacementDate), 'replacements');
      }
      for (const entitlement of await database
        .query()
        .selectFrom('entitlements')
        .select(['kind', 'expiryDate', 'maintenanceExpiryDate'])
        .execute<Row>()) {
        const ends = entitlementEnd(entitlement);
        if (ends) bump(monthOf(ends), 'entitlements');
      }
      return {
        sections: [
          { key: 'byStatus', columns: ['status', 'count'], rows: byStatus },
          {
            key: 'byDepartment',
            columns: ['name', 'count', 'bookValue'],
            rows: byDepartment,
          },
          {
            key: 'byLocation',
            columns: ['name', 'count', 'bookValue'],
            rows: byLocation,
          },
          { key: 'byAge', columns: ['bucket', 'count'], rows: byAge },
          {
            key: 'licenseCompliance',
            columns: ['status', 'count'],
            rows: compliance,
          },
          {
            key: 'forecast',
            columns: ['month', 'warranty', 'entitlements', 'replacements'],
            rows: [...forecast]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, entry]) => ({ month, ...entry })),
          },
        ],
        totals: {
          devices: live.length,
          bookValue: canSeeCost
            ? round(
                live.reduce((sum, device) => sum + num(device.bookValue), 0),
              )
            : null,
          utilization:
            live.length === 0 ? 0 : round(inUse.length / live.length),
          createdInPeriod: created,
          disposedInPeriod: num(disposals?.devices),
          purchaseSpend: canSeeCost ? round(purchaseSpend) : null,
          repairSpend: canSeeCost ? round(num(repairSpend?.total)) : null,
          disposalProceeds: canSeeCost ? round(num(disposals?.proceeds)) : null,
        },
      };
    },

    async ledger(scope, conditions, canSeeCost) {
      const devices = (
        await scopedDevices(scope, conditions, true)
          .selectAll()
          .orderBy('deviceNo', 'asc')
          .limit(5000)
          .execute<Row>()
      ).map((row) => decodeRow(row));
      const modelNames = await names(
        'models',
        devices.map((a) => String(a.modelId)),
      );
      const locationNames = await names(
        'locations',
        devices.map((a) => String(a.locationId)),
      );
      const departmentNames = await names(
        'departments',
        devices.map((a) => asText(a.departmentId) ?? ''),
      );
      const stock = (
        await database
          .query()
          .selectFrom('stockItems')
          .selectAll()
          .orderBy('name')
          .limit(5000)
          .execute<Row>()
      ).map((r) => decodeRow(r));
      const entitlements = (
        await database
          .query()
          .selectFrom('entitlements')
          .selectAll()
          .orderBy('name')
          .limit(5000)
          .execute<Row>()
      ).map((r) => decodeRow(r));
      const cost = (value: unknown) => (canSeeCost ? value : null);
      const stockPrices = await stockUnitPrices(database);
      const entitlementCosts = await entitlementPurchaseCosts(database);
      return {
        sections: [
          {
            key: 'devices',
            columns: [
              'deviceNo',
              'name',
              'model',
              'status',
              'location',
              'department',
              'purchaseDate',
              'purchasePrice',
              'bookValue',
            ],
            rows: devices.map((a) => ({
              id: a.id,
              deviceNo: a.deviceNo,
              name: a.name,
              model: modelNames.get(String(a.modelId)) ?? '',
              status: a.status,
              location: locationNames.get(String(a.locationId)) ?? '',
              department:
                departmentNames.get(asText(a.departmentId) ?? '') ?? '',
              purchaseDate: a.purchaseDate,
              purchasePrice: cost(a.purchasePrice),
              bookValue: cost(a.bookValue),
            })),
          },
          {
            key: 'stock',
            columns: [
              'name',
              'kind',
              'totalQuantity',
              'usedQuantity',
              'unitPrice',
            ],
            rows: stock.map((s) => ({
              id: s.id,
              name: s.name,
              kind: s.kind,
              totalQuantity: s.totalQuantity,
              usedQuantity: s.usedQuantity,
              unitPrice: cost(stockPrices.get(String(s.id)) ?? null),
            })),
          },
          {
            key: 'entitlements',
            columns: [
              'name',
              'entitlementKind',
              'seatCount',
              'assignedCount',
              'complianceStatus',
              'expiryDate',
              'purchasePrice',
              'annualCost',
            ],
            rows: entitlements.map((e) => ({
              id: e.id,
              name: e.name,
              entitlementKind: e.kind,
              seatCount: e.seatCount,
              assignedCount: e.assignedCount,
              complianceStatus: e.complianceStatus,
              expiryDate: e.expiryDate,
              purchasePrice: cost(entitlementCosts.get(String(e.id)) ?? null),
              annualCost: cost(e.annualCost),
            })),
          },
        ],
        totals: {
          devices: devices.length,
          stock: stock.length,
          entitlements: entitlements.length,
        },
      };
    },

    async distribution(scope, conditions, canSeeCost) {
      const overview = await builders.overview(scope, conditions, canSeeCost);
      const live = await scopedDevices(scope, conditions)
        .select(['categoryId'])
        .execute<Row>();
      const categoryNames = await names(
        'categories',
        live.map((a) => String(a.categoryId)),
      );
      const byCategory = [...groupBy(live, (a) => String(a.categoryId))].map(
        ([id, count]) => ({ id, name: categoryNames.get(id) ?? '—', count }),
      );
      return {
        sections: [
          ...overview.sections.filter((section) =>
            ['byStatus', 'byLocation', 'byDepartment', 'byAge'].includes(
              section.key,
            ),
          ),
          { key: 'byCategory', columns: ['name', 'count'], rows: byCategory },
        ],
        totals: { devices: overview.totals.devices },
      };
    },

    async costs(scope, conditions, canSeeCost) {
      const devices = (
        await scopedDevices(scope, conditions, true).selectAll().execute<Row>()
      ).map((r) => decodeRow(r));
      const spendByMonth = groupBy(
        devices.filter((a) => inPeriod(a.purchaseDate, scope)),
        (a) => monthOf(a.purchaseDate),
        (a) => num(a.purchasePrice),
      );
      const live = devices.filter((a) => a.status !== 'disposed');
      const months = monthsBetween(scope.from, scope.to);
      const periodDepreciation = live.reduce(
        (sum, a) => sum + monthlyDepreciation(a) * months,
        0,
      );
      const subscriptions = await database
        .query()
        .selectFrom('entitlements')
        .select(['id', 'name', 'annualCost', 'billingCycle'])
        .where('kind', '=', 'subscription')
        .execute<Row>();
      const subscriptionAnnual = subscriptions.reduce(
        (sum, s) => sum + num(s.annualCost),
        0,
      );
      const hide = (rows: Row[]) => (canSeeCost ? rows : []);
      return {
        sections: [
          {
            key: 'spendByMonth',
            columns: ['month', 'amount'],
            rows: hide(
              [...spendByMonth]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, amount]) => ({ month, amount: round(amount) })),
            ),
          },
          {
            key: 'subscriptions',
            columns: ['name', 'billingCycle', 'annualCost'],
            rows: hide(
              subscriptions.map((s) => ({
                id: s.id,
                name: s.name,
                billingCycle: s.billingCycle,
                annualCost: s.annualCost,
              })),
            ),
          },
        ],
        totals: {
          purchaseSpend: canSeeCost
            ? round([...spendByMonth.values()].reduce((a, b) => a + b, 0))
            : null,
          bookValue: canSeeCost
            ? round(live.reduce((sum, a) => sum + num(a.bookValue), 0))
            : null,
          periodDepreciation: canSeeCost ? round(periodDepreciation) : null,
          subscriptionAnnualCost: canSeeCost ? round(subscriptionAnnual) : null,
        },
      };
    },

    async perPersonCost(scope, conditions, canSeeCost) {
      const devices = (
        await scopedDevices(scope, conditions).selectAll().execute<Row>()
      ).map((r) => decodeRow(r));
      const people = await database
        .query()
        .selectFrom('people')
        .select(['id', 'name', 'departmentId'])
        .where('employmentStatus', '!=', 'left')
        .execute<Row>();
      // One join for both kinds: a perpetual seat costs its share of the
      // purchase price spread over three years, a subscription seat its
      // share of the annualised cost.
      const seats = await database
        .query()
        .selectFrom('entitlementSeats')
        .innerJoin(
          'entitlements',
          'entitlements.id',
          'entitlementSeats.entitlementId',
        )
        .select([
          'entitlementSeats.holderId as holderId',
          'entitlements.id as entitlementId',
          'entitlements.kind as kind',
          'entitlements.annualCost as annualCost',
          'entitlements.seatCount as seatCount',
        ])
        .where('entitlementSeats.holderType', '=', 'person')
        .where('entitlementSeats.releasedAt', 'is', null)
        .execute<Row>();
      const stockPrices = await stockUnitPrices(database);
      const entitlementCosts = await entitlementPurchaseCosts(database);
      const stock = await database
        .query()
        .selectFrom('stockHoldings')
        .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
        .select([
          'stockHoldings.holderId as holderId',
          'stockHoldings.quantity as quantity',
          'stockItems.id as stockItemId',
        ])
        .where('stockHoldings.holderType', '=', 'person')
        .execute<Row>();
      const perSeat = (price: unknown, seatCount: unknown) =>
        num(seatCount) > 0 ? num(price) / num(seatCount) : 0;
      const perPerson = people.map((person) => {
        const id = String(person.id);
        const held = devices.filter(
          (a) => a.assigneeType === 'person' && a.assigneeId === id,
        );
        const depreciation = held.reduce(
          (sum, a) => sum + monthlyDepreciation(a) * 12,
          0,
        );
        const heldSeats = seats.filter((s) => s.holderId === id);
        const licenseCost = heldSeats
          .filter((s) => s.kind === 'perpetual')
          .reduce(
            (sum, s) =>
              sum +
              perSeat(
                entitlementCosts.get(String(s.entitlementId)) ?? 0,
                s.seatCount,
              ) /
                3,
            0,
          );
        const subscriptionCost = heldSeats
          .filter((s) => s.kind === 'subscription')
          .reduce((sum, s) => sum + perSeat(s.annualCost, s.seatCount), 0);
        const stockCost = stock
          .filter((s) => s.holderId === id)
          .reduce(
            (sum, s) =>
              sum +
              num(s.quantity) * (stockPrices.get(String(s.stockItemId)) ?? 0),
            0,
          );
        return {
          id,
          name: person.name,
          departmentId: person.departmentId,
          devices: held.length,
          annualDepreciation: round(depreciation),
          licenseCost: round(licenseCost),
          subscriptionCost: round(subscriptionCost),
          stockCost: round(stockCost),
          total: round(
            depreciation + licenseCost + subscriptionCost + stockCost,
          ),
        };
      });
      const departmentNames = await names(
        'departments',
        people.map((p) => asText(p.departmentId) ?? ''),
      );
      const byDepartment = [
        ...groupBy(perPerson, (p) => asText(p.departmentId) ?? ''),
      ].map(([id, headcount]) => {
        const members = perPerson.filter(
          (p) => (asText(p.departmentId) ?? '') === id,
        );
        const total = members.reduce((sum, p) => sum + p.total, 0);
        return {
          id,
          name: departmentNames.get(id) ?? '—',
          headcount,
          total: round(total),
          perHead: round(headcount ? total / headcount : 0),
        };
      });
      const hide = (rows: Row[]) => (canSeeCost ? rows : []);
      return {
        sections: [
          {
            key: 'byDepartment',
            columns: ['name', 'headcount', 'total', 'perHead'],
            rows: hide(byDepartment),
          },
          {
            key: 'byPerson',
            columns: [
              'name',
              'devices',
              'annualDepreciation',
              'licenseCost',
              'subscriptionCost',
              'stockCost',
              'total',
            ],
            rows: hide(perPerson.sort((a, b) => b.total - a.total)),
          },
        ],
        totals: {
          headcount: perPerson.length,
          annualTotal: canSeeCost
            ? round(perPerson.reduce((sum, p) => sum + p.total, 0))
            : null,
          perHead:
            canSeeCost && perPerson.length
              ? round(
                  perPerson.reduce((sum, p) => sum + p.total, 0) /
                    perPerson.length,
                )
              : null,
        },
      };
    },

    async expiry(scope, conditions) {
      const today = isoDate(new Date());
      const horizon = isoDate(new Date(Date.now() + 365 * DAY));
      const devices = await scopedDevices(scope, conditions)
        .select(['id', 'deviceNo', 'name', 'warrantyEndDate'])
        .where('warrantyEndDate', '>=', today)
        .where('warrantyEndDate', '<=', horizon)
        .orderBy('warrantyEndDate')
        .execute<Row>();
      // A subscription ends at its expiry, a perpetual entitlement at its
      // maintenance end; the report lists that date as `expiryDate`.
      const entitlements = (
        await database
          .query()
          .selectFrom('entitlements')
          .select(['id', 'kind', 'name', 'expiryDate', 'maintenanceExpiryDate'])
          .execute<Row>()
      )
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          name: e.name,
          expiryDate: entitlementEnd(e),
        }))
        .filter(
          (e) =>
            e.expiryDate && e.expiryDate >= today && e.expiryDate <= horizon,
        )
        .sort((a, b) =>
          String(a.expiryDate).localeCompare(String(b.expiryDate)),
        );
      const months = new Map<
        string,
        { warranty: number; entitlements: number }
      >();
      const bump = (month: string, key: 'warranty' | 'entitlements') => {
        const entry = months.get(month) ?? {
          warranty: 0,
          entitlements: 0,
        };
        entry[key] += 1;
        months.set(month, entry);
      };
      devices.forEach((a) => bump(monthOf(a.warrantyEndDate), 'warranty'));
      entitlements.forEach((e) => bump(monthOf(e.expiryDate), 'entitlements'));
      return {
        sections: [
          {
            key: 'byMonth',
            columns: ['month', 'warranty', 'entitlements'],
            rows: [...months]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, entry]) => ({ month, ...entry })),
          },
          {
            key: 'warranty',
            columns: ['deviceNo', 'name', 'warrantyEndDate'],
            rows: devices,
          },
          {
            key: 'entitlements',
            columns: ['name', 'entitlementKind', 'expiryDate'],
            rows: entitlements.map((e) => ({ ...e, entitlementKind: e.kind })),
          },
        ],
        totals: {
          warranty: devices.length,
          entitlements: entitlements.length,
        },
      };
    },

    async softwareCompliance() {
      const entitlements = await database
        .query()
        .selectFrom('entitlements')
        .selectAll()
        .orderBy('name')
        .execute<Row>();
      const rows = entitlements.map((l) => ({
        id: l.id,
        name: l.name,
        entitlementKind: l.kind,
        seatCount: num(l.seatCount),
        assignedCount: num(l.assignedCount),
        complianceStatus: l.complianceStatus,
        overBy: Math.max(0, num(l.assignedCount) - num(l.seatCount)),
        idle: Math.max(0, num(l.seatCount) - num(l.assignedCount)),
      }));
      return {
        sections: [
          {
            key: 'entitlements',
            columns: [
              'name',
              'entitlementKind',
              'seatCount',
              'assignedCount',
              'complianceStatus',
            ],
            rows,
          },
          {
            key: 'overAllocated',
            columns: ['name', 'seatCount', 'assignedCount', 'overBy'],
            rows: rows.filter((r) => r.overBy > 0),
          },
          {
            key: 'idle',
            columns: ['name', 'seatCount', 'assignedCount', 'idle'],
            rows: rows.filter((r) => r.idle > 0),
          },
        ],
        totals: {
          entitlements: rows.length,
          seats: rows.reduce((sum, r) => sum + r.seatCount, 0),
          assigned: rows.reduce((sum, r) => sum + r.assignedCount, 0),
          overAllocated: rows.filter((r) => r.overBy > 0).length,
        },
      };
    },

    async repairs(scope, _conditions, canSeeCost) {
      const repairs = (
        await database
          .query()
          .selectFrom('repairs')
          .selectAll()
          .where('sentAt', '>=', scope.from)
          .where('sentAt', '<=', scope.to)
          .execute<Row>()
      ).map((r) => decodeRow(r));
      const deviceModels = await database
        .query()
        .selectFrom('devices')
        .select(['id', 'modelId'])
        .where(
          'id',
          'in',
          repairs.length
            ? repairs.map((r) => String(r.deviceId))
            : ['__none__'],
        )
        .execute<Row>();
      const modelOf = new Map(
        deviceModels.map((a) => [String(a.id), String(a.modelId)]),
      );
      const modelNames = await names('models', [...modelOf.values()]);
      const modelTotals = groupBy(
        await database
          .query()
          .selectFrom('devices')
          .select(['modelId'])
          .where('status', '!=', 'disposed')
          .execute<Row>(),
        (a) => String(a.modelId),
      );
      const byModel = [
        ...groupBy(repairs, (r) => modelOf.get(String(r.deviceId)) ?? ''),
      ].map(([modelId, count]) => ({
        id: modelId,
        name: modelNames.get(modelId) ?? '—',
        repairs: count,
        devices: modelTotals.get(modelId) ?? 0,
        failureRate: modelTotals.get(modelId)
          ? round(count / (modelTotals.get(modelId) ?? 1))
          : null,
      }));
      const vendorNames = await names(
        'vendors',
        repairs.map((r) => asText(r.vendorId) ?? ''),
      );
      const byVendor = [
        ...groupBy(
          repairs.filter((r) => r.vendorId),
          (r) => String(r.vendorId),
        ),
      ].map(([vendorId, count]) => {
        const rows = repairs.filter((r) => String(r.vendorId) === vendorId);
        const finished = rows.filter((r) => r.actualReturnAt);
        const days = finished.reduce(
          (sum, r) =>
            sum +
            (new Date(String(r.actualReturnAt)).getTime() -
              new Date(String(r.sentAt)).getTime()) /
              DAY,
          0,
        );
        return {
          id: vendorId,
          name: vendorNames.get(vendorId) ?? '—',
          repairs: count,
          cost: canSeeCost
            ? round(rows.reduce((sum, r) => sum + num(r.cost), 0))
            : null,
          averageDays: finished.length ? round(days / finished.length) : null,
          repaired: rows.filter((r) => r.result === 'repaired').length,
        };
      });
      return {
        sections: [
          {
            key: 'byModel',
            columns: ['name', 'devices', 'repairs', 'failureRate'],
            rows: byModel,
          },
          {
            key: 'byVendor',
            columns: ['name', 'repairs', 'repaired', 'averageDays', 'cost'],
            rows: byVendor,
          },
        ],
        totals: {
          repairs: repairs.length,
          repairCost: canSeeCost
            ? round(repairs.reduce((sum, r) => sum + num(r.cost), 0))
            : null,
        },
      };
    },

    async auditResults(scope) {
      const tasks = (
        await database
          .query()
          .selectFrom('auditTasks')
          .selectAll()
          .where('plannedStart', '<=', scope.to)
          .where('plannedEnd', '>=', scope.from)
          .orderBy('plannedStart', 'desc')
          .execute<Row>()
      ).map((r) => decodeRow(r, { jsonFields: ['scope', 'executorIds'] }));
      const items = await database
        .query()
        .selectFrom('auditItems')
        .select(['auditTaskId', 'result', 'resolution'])
        .where(
          'auditTaskId',
          'in',
          tasks.length ? tasks.map((t) => String(t.id)) : ['__none__'],
        )
        .execute<Row>();
      const rows = tasks.map((task) => {
        const mine = items.filter((i) => i.auditTaskId === task.id);
        const counted = mine.filter(
          (i) => i.result !== 'notCounted' && i.result !== 'unregistered',
        ).length;
        return {
          id: task.id,
          name: task.name,
          status: task.status,
          plannedStart: task.plannedStart,
          plannedEnd: task.plannedEnd,
          expected: num(task.expectedCount),
          counted,
          coverage: num(task.expectedCount)
            ? round(counted / num(task.expectedCount))
            : null,
          differences: mine.filter((i) =>
            ['mismatch', 'notFound', 'unregistered'].includes(String(i.result)),
          ).length,
        };
      });
      const byResult = [...groupBy(items, (i) => String(i.result))].map(
        ([result, count]) => ({ result, count }),
      );
      const byResolution = [
        ...groupBy(
          items.filter((i) => i.resolution !== 'unresolved'),
          (i) => String(i.resolution),
        ),
      ].map(([resolution, count]) => ({ resolution, count }));
      return {
        sections: [
          {
            key: 'tasks',
            columns: [
              'name',
              'status',
              'plannedStart',
              'plannedEnd',
              'expected',
              'counted',
              'coverage',
              'differences',
            ],
            rows,
          },
          { key: 'byResult', columns: ['result', 'count'], rows: byResult },
          {
            key: 'byResolution',
            columns: ['resolution', 'count'],
            rows: byResolution,
          },
        ],
        totals: {
          tasks: rows.length,
          differences: rows.reduce((sum, r) => sum + r.differences, 0),
        },
      };
    },

    async changes(scope, conditions) {
      const fromDate = new Date(`${scope.from}T00:00:00.000Z`);
      const toDate = new Date(`${scope.to}T23:59:59.999Z`);
      const deviceIds = (
        await scopedDevices(scope, conditions, true)
          .select('id')
          .execute<{ id: string }>()
      ).map((a) => a.id);
      const events = (
        await database
          .query()
          .selectFrom('historyEvents')
          .selectAll()
          .where('subjectType', '=', 'devices')
          .where('subjectId', 'in', deviceIds.length ? deviceIds : ['__none__'])
          .where('createdAt', '>=', fromDate)
          .where('createdAt', '<=', toDate)
          .orderBy('createdAt', 'desc')
          .limit(2000)
          .execute<Row>()
      ).map((r) => decodeRow(r, { jsonFields: ['payload'] }));
      const deviceLabels = await database
        .query()
        .selectFrom('devices')
        .select(['id', 'deviceNo', 'name'])
        .where('id', 'in', deviceIds.length ? deviceIds : ['__none__'])
        .execute<Row>();
      const labelOf = new Map(
        deviceLabels.map((a) => [
          String(a.id),
          `${String(a.deviceNo)} ${String(a.name)}`,
        ]),
      );
      const disposed = events.filter(
        (e) =>
          e.type === 'statusChange' &&
          (e.payload as Row | null)?.to === 'disposed',
      ).length;
      return {
        sections: [
          {
            key: 'summary',
            columns: ['type', 'count'],
            rows: [...groupBy(events, (e) => String(e.type))].map(
              ([type, count]) => ({ type, count }),
            ),
          },
          {
            key: 'events',
            columns: ['createdAt', 'device', 'type', 'summary'],
            rows: events.map((e) => ({
              id: e.id,
              deviceId: e.subjectId,
              createdAt: e.createdAt,
              device: labelOf.get(String(e.subjectId)) ?? '',
              type: e.type,
              summary: e.summary,
            })),
          },
        ],
        totals: {
          events: events.length,
          created: events.filter((e) => e.type === 'created').length,
          disposed,
          transfers: events.filter((e) => e.type === 'transfer').length,
          statusChanges: events.filter((e) => e.type === 'statusChange').length,
        },
      };
    },
  };

  return {
    async run(name, filters, conditions) {
      if (!REPORT_NAMES.includes(name))
        throw new ValidationError(`Unknown report: ${String(name)}`, 'name');
      const scope = await resolveScope(filters);
      const canSeeCost =
        (conditions.fieldAccess?.output ?? '*') === '*' ||
        (conditions.fieldAccess?.output ?? '*').includes('purchasePrice');
      const general = await settings.get('general');
      const { sections, totals } = await builders[name](
        scope,
        conditions,
        canSeeCost,
      );
      return {
        name,
        filters: { ...filters, from: scope.from, to: scope.to },
        generatedAt: new Date().toISOString(),
        canSeeCost,
        sections,
        totals: { ...totals, currency: general.currency },
      };
    },
  };
}
