import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { ApiClient } from '@nocobase/app-client';

import { useApi, type ItamRecord } from './api.js';

/** Workbench, reminders, maintenance jobs and reports. */
export const WORKBENCH_PATH = 'itam/workbench';
export const REPORTS_PATH = 'itam/reports';

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
 * record passing a limit. The workbench gives them their own card: "this
 * device's warranty is ending" and "this vendor's last three orders were
 * all late" are not the same kind of thing to read.
 */
export const PATTERN_KINDS: ReadonlySet<ReminderKind> = new Set([
  'vendorLateDeliveries',
  'batchDefect',
]);

/** Where each reminder kind's list lives. */
/**
 * Kinds a 我的待办 card already lists, record by record, so 需要关注 leaves
 * them out: the same devices on one screen twice, once as work and once as
 * risk, reads as two problems. The reminder itself stays — the daily job is
 * what notifies the borrower and the owner, and Ava reads the counts.
 */
export const SUPERSEDED_KINDS: ReadonlySet<ReminderKind> = new Set([
  'loanOverdue',
]);

export const REMINDER_ROUTES: Readonly<Record<ReminderKind, string>> = {
  warrantyExpiring: '/devices?view=warrantyExpiring',
  entitlementExpiring: '/entitlements?view=expiring',
  entitlementEnded: '/entitlements?view=ended',
  idleDevice: '/devices?view=idle',
  auditOverdue: '/devices?view=auditOverdue',
  leftPersonHoldings: '/people?employmentStatus=left',
  entitlementOverAllocated: '/entitlements?view=overAllocated',
  lowStock: '/accessories?view=lowStock',
  loanOverdue: '/devices?status=onLoan',
  purchaseOverdue: '/procurement?view=overdue',
  vendorLateDeliveries: '/vendors',
  batchDefect: '/repairs',
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
  readonly date: string | null;
  /** Application route; the row opens it in the record drawer. */
  readonly url: string;
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
