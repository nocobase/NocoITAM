import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ApiClient } from '@nocobase/app-client';

import { useApi, type ItamRecord } from './api.js';
import { useWorkScope, type WorkScope } from './work-scope.js';

/** Workbench, reminders, maintenance jobs and reports. */
export const WORKBENCH_PATH = 'itam/workbench';
export const REPORTS_PATH = 'itam/reports';

export const REMINDER_KINDS = [
  'warrantyExpiring',
  'entitlementRenewing',
  'entitlementEnding',
  'entitlementMaintenance',
  'entitlementEnded',
  'idleDevice',
  'auditOverdue',
  'departmentMismatch',
  'entitlementOverAllocated',
  'lowAccessories',
  'lowConsumables',
  'lowComponents',
  'onboardingOrderOverdue',
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * 需要关注 checks ten rules, which as one flat list is a wall of
 * near-identical lines. They read as three clusters — what is happening to
 * the assets, what is happening to the entitlements, and what is happening
 * to the goods coming in — so the card groups them and the eye has
 * somewhere to land. Every kind belongs to exactly one group, and the
 * order here is the order they appear in.
 */
export const REMINDER_GROUPS: readonly {
  readonly key: string;
  readonly kinds: readonly ReminderKind[];
}[] = [
  {
    // 设备, not 资产: 资产 is the umbrella over all five kinds, and every
    // rule here is about a device. The one rule the other kinds have —
    // 低于水位 — is in `supply` with the goods coming in.
    key: 'devices',
    kinds: [
      'warrantyExpiring',
      'idleDevice',
      'auditOverdue',
      // On the department its holder has left (2026-10-20).
      'departmentMismatch',
    ],
  },
  {
    key: 'entitlements',
    kinds: [
      // A subscription's own life in order — about to charge, about to
      // stop, already stopped — and the perpetual licence's maintenance
      // after it.
      'entitlementRenewing',
      'entitlementEnding',
      'entitlementEnded',
      'entitlementMaintenance',
      'entitlementOverAllocated',
    ],
  },
  // 采购到货逾期 left (2026-10-05): an overdue order is a 待验收到货 to-do,
  // tagged 逾期 N 天, and one set of records is not both work and risk.
  {
    key: 'supply',
    // A joiner's item past its last day to order leads (2026-10-22): a
    // first day is fixed, a stock level is not.
    kinds: [
      'onboardingOrderOverdue',
      'lowAccessories',
      'lowConsumables',
      'lowComponents',
    ],
  },
];

/** Where each reminder kind's list lives. */
export const REMINDER_ROUTES: Readonly<Record<ReminderKind, string>> = {
  warrantyExpiring: '/devices?view=warrantyExpiring',
  entitlementRenewing: '/entitlements?view=renewing',
  entitlementEnding: '/entitlements?view=ending',
  entitlementMaintenance: '/entitlements?view=maintenance',
  entitlementEnded: '/entitlements?view=ended',
  idleDevice: '/devices?view=idle',
  auditOverdue: '/devices?view=auditOverdue',
  departmentMismatch: '/devices?view=departmentMismatch',
  entitlementOverAllocated: '/entitlements?view=overAllocated',
  lowAccessories: '/accessories?view=lowStock',
  lowConsumables: '/consumables?view=lowStock',
  lowComponents: '/components?view=lowStock',
  // The joiners: 入职供需 went (2026-10-23).
  onboardingOrderOverdue: '/supply-demand',
};

/** A record a 需要关注 rule found, as its card names it. */
export interface ReminderPreview {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly label: string;
  readonly date?: string | null;
  /** Used against total, where that is the point (超量, 低于水位). */
  readonly figures?: readonly [number, number];
  /** Seats leavers still hold, on an entitlement coming up for renewal. */
  readonly leavers?: number;
}

export interface ReminderSummary {
  readonly kind: ReminderKind;
  readonly count: number;
  readonly severity: 'info' | 'warning' | 'critical';
  /** The first few records, soonest first where the rule turns on a date. */
  readonly preview: readonly ReminderPreview[];
}

/** One record behind a to-do, listed on its card. */
export interface MyWorkRecord {
  readonly id: string;
  readonly title: string;
  /** What the title does not say on its own — a person's job. */
  readonly subtitle?: string | null;
  readonly date: string | null;
  /** Application route; the row opens it in the record drawer. */
  readonly url: string;
  /**
   * How many things behind this record are the reader's own, where the record
   * stands for several — a leaver holds a number of them, and only some
   * answer to the person reading. Absent where the record is itself the work.
   */
  readonly count?: number;
  /**
   * The record itself answers to the reader, where the record *is* the work —
   * a device whose loan is overdue. The card lists everybody's, because the
   * act is granted by permission rather than by ownership, so each row says
   * whether this one is the reader's.
   */
  /** The 负责人's name, where the card names whom to ask (an overdue loan). */
  readonly owner?: string | null;
  readonly mine?: boolean;
  /**
   * How far a leaver's handover has got, against what was in their name when
   * they left — the count their 归属 tab reads.
   */
  readonly progress?: { readonly done: number; readonly total: number };
  /** 设备核对: which difference a device shows (device sync, 2026-10-15). */
  readonly check?: {
    readonly kind: 'stale' | 'userMismatch' | 'statusMismatch';
    readonly critical: boolean;
    readonly userName?: string | null;
  };
  /** A leaver's devices that synced after their leave date. */
  readonly onlineAfterLeaving?: number;
  /** A joiner's items to buy, and whether one is past its last order day. */
  readonly shortfall?: number;
  readonly orderOverdue?: boolean;
}

export interface MyWorkItem {
  readonly key: string;
  readonly count: number;
  readonly url: string;
  readonly records: readonly MyWorkRecord[];
  /**
   * MDM 核对 only: the differences by kind, and the other two tabs' counts
   * (see the server's).
   */
  readonly summary?: {
    readonly checks?: Partial<
      Record<'stale' | 'userMismatch' | 'statusMismatch', number>
    >;
    readonly unregistered?: number;
    readonly unmanaged: number;
  };
}

/**
 * How many records a to-do column lists before it says "see all": a
 * board column lists its work rather than a preview of it (2026-10-05).
 */
export const MY_WORK_PREVIEW = 50;

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
  readonly rows: readonly ItamRecord[];
}

export interface ReportResult {
  readonly name: ReportName;
  readonly filters: ReportFilters;
  readonly generatedAt: string;
  readonly canSeeCost: boolean;
  readonly sections: readonly ReportSection[];
  readonly totals: Readonly<Record<string, number | string | null>>;
}

export function useMyWork(
  fixed?: WorkScope,
): UseQueryResult<readonly MyWorkItem[]> {
  const api = useApi();
  // The team's queue, or the reader's part of it (`work-scope.ts`), unless
  // the caller names one.
  const chosen = useWorkScope();
  const scope = fixed ?? chosen;
  return useQuery({
    queryKey: ['itam', WORKBENCH_PATH, 'my-work', scope],
    queryFn: async () =>
      (
        await api.request<{ data: MyWorkItem[] }>({
          path: `${WORKBENCH_PATH}/my-work`,
          query: { scope },
        })
      ).data,
  });
}

export function useReminders(
  enabled: boolean,
): UseQueryResult<readonly ReminderSummary[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', WORKBENCH_PATH, 'reminders'],
    queryFn: async () =>
      (
        await api.request<{ data: ReminderSummary[] }>({
          path: `${WORKBENCH_PATH}/reminders`,
        })
      ).data,
    enabled,
  });
}

export function useReport(
  name: ReportName,
  filters: ReportFilters,
  enabled = true,
): UseQueryResult<ReportResult> {
  const api = useApi();
  const query: Record<string, string> = {};
  for (const key of Object.keys(filters) as (keyof ReportFilters)[]) {
    const value = filters[key];
    if (value) query[key] = value;
  }
  return useQuery({
    queryKey: ['itam', REPORTS_PATH, name, query],
    queryFn: async () =>
      (
        await api.request<{ data: ReportResult }>({
          path: `${REPORTS_PATH}/${name}`,
          query,
        })
      ).data,
    enabled,
  });
}

/** Fetches the CSV export of a report and hands it to the browser as a download. */
export async function downloadReportCsv(
  api: ApiClient,
  name: ReportName,
  filters: ReportFilters,
): Promise<void> {
  const query: Record<string, string> = { format: 'csv' };
  for (const key of Object.keys(filters) as (keyof ReportFilters)[]) {
    const value = filters[key];
    if (value) query[key] = value;
  }
  // The client returns a non-JSON body as text.
  const payload: unknown = await api.request({
    path: `${REPORTS_PATH}/${name}`,
    query,
  });
  const text = typeof payload === 'string' ? payload : '';
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}-${filters.from ?? ''}-${filters.to ?? ''}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
