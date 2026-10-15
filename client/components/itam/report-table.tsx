import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { CellText } from '@/components/itam/cell-text';
import { Paged } from '@/components/itam/paged';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import type { ReportSection } from '@/lib/itam/workbench';

const MONEY = new Set([
  'bookValue',
  'purchasePrice',
  'unitPrice',
  'annualCost',
  'amount',
  'cost',
  'total',
  'perHead',
  'annualDepreciation',
  'licenseCost',
  'subscriptionCost',
  'stockCost',
]);
const DATES = new Set([
  'purchaseDate',
  'warrantyEndDate',
  'endDate',
  'expiryDate',
  'plannedStart',
  'plannedEnd',
  'createdAt',
]);
const ENUMS: Readonly<Record<string, string>> = {
  status: 'deviceStatus',
  complianceStatus: 'complianceStatus',
  faultCategory: 'faultCategory',
  result: 'auditResult',
  resolution: 'auditResolution',
  kind: 'appliesTo',
  entitlementKind: 'entitlementKind',
  billingCycle: 'billingCycle',
};
const RATIOS = new Set(['coverage', 'failureRate', 'utilization']);

/** One report section as a table; column keys map to `reports.columns.*`. */
export function ReportTable({
  section,
  currency,
  enumGroups,
}: {
  readonly section: ReportSection;
  readonly currency?: string;
  /** Overrides the enum group of a column for this section. */
  readonly enumGroups?: Readonly<Record<string, string>>;
}): ReactElement {
  const { t } = useTranslation();
  const render = (column: string, value: unknown) => {
    if (value === null || value === undefined || value === '')
      return <span className='text-muted-foreground'>—</span>;
    if (MONEY.has(column)) return formatMoney(value, currency);
    if (DATES.has(column)) return formatDate(value, column === 'createdAt');
    if (RATIOS.has(column)) return `${Math.round(Number(value) * 100)}%`;
    const group = enumGroups?.[column] ?? ENUMS[column];
    if (group === 'historyType')
      return t(`history.types.${text(value)}`, { defaultValue: text(value) });
    if (group)
      return t(`enums.${group}.${text(value)}`, { defaultValue: text(value) });
    return typeof value === 'number' ? (
      <span className='tabular-nums'>{value.toLocaleString()}</span>
    ) : (
      text(value)
    );
  };
  if (section.rows.length === 0)
    return (
      <p className='rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground'>
        {t('reports.noRows')}
      </p>
    );
  return (
    <Paged rows={section.rows}>
      {(rows) => (
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                {section.columns.map((column) => (
                  <TableHead key={column}>
                    {t(`reports.columns.${column}`, { defaultValue: column })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={
                    text(row.id) ||
                    section.columns.map((column) => text(row[column])).join('|')
                  }
                >
                  {section.columns.map((column) => (
                    <TableCell
                      key={column}
                      className={
                        MONEY.has(column) || typeof row[column] === 'number'
                          ? 'text-right tabular-nums'
                          : ''
                      }
                    >
                      {/* One line, cut short past 20rem (CellText). */}
                      <CellText>{render(column, row[column])}</CellText>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Paged>
  );
}
