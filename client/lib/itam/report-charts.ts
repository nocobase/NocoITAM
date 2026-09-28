import type { ReportName } from './workbench.js';

/**
 * How a report section reads as a chart. A section that is a list of
 * records (the ledger, the warranty list, a person's costs) has no entry
 * and stays a table; the others draw their numbers and keep the table one
 * click away.
 *
 * - `bars`: one bar per row, horizontal — a distribution by name or status.
 *   `label` is the column that names the row, `value` the one measured; at
 *   most `limit` rows are drawn, largest first.
 * - `columns`: vertical bars over an ordered axis (months, age buckets),
 *   one series per `values` entry, stacked when there are several.
 */
export type ReportChartSpec =
  | {
      readonly kind: 'bars';
      readonly label: string;
      readonly value: string;
      /** Enum group the label column's values translate through. */
      readonly enumGroup?: string;
      readonly money?: boolean;
      readonly limit?: number;
    }
  | {
      readonly kind: 'columns';
      readonly label: string;
      readonly values: readonly string[];
      readonly money?: boolean;
      /** The label column holds age buckets (`<1`, `1-2` … `unknown`). */
      readonly ageBuckets?: boolean;
    };

const CHARTS: Readonly<
  Partial<Record<ReportName, Readonly<Record<string, ReportChartSpec>>>>
> = {
  overview: {
    byStatus: {
      kind: 'bars',
      label: 'status',
      value: 'count',
      enumGroup: 'deviceStatus',
    },
    byDepartment: { kind: 'bars', label: 'name', value: 'count' },
    byLocation: { kind: 'bars', label: 'name', value: 'count' },
    byAge: {
      kind: 'columns',
      label: 'bucket',
      values: ['count'],
      ageBuckets: true,
    },
    licenseCompliance: {
      kind: 'bars',
      label: 'status',
      value: 'count',
      enumGroup: 'complianceStatus',
    },
    forecast: {
      kind: 'columns',
      label: 'month',
      values: ['warranty', 'entitlements', 'replacements'],
    },
  },
  distribution: {
    byCategory: { kind: 'bars', label: 'name', value: 'count' },
    byDepartment: { kind: 'bars', label: 'name', value: 'count' },
    byLocation: { kind: 'bars', label: 'name', value: 'count' },
    byStatus: {
      kind: 'bars',
      label: 'status',
      value: 'count',
      enumGroup: 'deviceStatus',
    },
  },
  costs: {
    spendByMonth: {
      kind: 'columns',
      label: 'month',
      values: ['amount'],
      money: true,
    },
    subscriptions: {
      kind: 'bars',
      label: 'name',
      value: 'annualCost',
      money: true,
    },
  },
  perPersonCost: {
    byDepartment: { kind: 'bars', label: 'name', value: 'total', money: true },
  },
  expiry: {
    byMonth: {
      kind: 'columns',
      label: 'month',
      values: ['warranty', 'entitlements'],
    },
  },
  repairs: {
    byModel: { kind: 'bars', label: 'name', value: 'repairs' },
    byVendor: { kind: 'bars', label: 'name', value: 'repairs' },
  },
  auditResults: {
    byResult: {
      kind: 'bars',
      label: 'result',
      value: 'count',
      enumGroup: 'auditResult',
    },
    byResolution: {
      kind: 'bars',
      label: 'resolution',
      value: 'count',
      enumGroup: 'auditResolution',
    },
  },
  changes: {
    summary: {
      kind: 'bars',
      label: 'type',
      value: 'count',
      enumGroup: 'historyType',
    },
  },
};

export function reportChartOf(
  report: ReportName,
  section: string,
): ReportChartSpec | undefined {
  return CHARTS[report]?.[section];
}

/** The reports grouped as the page's side navigation lists them. */
export const REPORT_GROUPS: readonly {
  readonly key: string;
  readonly reports: readonly ReportName[];
}[] = [
  { key: 'assets', reports: ['overview', 'ledger', 'distribution'] },
  { key: 'cost', reports: ['costs', 'perPersonCost'] },
  { key: 'software', reports: ['expiry', 'softwareCompliance'] },
  { key: 'operations', reports: ['repairs', 'auditResults', 'changes'] },
];

/** Period presets the filter bar offers, as `from` / `to` for today. */
export type ReportPeriod = 'month' | 'quarter' | 'year' | 'custom';

export function periodRange(
  period: Exclude<ReportPeriod, 'custom'>,
  today: Date = new Date(),
): { from: string; to: string } {
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const month = today.getMonth();
  const start =
    period === 'month'
      ? new Date(today.getFullYear(), month, 1)
      : period === 'quarter'
        ? new Date(today.getFullYear(), month - (month % 3), 1)
        : new Date(today.getFullYear(), 0, 1);
  return { from: iso(start), to: iso(today) };
}
