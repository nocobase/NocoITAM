import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ApiClient } from '@nocobase/app-client';

import { useApi, type ItamRecord } from './api.js';

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
  'entitlementOverAllocated',
  'lowStock',
  'purchaseOverdue',
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
    kinds: ['warrantyExpiring', 'idleDevice', 'auditOverdue'],
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
  { key: 'supply', kinds: ['lowStock', 'purchaseOverdue'] },
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
  entitlementOverAllocated: '/entitlements?view=overAllocated',
  // Three kinds are counted and the link can only open one list, so it
  // opens the accessories — the kind most of them are. The card's own row
  // says how many in total.
  lowStock: '/accessories?view=lowStock',
  purchaseOverdue: '/procurement?view=overdue',
};

export interface ReminderSummary {
  readonly kind: ReminderKind;
  readonly count: number;
  readonly severity: 'info' | 'warning' | 'critical';
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
  readonly mine?: boolean;
}

export interface MyWorkItem {
  readonly key: string;
  readonly count: number;
  readonly url: string;
  readonly records: readonly MyWorkRecord[];
}

/** How many records a card lists before it says "see all". */
export const MY_WORK_PREVIEW = 5;

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

export function useMyWork(): UseQueryResult<readonly MyWorkItem[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', WORKBENCH_PATH, 'my-work'],
    queryFn: async () =>
      (
        await api.request<{ data: MyWorkItem[] }>({
          path: `${WORKBENCH_PATH}/my-work`,
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
