import type { DatabaseManager } from '@nocobase/db';
import { dbDateTime, isoDate } from './dates.js';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { departmentMismatches, type DeviceService } from './devices.js';
import { asText, type Row } from './collection-query.js';
import { recoveryPlan } from './recovery.js';
import type { SettingsService } from './settings.js';
import { endedWhere, expiringWhere, leaverSeatCounts } from './entitlements.js';
import type { EntitlementService } from './entitlements.js';
import type { MasterDataService } from './master-data.js';
import type { HistoryService } from './history.js';
import { isPrepared, type OnboardingService } from './onboarding.js';
import type { ItamNotifier } from './notifier.js';
import { sweepSearchAnswers } from '../itam-agents/search-answers.js';

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
  // A device still on the department its holder has left (2026-10-20).
  'departmentMismatch',
  'entitlementOverAllocated',
  // A subscription paying for more free seats than the idle ratio allows
  // (2026-10-28); a perpetual licence's idle seats cost nothing more.
  'entitlementIdle',
  // One rule per kind kept as a quantity (2026-10-05): each opens its own
  // page, and "below its level" means a different errand for a cable, a
  // toner and a spare SSD.
  'lowAccessories',
  'lowConsumables',
  'lowComponents',
  // A joiner's item still to buy past its last day to order (2026-10-22).
  'onboardingOrderOverdue',
  // Device sync's 只在 MDM and 只在台账 were two rules here for a day; since
  // 2026-10-15 they are counts on 待办's MDM 核对 column, beside the
  // differences, so MDM is one place on the board rather than two.
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * One record a rule found, as 需要关注's card names it: the record and the
 * figure that says why — the date it turns on, or used against total.
 */
export interface ReminderPreview {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly label: string;
  readonly date?: string | null;
  readonly figures?: readonly [number, number];
  /**
   * Seats people who have left still hold, on an entitlement coming up for
   * renewal: the first thing to take back before deciding (2026-10-17).
   */
  readonly leavers?: number;
}

export interface ReminderSummary {
  readonly kind: ReminderKind;
  readonly count: number;
  /**
   * The first few records, soonest first where the rule turns on a date, so
   * a card says what is at risk without being opened (2026-10-05).
   */
  readonly preview: readonly ReminderPreview[];
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
  /**
   * Every rule's count, computed from the current data. The reminders are
   * live (2026-10-05): nothing is stored, so 需要关注 says what is true when
   * it is read rather than what was true at 02:00. The daily job reports
   * what it did, not these counts.
   */
  reminderCounts(now?: Date): Promise<readonly ReminderSummary[]>;
  /** The records one rule finds now, with what it found about each. */
  reminders(kind: ReminderKind, now?: Date): Promise<readonly Row[]>;
}

export const maintenanceServiceToken: ServiceToken<MaintenanceService> =
  createServiceToken<MaintenanceService>('itam/maintenance-service');

const DAY = 86_400_000;
/** The 低于水位 rule each kind of stock item falls under. */
const LOW_STOCK_KIND: Readonly<Record<string, ReminderKind>> = {
  accessory: 'lowAccessories',
  consumable: 'lowConsumables',
  component: 'lowComponents',
};
/** How many records a 需要关注 card names before it says "另 N 个". */
const REMINDER_PREVIEW = 3;
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
  history: HistoryService;
  /**
   * The joiners' plans, for 入职缺口已过最晚下单日; resolved when read, as
   * the onboarding service is built after this one.
   */
  onboarding?: () => OnboardingService | undefined;
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
   * Tells the device's 负责人 that a loan is past its date. Only them
   * (2026-10-05): the borrower is a person in the register, and only IT
   * signs in, so a borrower almost never has an account to be told on —
   * chasing the device back is the 负责人's.
   *
   * It is not a reminder and writes no row: the workbench's 借出逾期
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
      .select(['id', 'deviceNo', 'expectedReturnDate', 'ownerId'])
      .where('status', '=', 'onLoan')
      .where('expectedReturnDate', '<', today)
      .execute<Row>();
    for (const device of overdue) {
      const date = asText(device.expectedReturnDate) ?? '';
      await notifier.notify({
        key: `loanOverdue:${String(device.id)}:${date}`,
        to: [asText(device.ownerId)],
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
            'seatCount',
            'assignedCount',
          ]),
      ).execute<Row>();
      // The seats in use and those leavers still hold: what deciding the
      // renewal turns on, now that there is no usage data (2026-10-17).
      const leavers = await leaverSeatCounts(
        database,
        found.map((entitlement) => String(entitlement.id)),
      );
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
            seatCount: entitlement.seatCount,
            assignedCount: entitlement.assignedCount,
            leaverSeats: leavers.get(String(entitlement.id)) ?? 0,
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

    for (const device of await departmentMismatches(database))
      rows.push({
        kind: 'departmentMismatch',
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

    const idleSubscriptions = await query
      .selectFrom('entitlements')
      .select(['id', 'kind', 'name', 'seatCount', 'assignedCount'])
      .where('kind', '=', 'subscription')
      .where('complianceStatus', '=', 'idle')
      .execute<Row>();
    for (const entitlement of idleSubscriptions)
      rows.push({
        kind: 'entitlementIdle',
        subjectType: 'entitlements',
        subjectId: String(entitlement.id),
        severity: 'info',
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
          kind: LOW_STOCK_KIND[String(item.kind)] ?? 'lowAccessories',
          subjectType: 'stockItems',
          subjectId: String(item.id),
          severity: 'warning',
          data: { name: item.name, kind: item.kind, available, minimum },
        });
    }

    // 入职缺口已过最晚下单日 (2026-10-22): an item a joiner is short of whose
    // last day to order has passed — until then said only on
    // the joiner's own card, which nobody may be looking at. One row per
    // item and joiner, named as both, dated by that last day.
    const plans = await dependencies.onboarding?.()?.plans();
    if (plans && plans.size > 0) {
      const names = new Map(
        (
          await query
            .selectFrom('people')
            .select(['id', 'name'])
            .where('id', 'in', [...plans.keys()])
            .execute<Row>()
        ).map((row) => [String(row.id), String(row.name)]),
      );
      for (const [personId, plan] of plans) {
        if (isPrepared(plan)) continue;
        for (const line of plan.lines)
          if (
            !line.waived &&
            line.shortfall > 0 &&
            line.orderBy &&
            line.orderBy < today
          )
            rows.push({
              kind: 'onboardingOrderOverdue',
              subjectType: 'onboardingLines',
              subjectId: `${personId}:${line.key}`,
              severity: 'warning',
              data: {
                name: `${line.target.name}（${names.get(personId) ?? ''}）`,
                date: line.orderBy,
              },
            });
      }
    }

    return rows;
  };

  /** The reminders of an entitlement coming up for renewal or support. */
  const RENEWAL_KINDS: ReadonlySet<ReminderKind> = new Set([
    'entitlementRenewing',
    'entitlementEnding',
    'entitlementMaintenance',
  ]);

  /** How a found record reads on 需要关注's card. */
  const previewOf = (row: ReminderRow): ReminderPreview => {
    const data = row.data;
    const label =
      // A device by its name (SH-LT-001), its number when it has none: a
      // card has room for a few names, not for 编号 / 名称 pairs.
      row.subjectType === 'devices'
        ? (asText(data.name) ?? asText(data.deviceNo) ?? row.subjectId)
        : (asText(data.name) ?? row.subjectId);
    const coming = RENEWAL_KINDS.has(row.kind);
    const figures: readonly [number, number] | undefined =
      row.kind === 'entitlementOverAllocated' ||
      row.kind === 'entitlementIdle' ||
      // Seats in use against those bought, where it counts seats.
      (coming && data.seatCount !== null && data.seatCount !== undefined)
        ? [Number(data.assignedCount ?? 0), Number(data.seatCount ?? 0)]
        : Object.values(LOW_STOCK_KIND).includes(row.kind)
          ? [Number(data.available ?? 0), Number(data.minimum ?? 0)]
          : undefined;
    const leavers = coming ? Number(data.leaverSeats ?? 0) : 0;
    return {
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      label,
      ...(data.date === undefined ? {} : { date: asText(data.date) ?? null }),
      ...(figures ? { figures } : {}),
      ...(leavers > 0 ? { leavers } : {}),
    };
  };

  const severityOf = (
    kind: ReminderKind,
    rows: readonly ReminderRow[],
  ): ReminderSummary['severity'] =>
    rows.find((row) => row.kind === kind)?.severity ?? 'info';

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
          joined: employment.joined,
          recoveriesPrepared: await prepareRecoveries(),
        };
      }
      const subscriptions = await entitlements.advanceRenewals(now);
      const released = await devices.releaseExpiredReservations(isoDate(now));
      return {
        subscriptions,
        reservationsReleased: released.length,
        loansOverdue: await notifyOverdueLoans(now),
        // The global search's answers nobody kept (search-answers.ts); a
        // deployment without the Agents plugin has no conversations.
        searchAnswersSwept: (
          await sweepSearchAnswers(database, now).catch(() => ({ deleted: 0 }))
        ).deleted,
      };
    },

    async reminderCounts(now = new Date()) {
      const rows = await collect(now);
      return REMINDER_KINDS.map((kind) => {
        const found = rows
          .filter((row) => row.kind === kind)
          .sort((a, b) =>
            (asText(a.data.date) ?? '').localeCompare(
              asText(b.data.date) ?? '',
            ),
          );
        return {
          kind,
          count: found.length,
          severity: severityOf(kind, rows),
          preview: found.slice(0, REMINDER_PREVIEW).map(previewOf),
        };
      });
    },

    async reminders(kind, now = new Date()) {
      return (await collect(now))
        .filter((row) => row.kind === kind)
        .map((row) => ({
          ...row,
          id: `${row.kind}:${row.subjectType}:${row.subjectId}`,
          computedAt: now,
        }));
    },
  };
}
