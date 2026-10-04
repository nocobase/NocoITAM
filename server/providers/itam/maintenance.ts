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
import type { HistoryService } from './history.js';
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

/**
 * What is to be done with one thing a leaver holds. The same judgements the
 * offboarding skill states in prose, as rules — because they are rules: which
 * of these applies follows from the record, not from reading it. The
 * assistant still does the reading and the proposing; this is only what the
 * nightly job can say without one.
 */
export type RecoveryHandling =
  /** Hand it back to stock: the ordinary case. */
  | 'return'
  /** At the repair shop, so returning it now would stop the record matching. */
  | 'wait'
  /** An accessory or component goes back to its stock item. */
  | 'takeBack'
  /** A consumable issued is usually used up; somebody has to say. */
  | 'confirmConsumed'
  /** A seat is reclaimed — and the account behind it still signs in. */
  | 'reclaim'
  /** Already out of use; nothing to recover. */
  | 'none';

export interface RecoveryItem {
  readonly kind: 'device' | 'stock' | 'seat';
  readonly id: string;
  readonly label: string;
  readonly handling: RecoveryHandling;
  /** Who answers for it, which is who the preparation is handed to. */
  readonly ownerId: string | null;
  /** The account a reclaimed seat leaves behind, when it carries one. */
  readonly account?: string;
  /**
   * What the handling is addressed to, which is not always the item: a stock
   * holding is taken back on its stock item and a seat is reclaimed on its
   * entitlement, so a page offering the action needs that id rather than the
   * row's own.
   */
  readonly targetId: string;
  /** How many are held, for a stock holding. */
  readonly quantity?: number;
  /** A device's status, which is what decided its handling. */
  readonly status?: string;
  /**
   * Which of the five asset types it is, as the pages label them: a page
   * listing devices, stock and seats together needs to say which each row
   * is, and `kind` groups the three stock types under one name.
   */
  readonly assetType:
    | 'device'
    | 'accessory'
    | 'consumable'
    | 'component'
    | 'entitlement';
}

export function deviceHandling(status: string): RecoveryHandling {
  if (status === 'inRepair') return 'wait';
  if (status === 'inUse' || status === 'onLoan') return 'return';
  // Lost, retired, pending disposal, disposed: not in their hands to give back.
  return 'none';
}

/**
 * What is to be done with a stock holding.
 *
 * In practice a person's holdings are accessories: issuing a consumable
 * records a `consume` movement and no holding — it is gone — and a component
 * installs on a device rather than on somebody. The other two answers stay
 * because the mapping is total and the kinds are data, not because a
 * recovery has been seen to contain one.
 */
export function stockHandling(kind: string): RecoveryHandling {
  return kind === 'consumable' ? 'confirmConsumed' : 'takeBack';
}

/** Everything a leaver holds, each with what is to be done with it. */
export function recoveryPlan(holdings: {
  readonly devices: readonly Row[];
  readonly stock: readonly Row[];
  readonly entitlementSeats: readonly Row[];
}): readonly RecoveryItem[] {
  return [
    ...holdings.devices.map((row) => ({
      kind: 'device' as const,
      id: String(row.id),
      label: `${asText(row.deviceNo) ?? ''} / ${asText(row.name) ?? ''}`.trim(),
      handling: deviceHandling(asText(row.status) ?? ''),
      ownerId: asText(row.ownerId) ?? null,
      // A device is returned on itself.
      targetId: String(row.id),
      status: asText(row.status) ?? '',
      assetType: 'device' as const,
    })),
    ...holdings.stock.map((row) => ({
      kind: 'stock' as const,
      id: String(row.id),
      label: asText(row.name) ?? '',
      handling: stockHandling(asText(row.kind) ?? ''),
      ownerId: asText(row.ownerId) ?? null,
      targetId: asText(row.stockItemId) ?? '',
      quantity: Number(row.quantity) || 0,
      assetType: (asText(row.kind) ??
        'accessory') as RecoveryItem['assetType'],
    })),
    ...holdings.entitlementSeats.map((row) => ({
      kind: 'seat' as const,
      id: String(row.id),
      label: asText(row.name) ?? '',
      handling: 'reclaim' as const,
      ownerId: asText(row.ownerId) ?? null,
      ...(asText(row.account) ? { account: asText(row.account) } : {}),
      targetId: asText(row.entitlementId) ?? '',
      assetType: 'entitlement' as const,
    })),
  ];
}

export function createMaintenanceService(dependencies: {
  database: DatabaseManager;
  settings: SettingsService;
  devices: DeviceService;
  entitlements: EntitlementService;
  masterData: MasterDataService;
  notifier: ItamNotifier;
  history: HistoryService;
}): MaintenanceService {
  const {
    database,
    settings,
    devices,
    entitlements,
    masterData,
    notifier,
    history,
  } = dependencies;

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
        title: {
          key: 'notifications.loanOverdue',
          params: { deviceNo: String(device.deviceNo) },
        },
        body: { key: 'notifications.loanOverdueBody', params: { date } },
        url: `/devices/${String(device.id)}`,
        source: { type: 'device', referenceId: String(device.id) },
      });
    }
    return overdue.length;
  };

  /**
   * Hands each leaver's recovery to whoever answers for what they still hold.
   *
   * The nightly job prepares it rather than waiting to be asked: somebody who
   * left on Friday should not depend on a person opening the chat on Monday.
   * The preparation is a rule, not a model call — which of the handlings
   * applies follows from the record, and this application runs nothing AI
   * outside a conversation (2026-09-27). The assistant still does the reading
   * and the proposing, with the same judgements written out for it in
   * `ai/skills/offboarding`.
   *
   * It is written once per leaver: a `recoveryPrepared` event on the person is
   * both the preparation and the record that it was made, so a leaver who was
   * marked before this shipped gets one on the next run, and nobody gets a
   * second one every night. The notification goes to the owners it names,
   * each told only the part they answer for.
   */
  const prepareRecoveries = async (): Promise<number> => {
    const left = await database
      .query()
      .selectFrom('people')
      .select(['id', 'name'])
      .where('employmentStatus', '=', 'left')
      .execute<Row>();
    let prepared = 0;
    for (const person of left) {
      const id = String(person.id);
      const done = await database
        .query()
        .selectFrom('historyEvents')
        .select('id')
        .where('subjectType', '=', 'people')
        .where('subjectId', '=', id)
        .where('type', '=', 'recoveryPrepared')
        .executeTakeFirst<{ id: string }>();
      if (done) continue;
      const items = recoveryPlan(await masterData.personHoldings(id));
      const outstanding = items.filter((item) => item.handling !== 'none');
      // Nothing held is not a preparation worth making, and writing one would
      // claim work where there is none.
      if (outstanding.length === 0) continue;
      const counts = {
        devices: outstanding.filter((item) => item.kind === 'device').length,
        stock: outstanding.filter((item) => item.kind === 'stock').length,
        seats: outstanding.filter((item) => item.kind === 'seat').length,
      };
      await history.record({
        subjectType: 'people',
        subjectId: id,
        type: 'recoveryPrepared',
        summary: `Recovery prepared: ${outstanding.length} to settle`,
        payload: { ...counts, items: outstanding },
        sourceType: 'scheduler',
        origin: 'schedule',
      });
      // Each owner is told their own part: a list of somebody else's devices
      // is not something they can act on, and a shared one leaves everybody
      // assuming the other will.
      const owners = new Set(
        outstanding
          .map((item) => item.ownerId)
          .filter((owner): owner is string => owner !== null),
      );
      for (const owner of owners) {
        const theirs = outstanding.filter((item) => item.ownerId === owner);
        await notifier.notify({
          key: `leaverRecovery:${id}:${owner}`,
          to: [owner],
          title: {
            key: 'notifications.leaverRecovery',
            params: { name: asText(person.name) ?? '' },
          },
          body: {
            key: 'notifications.leaverRecoveryBody',
            params: { count: theirs.length },
          },
          url: `/people/${id}`,
          source: { type: 'person', referenceId: id },
        });
      }
      prepared += 1;
    }
    return prepared;
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
      // Its own task, scheduled before the daily one: the day's employment
      // status is settled before anything else reads it, and the recovery
      // lists this run prepares are for the people it has just marked.
      if (job === 'leavers') {
        const employment = await masterData.markDueLeavers(isoDate(now));
        return {
          leavers: employment.left,
          reinstated: employment.reinstated,
          recoveriesPrepared: await prepareRecoveries(),
        };
      }
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
