import type { DatabaseManager } from '@nocobase/db';
import { dbDateTime, isoDate } from './dates.js';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService } from './devices.js';
import { asText, decodeRow, type Row } from './collection-query.js';
import type { SettingsService } from './settings.js';
import { endedWhere, expiringWhere } from './entitlements.js';
import type { EntitlementService } from './entitlements.js';
import type { MasterDataService } from './master-data.js';
import type { ItamNotifier } from './notifier.js';

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
  'entitlementRenewing',
  'entitlementEnding',
  'entitlementMaintenance',
  'entitlementEnded',
  'idleDevice',
  'auditOverdue',
  'entitlementOverAllocated',
  'lowStock',
  'purchaseOverdue',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];


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

  /**
   * Tells the borrower and the device's 负责人 that a loan is past its date.
   *
   * It is not a reminder and writes no row: the workbench's 设备借出逾期未还
   * card answers "which ones" live, from this same query, so a stored copy
   * would be a staler second answer (decided 2026-09-28). What made the
   * notification once-only was never the reminders table but the key the
   * notification plugin deduplicates on — `<device>:<date>`, so a loan that
   * stays overdue is announced once, not every night.
   */
  const notifyOverdueLoans = async (now: Date): Promise<number> => {
    const today = isoDate(now);
    const overdue = await database
      .query()
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'expectedReturnDate', 'assigneeId', 'ownerId'])
      .where('status', '=', 'onLoan')
      .where('expectedReturnDate', '<', today)
      .execute<Row>();
    for (const device of overdue) {
      const holder = await database
        .query()
        .selectFrom('people')
        .select('userId')
        .where('id', '=', asText(device.assigneeId) ?? '')
        .executeTakeFirst<{ userId: string | null }>();
      const date = asText(device.expectedReturnDate) ?? '';
      await notifier.notify({
        key: `loanOverdue:${String(device.id)}:${date}`,
        to: [holder?.userId, asText(device.ownerId)],
        title: `Loan overdue: ${String(device.deviceNo)}`,
        body: `Expected back on ${date}`,
        url: `/devices/${String(device.id)}`,
        source: { type: 'device', referenceId: String(device.id) },
      });
    }
    return overdue.length;
  };

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

    // Three dates, three different acts: a subscription about to charge, a
    // subscription about to stop, and a perpetual licence whose support
    // ends. One line saying "renewing or ending" could not say which.
    const EXPIRY_HORIZONS = [
      {
        horizon: 'renewing' as const,
        kind: 'entitlementRenewing' as const,
        days: thresholds.subscriptionExpiryDays,
        dateField: 'expiryDate',
      },
      {
        horizon: 'ending' as const,
        kind: 'entitlementEnding' as const,
        days: thresholds.subscriptionExpiryDays,
        dateField: 'expiryDate',
      },
      {
        horizon: 'maintenance' as const,
        kind: 'entitlementMaintenance' as const,
        days: thresholds.maintenanceExpiryDays,
        dateField: 'maintenanceExpiryDate',
      },
    ];
    for (const entry of EXPIRY_HORIZONS) {
      const found = await expiringWhere(
        entry.horizon,
        today,
        isoDate(addDays(now, entry.days)),
      )(
        query
          .selectFrom('entitlements')
          .select([
            'id',
            'kind',
            'name',
            'expiryDate',
            'maintenanceExpiryDate',
          ]),
      ).execute<Row>();
      for (const entitlement of found)
        rows.push({
          kind: entry.kind,
          subjectType: 'entitlements',
          subjectId: String(entitlement.id),
          severity: 'warning',
          data: {
            name: entitlement.name,
            kind: entitlement.kind,
            date: entitlement[entry.dateField],
          },
        });
    }

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
      // Every kind that is kept as a quantity, components included: a spare
      // SSD running out is what a water level is for, and their page has
      // always offered the field — leaving them out of the check meant a
      // value you could set and never hear about (fixed 2026-09-28).
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
        loansOverdue: await notifyOverdueLoans(now),
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
