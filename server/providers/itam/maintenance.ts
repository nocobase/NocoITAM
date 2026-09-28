import type { DatabaseManager } from '@nocobase/db';
import { dbDateTime, isoDate } from './dates.js';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService } from './devices.js';
import { asText, decodeRow, type Row } from './collection-query.js';
import type { ItamNotifier } from './notifier.js';
import type { SettingsService } from './settings.js';
import { endedWhere, expiringWhere } from './entitlements.js';
import type { EntitlementService } from './entitlements.js';
import type { MasterDataService } from './master-data.js';

/**
 * The time-driven automation: daily status maintenance (subscription
 * renewal dates, reservation release) with the rule layer that recomputes
 * workbench reminders, and monthly depreciation. The scheduler plugin runs
 * them (`server/providers/itam-schedules.ts`) and keeps each execution's
 * history, shown at 设置 → 自动化 → 定时任务; this service only does the work.
 */
export type MaintenanceJob = 'daily' | 'monthly' | 'leavers';

export const REMINDER_KINDS = [
  'warrantyExpiring',
  'entitlementExpiring',
  'entitlementEnded',
  'idleDevice',
  'auditOverdue',
  'leftPersonHoldings',
  'entitlementOverAllocated',
  'lowStock',
  'loanOverdue',
  'purchaseOverdue',
  'vendorLateDeliveries',
  'batchDefect',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * The kinds that describe a shape across several records rather than one
 * record passing a limit. They are computed and stored like any other
 * reminder — same table, same自动消解 — but the workbench shows them in
 * their own card: "这台设备保修要到期了" and "这家供应商最近三单都晚了" are
 * not the same kind of thing to read, and one list of both reads as a
 * miscellany.
 */
export const PATTERN_KINDS: ReadonlySet<ReminderKind> = new Set([
  'vendorLateDeliveries',
  'batchDefect',
]);

export interface ReminderSummary {
  readonly kind: ReminderKind;
  readonly count: number;
  readonly severity: 'info' | 'warning' | 'critical';
}

export interface MaintenanceService {
  /**
   * Runs one job and returns what it did (counts per step); a failure is
   * thrown, and the scheduler records it as the execution's reason.
   */
  runJob(
    job: MaintenanceJob,
    now?: Date,
  ): Promise<Readonly<Record<string, unknown>>>;
  /** Recomputes every reminder from the current data. */
  computeReminders(now?: Date): Promise<readonly ReminderSummary[]>;
  /** Open reminders grouped by kind (for the workbench). */
  reminderCounts(): Promise<readonly ReminderSummary[]>;
  /** Open reminders of one kind with their subjects. */
  reminders(kind: ReminderKind): Promise<readonly Row[]>;
}

export const maintenanceServiceToken: ServiceToken<MaintenanceService> =
  createServiceToken<MaintenanceService>('itam/maintenance-service');

const DAY = 86_400_000;
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY);

/** Whole days from one stored date to another; both are `YYYY-MM-DD…`. */
const daysBetween = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

interface ReminderRow {
  readonly kind: ReminderKind;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly data: Readonly<Record<string, unknown>>;
}

export function createMaintenanceService(dependencies: {
  database: DatabaseManager;
  settings: SettingsService;
  devices: DeviceService;
  entitlements: EntitlementService;
  masterData: MasterDataService;
  notifier: ItamNotifier;
}): MaintenanceService {
  const { database, settings, devices, entitlements, masterData, notifier } =
    dependencies;

  /** Every reminder the rules produce right now. */
  const collect = async (now: Date): Promise<readonly ReminderRow[]> => {
    const thresholds = await settings.get('thresholds');
    const today = isoDate(now);
    const query = database.query();
    const rows: ReminderRow[] = [];

    const warranty = await query
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'name', 'warrantyEndDate'])
      .where('status', 'in', ['inUse', 'onLoan'])
      .where('warrantyEndDate', '>=', today)
      .where(
        'warrantyEndDate',
        '<=',
        isoDate(addDays(now, thresholds.warrantyDays)),
      )
      .execute<Row>();
    for (const device of warranty)
      rows.push({
        kind: 'warrantyExpiring',
        subjectType: 'devices',
        subjectId: String(device.id),
        severity: 'warning',
        data: {
          deviceNo: device.deviceNo,
          name: device.name,
          date: device.warrantyEndDate,
        },
      });

    // Expiry of either kind, or a perpetual entitlement's maintenance end.
    const expiringEntitlements = await expiringWhere(
      today,
      isoDate(addDays(now, thresholds.subscriptionExpiryDays)),
      isoDate(addDays(now, thresholds.maintenanceExpiryDays)),
    )(
      query
        .selectFrom('entitlements')
        .select(['id', 'kind', 'name', 'expiryDate', 'maintenanceExpiryDate']),
    ).execute<Row>();
    for (const entitlement of expiringEntitlements)
      rows.push({
        kind: 'entitlementExpiring',
        subjectType: 'entitlements',
        subjectId: String(entitlement.id),
        severity: 'warning',
        data: {
          name: entitlement.name,
          kind: entitlement.kind,
          date:
            entitlement.kind === 'subscription'
              ? entitlement.expiryDate
              : entitlement.maintenanceExpiryDate,
        },
      });

    // Ended without being renewed, and still holding seats to take back.
    const ended = await endedWhere(today)(
      query
        .selectFrom('entitlements')
        .select(['id', 'name', 'expiryDate', 'assignedCount']),
    ).execute<Row>();
    for (const entitlement of ended)
      rows.push({
        kind: 'entitlementEnded',
        subjectType: 'entitlements',
        subjectId: String(entitlement.id),
        severity: 'warning',
        data: {
          name: entitlement.name,
          date: entitlement.expiryDate,
          seats: entitlement.assignedCount,
        },
      });

    const idle = await query
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'name', 'updatedAt'])
      .where('status', '=', 'inStock')
      .where('reservedForId', 'is', null)
      .where('updatedAt', '<=', dbDateTime(addDays(now, -thresholds.idleDays)))
      .execute<Row>();
    for (const device of idle)
      rows.push({
        kind: 'idleDevice',
        subjectType: 'devices',
        subjectId: String(device.id),
        severity: 'info',
        data: { deviceNo: device.deviceNo, name: device.name },
      });

    // A category's own audit cycle overrides the global threshold.
    const auditCandidates = await query
      .selectFrom('devices')
      .leftJoin('categories', 'categories.id', 'devices.categoryId')
      .select([
        'devices.id as id',
        'devices.deviceNo as deviceNo',
        'devices.name as name',
        'devices.lastAuditedAt as lastAuditedAt',
        'categories.auditCycleDays as auditCycleDays',
      ])
      .where('devices.status', '!=', 'disposed')
      .execute<Row>();
    const auditOverdue = auditCandidates.filter((device) => {
      const cycle = Number(device.auditCycleDays);
      const days =
        Number.isFinite(cycle) && cycle > 0 ? cycle : thresholds.auditDays;
      const raw = device.lastAuditedAt;
      if (raw === null || raw === undefined) return true;
      // SQLite hands datetimes back as epoch milliseconds.
      const last =
        typeof raw === 'number'
          ? new Date(raw)
          : typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw)
            ? new Date(Number(raw))
            : new Date(typeof raw === 'string' ? raw : NaN);
      return Number.isNaN(last.getTime()) || last < addDays(now, -days);
    });
    for (const device of auditOverdue)
      rows.push({
        kind: 'auditOverdue',
        subjectType: 'devices',
        subjectId: String(device.id),
        severity: 'info',
        data: { deviceNo: device.deviceNo, name: device.name },
      });

    const left = await query
      .selectFrom('people')
      .select(['id', 'name'])
      .where('employmentStatus', '=', 'left')
      .execute<Row>();
    for (const person of left) {
      const id = String(person.id);
      const [devicesHeld, stockHeld, seatsHeld] = await Promise.all([
        query
          .selectFrom('devices')
          .select((eb) => [eb.fn.countAll().as('total')])
          .where('assigneeType', '=', 'person')
          .where('assigneeId', '=', id)
          .executeTakeFirst<{ total: number | string }>(),
        query
          .selectFrom('stockHoldings')
          .select((eb) => [eb.fn.countAll().as('total')])
          .where('holderType', '=', 'person')
          .where('holderId', '=', id)
          .where('quantity', '>', 0)
          .executeTakeFirst<{ total: number | string }>(),
        query
          .selectFrom('entitlementSeats')
          .select((eb) => [eb.fn.countAll().as('total')])
          .where('holderType', '=', 'person')
          .where('holderId', '=', id)
          .where('releasedAt', 'is', null)
          .executeTakeFirst<{ total: number | string }>(),
      ]);
      const counts = {
        devices: Number(devicesHeld?.total ?? 0),
        stock: Number(stockHeld?.total ?? 0),
        seats: Number(seatsHeld?.total ?? 0),
      };
      if (Object.values(counts).some((count) => count > 0))
        rows.push({
          kind: 'leftPersonHoldings',
          subjectType: 'people',
          subjectId: id,
          severity: 'critical',
          data: { name: person.name, ...counts },
        });
    }

    const over = await query
      .selectFrom('entitlements')
      .select(['id', 'kind', 'name', 'seatCount', 'assignedCount'])
      .where('complianceStatus', '=', 'overAllocated')
      .execute<Row>();
    for (const entitlement of over)
      rows.push({
        kind: 'entitlementOverAllocated',
        subjectType: 'entitlements',
        subjectId: String(entitlement.id),
        severity: 'critical',
        data: {
          name: entitlement.name,
          kind: entitlement.kind,
          seatCount: entitlement.seatCount,
          assignedCount: entitlement.assignedCount,
        },
      });

    const stock = await query
      .selectFrom('stockItems')
      .select([
        'id',
        'name',
        'kind',
        'totalQuantity',
        'usedQuantity',
        'minimumQuantity',
      ])
      .where('kind', 'in', ['accessory', 'consumable'])
      .execute<Row>();
    for (const item of stock) {
      const available = Number(item.totalQuantity) - Number(item.usedQuantity);
      const minimum = Number(item.minimumQuantity ?? 0);
      if (minimum > 0 && available < minimum)
        rows.push({
          kind: 'lowStock',
          subjectType: 'stockItems',
          subjectId: String(item.id),
          severity: 'warning',
          data: { name: item.name, kind: item.kind, available, minimum },
        });
    }

    // Ordered, not all here, and past the date the vendor gave.
    const lateOrders = await query
      .selectFrom('purchaseOrders')
      .select(['id', 'orderNo', 'expectedAt', 'vendorId'])
      .where('status', 'in', ['ordered', 'partiallyReceived'])
      .where('expectedAt', '<', today)
      .execute<Row>();
    for (const order of lateOrders)
      rows.push({
        kind: 'purchaseOverdue',
        subjectType: 'purchaseOrders',
        subjectId: String(order.id),
        severity: 'warning',
        data: {
          orderNo: order.orderNo,
          date: order.expectedAt,
          vendorId: order.vendorId,
        },
      });

    const loans = await query
      .selectFrom('devices')
      .select([
        'id',
        'deviceNo',
        'name',
        'expectedReturnDate',
        'assigneeId',
        'ownerId',
      ])
      .where('status', '=', 'onLoan')
      .where('expectedReturnDate', '<', today)
      .execute<Row>();
    for (const device of loans)
      rows.push({
        kind: 'loanOverdue',
        subjectType: 'devices',
        subjectId: String(device.id),
        severity: 'warning',
        data: {
          deviceNo: device.deviceNo,
          name: device.name,
          date: device.expectedReturnDate,
          assigneeId: device.assigneeId,
          ownerId: device.ownerId,
        },
      });

    // Cross-record patterns. Neither is a limit one record passes: the
    // subject is a vendor or a batch, and what makes it a finding is a shape
    // across several records over time. Both resolve themselves — the next
    // order arriving on time, the window rolling past the repairs — which is
    // why they can live in the reminders table with everything else.
    const received = await query
      .selectFrom('purchaseOrders')
      .select(['id', 'orderNo', 'vendorId', 'expectedAt', 'receivedAt'])
      .where('vendorId', 'is not', null)
      .where('expectedAt', 'is not', null)
      .where('receivedAt', 'is not', null)
      .execute<Row>();
    const byVendor = new Map<string, Row[]>();
    for (const order of received)
      byVendor.set(String(order.vendorId), [
        ...(byVendor.get(String(order.vendorId)) ?? []),
        order,
      ]);
    const vendorNames = new Map(
      (
        await query.selectFrom('vendors').select(['id', 'name']).execute<Row>()
      ).map((row) => [String(row.id), String(row.name)]),
    );
    for (const [vendorId, orders] of byVendor) {
      // The most recent ones only: a vendor that was late two years ago and
      // punctual since is not a finding.
      const recent = [...orders]
        .sort((a: Row, b: Row) =>
          (asText(b.receivedAt) ?? '').localeCompare(
            asText(a.receivedAt) ?? '',
          ),
        )
        .slice(0, thresholds.lateDeliveryOrders);
      if (recent.length < thresholds.lateDeliveryOrders) continue;
      const lateness = recent.map((order: Row) =>
        daysBetween(
          asText(order.expectedAt) ?? '',
          asText(order.receivedAt) ?? '',
        ),
      );
      if (!lateness.every((days: number) => days > thresholds.lateDeliveryDays))
        continue;
      rows.push({
        kind: 'vendorLateDeliveries',
        subjectType: 'vendors',
        subjectId: vendorId,
        severity: 'warning',
        data: {
          name: vendorNames.get(vendorId) ?? '',
          orders: recent.length,
          worstDays: Math.max(...lateness),
          orderNos: recent.map((order: Row) => order.orderNo),
        },
      });
    }

    // The local `addDays` works on Date, which is what the datetime column
    // has to be compared through (`dbDateTime`).
    const defectSince = addDays(now, -thresholds.batchDefectDays);
    const repaired = await query
      .selectFrom('repairs')
      .innerJoin('devices', 'devices.id', 'repairs.deviceId')
      .select([
        'devices.id as deviceId',
        'devices.deviceNo as deviceNo',
        'devices.modelId as modelId',
        'devices.purchaseDate as purchaseDate',
      ])
      .where('repairs.createdAt', '>=', dbDateTime(defectSince))
      .where('devices.modelId', 'is not', null)
      .where('devices.purchaseDate', 'is not', null)
      .execute<Row>();
    // A batch is what was bought together: the same model in the same month.
    const byBatch = new Map<string, Map<string, Row>>();
    for (const row of repaired) {
      const key = `${String(row.modelId)}|${(asText(row.purchaseDate) ?? '').slice(0, 7)}`;
      const devices = byBatch.get(key) ?? new Map<string, Row>();
      devices.set(String(row.deviceId), row);
      byBatch.set(key, devices);
    }
    const modelNames = new Map(
      (
        await query.selectFrom('models').select(['id', 'name']).execute<Row>()
      ).map((row) => [String(row.id), String(row.name)]),
    );
    for (const [key, devices] of byBatch) {
      if (devices.size < thresholds.batchDefectDevices) continue;
      const [modelId, month] = key.split('|');
      rows.push({
        kind: 'batchDefect',
        subjectType: 'models',
        subjectId: modelId,
        severity: 'warning',
        data: {
          name: modelNames.get(modelId) ?? '',
          month,
          devices: devices.size,
          deviceNos: [...devices.values()].map((row: Row) => row.deviceNo),
        },
      });
    }

    return rows;
  };

  const severityOf = (kind: ReminderKind, rows: readonly Row[]) =>
    (rows.find((row) => row.kind === kind)
      ?.severity as ReminderSummary['severity']) ?? 'info';

  return {
    async runJob(job, now = new Date()) {
      if (job === 'monthly')
        return { depreciated: await devices.recomputeDepreciation(now) };
      // Its own task, scheduled before the daily one so the reminders that
      // run computes already flag what a new leaver still holds.
      if (job === 'leavers')
        return { leavers: await masterData.markDueLeavers(isoDate(now)) };
      const subscriptions = await entitlements.advanceRenewals(now);
      const released = await devices.releaseExpiredReservations(isoDate(now));
      return {
        subscriptions,
        reservationsReleased: released.length,
        reminders: await this.computeReminders(now),
      };
    },

    async computeReminders(now = new Date()) {
      const rows = await collect(now);
      const existing = await database
        .query()
        .selectFrom('reminders')
        .selectAll()
        .execute<Row>();
      const keyOf = (row: Row) =>
        `${String(row.kind)}:${String(row.subjectType)}:${String(row.subjectId)}`;
      const current = new Map(existing.map((row) => [keyOf(row), row]));
      const seen = new Set<string>();
      await database.transaction(async (connection) => {
        for (const row of rows) {
          const key = keyOf(row as unknown as Row);
          seen.add(key);
          const found = current.get(key);
          if (found) {
            await connection.query
              .updateTable('reminders')
              .set({
                severity: row.severity,
                data: row.data,
                computedAt: now,
                resolvedAt: null,
              })
              .where('id', '=', String(found.id))
              .execute();
          } else {
            await connection.query
              .insertInto('reminders')
              .values({
                id: crypto.randomUUID(),
                kind: row.kind,
                subjectType: row.subjectType,
                subjectId: row.subjectId,
                severity: row.severity,
                data: row.data,
                computedAt: now,
                resolvedAt: null,
              })
              .execute();
          }
        }
        for (const [key, row] of current) {
          if (!seen.has(key) && !row.resolvedAt) {
            await connection.query
              .updateTable('reminders')
              .set({ resolvedAt: now })
              .where('id', '=', String(row.id))
              .execute();
          }
        }
      });
      // The two reminders the specification also delivers as notifications.
      for (const row of rows) {
        if (row.kind === 'loanOverdue') {
          const holder = await database
            .query()
            .selectFrom('people')
            .select('userId')
            .where('id', '=', asText(row.data.assigneeId) ?? '')
            .executeTakeFirst<{ userId: string | null }>();
          await notifier.notify({
            key: `loanOverdue:${row.subjectId}:${String(row.data.date)}`,
            to: [holder?.userId, asText(row.data.ownerId) ?? ''],
            title: `Loan overdue: ${String(row.data.deviceNo)}`,
            body: `Expected back on ${String(row.data.date)}`,
            url: `/devices/${row.subjectId}`,
            source: { type: 'device', referenceId: row.subjectId },
          });
        }
      }
      return REMINDER_KINDS.map((kind) => ({
        kind,
        count: rows.filter((row) => row.kind === kind).length,
        severity: severityOf(kind, rows as unknown as Row[]),
      }));
    },

    async reminderCounts() {
      const rows = await database
        .query()
        .selectFrom('reminders')
        .select(['kind', 'severity'])
        .where('resolvedAt', 'is', null)
        .execute<Row>();
      return REMINDER_KINDS.map((kind) => ({
        kind,
        count: rows.filter((row) => row.kind === kind).length,
        severity: severityOf(kind, rows),
      }));
    },

    async reminders(kind) {
      const rows = await database
        .query()
        .selectFrom('reminders')
        .selectAll()
        .where('kind', '=', kind)
        .where('resolvedAt', 'is', null)
        .orderBy('computedAt', 'desc')
        .execute<Row>();
      return rows.map((row) => decodeRow(row, { jsonFields: ['data'] }));
    },
  };
}
