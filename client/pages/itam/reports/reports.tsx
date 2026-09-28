import { useTranslation } from '@nocobase/i18n/client';
import { Download } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { ReportInsight } from '@/components/itam/ai/report-insight';
import { Page, PageHeader } from '@/components/itam/page-header';
import { ReportFilterBar } from '@/components/itam/report-filters';
import { ReportSectionCard } from '@/components/itam/report-section';
import { StatCards } from '@/components/itam/stat-cards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi, useItamSettings } from '@/lib/itam/api';
import { formatMoney, text } from '@/lib/itam/format';
import { REPORT_GROUPS, reportChartOf } from '@/lib/itam/report-charts';
import { cn } from '@/lib/utils';
import {
  downloadReportCsv,
  REPORT_NAMES,
  useReport,
  type ReportFilters,
  type ReportName,
} from '@/lib/itam/workbench';

/** Enum groups for columns whose meaning differs per section. */
const SECTION_ENUMS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  licenseCompliance: { status: 'complianceStatus' },
  byStatus: { status: 'deviceStatus' },
  tasks: { status: 'auditStatus' },
  summary: { type: 'historyType' },
  events: { type: 'historyType' },
};

const MONEY = new Set([
  'bookValue',
  'purchaseSpend',
  'repairSpend',
  'disposalProceeds',
  'periodDepreciation',
  'subscriptionAnnualCost',
  'annualTotal',
  'perHead',
  'repairCost',
]);
const RATIOS = new Set(['utilization']);

/**
 * The preset reports. A side list groups them (assets, cost, software and
 * expiry, operations); the chosen one shows its key numbers, then each
 * section as a chart with its table one click away — a section that is a
 * list of records stays a table. The filters are shared by every report.
 */
export default function ReportsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const requested = params.get('report');
  const name: ReportName = (REPORT_NAMES as readonly string[]).includes(
    requested ?? '',
  )
    ? (requested as ReportName)
    : 'overview';
  const [filters, setFilters] = useState<ReportFilters>({});
  const settings = useItamSettings();
  const currency = settings.data?.general.currency;
  const report = useReport(name, filters);
  const [downloading, setDownloading] = useState(false);

  const totals = Object.entries(report.data?.totals ?? {}).filter(
    ([key, value]) => key !== 'currency' && value !== null,
  );
  const sections = report.data?.sections ?? [];

  return (
    <Page>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
      />
      <div className='grid gap-6 @3xl:grid-cols-[11rem_minmax(0,1fr)]'>
        <nav
          aria-label={t('reports.title')}
          className='flex gap-4 overflow-x-auto @3xl:flex-col @3xl:gap-5 @3xl:overflow-visible'
        >
          {REPORT_GROUPS.map((group) => (
            <div key={group.key} className='min-w-max space-y-1 @3xl:min-w-0'>
              <p className='px-2 text-xs font-medium text-muted-foreground'>
                {t(`reports.groups.${group.key}`)}
              </p>
              <ul className='flex gap-1 @3xl:flex-col'>
                {group.reports.map((entry) => (
                  <li key={entry}>
                    <button
                      type='button'
                      aria-current={entry === name ? 'page' : undefined}
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-muted',
                        entry === name && 'bg-muted font-medium',
                      )}
                      onClick={() =>
                        setParams({ report: entry }, { replace: true })
                      }
                    >
                      {t(`reports.names.${entry}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className='min-w-0 space-y-4'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='space-y-1'>
              <h2 className='font-heading text-lg font-semibold'>
                {t(`reports.names.${name}`)}
              </h2>
              <p className='text-sm text-muted-foreground'>
                {t(`reports.descriptions.${name}`)}
              </p>
            </div>
            <div className='flex items-center gap-4'>
              {report.data ? <ReportInsight report={report.data} /> : null}
              <Button
                variant='outline'
                size='sm'
                disabled={!report.data || downloading}
                onClick={() => {
                  setDownloading(true);
                  void downloadReportCsv(api, name, filters).finally(() =>
                    setDownloading(false),
                  );
                }}
              >
                <Download data-icon='inline-start' />
                {t('reports.exportCsv')}
              </Button>
            </div>
          </div>

          <ReportFilterBar value={filters} onChange={setFilters} />

          {report.isLoading ? (
            <div className='space-y-3'>
              <Skeleton className='h-20 w-full' />
              <Skeleton className='h-56 w-full' />
            </div>
          ) : null}

          {report.data ? (
            <>
              {totals.length > 0 ? (
                <StatCards
                  cards={totals.map(([key, value]) => ({
                    key,
                    label: t(`reports.totals.${key}`, { defaultValue: key }),
                    value: MONEY.has(key)
                      ? formatMoney(value, currency)
                      : RATIOS.has(key)
                        ? `${Math.round(Number(value) * 100)}%`
                        : text(value),
                  }))}
                />
              ) : null}
              <div className='grid gap-4 @5xl:grid-cols-2'>
                {sections.map((section) => {
                  const chart = reportChartOf(name, section.key);
                  return (
                    <ReportSectionCard
                      key={section.key}
                      section={section}
                      chart={chart}
                      currency={currency}
                      enumGroups={SECTION_ENUMS[section.key]}
                      // A list of records needs the width; a chart pairs up.
                      className={chart ? undefined : '@5xl:col-span-2'}
                    />
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
