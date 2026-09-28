import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ReportTable } from '@/components/itam/report-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney, text } from '@/lib/itam/format';
import type { ReportChartSpec } from '@/lib/itam/report-charts';
import type { ReportSection } from '@/lib/itam/workbench';
import { cn } from '@/lib/utils';

const SERIES_COLORS = [
  'var(--chart-2)',
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-4)',
];

/**
 * One report section as a card: its chart when the section has one
 * (`reportChartOf`), with the table behind 查看明细表; a list section is its
 * table.
 */
export function ReportSectionCard({
  section,
  chart,
  currency,
  enumGroups,
  className,
}: {
  readonly section: ReportSection;
  readonly chart?: ReportChartSpec;
  readonly currency?: string;
  readonly enumGroups?: Readonly<Record<string, string>>;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  const [showTable, setShowTable] = useState(false);
  const drawable = chart !== undefined && section.rows.length > 0;
  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader>
        <CardTitle>
          {t(`reports.sections.${section.key}`, { defaultValue: section.key })}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {drawable ? (
          <>
            <SectionChart section={section} spec={chart} currency={currency} />
            <button
              type='button'
              className='inline-flex items-center gap-1 text-sm text-link underline-offset-4 hover:underline'
              aria-expanded={showTable}
              onClick={() => setShowTable(!showTable)}
            >
              {t(showTable ? 'reports.hideTable' : 'reports.showTable')}
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  showTable && 'rotate-180',
                )}
                aria-hidden='true'
              />
            </button>
            {showTable ? (
              <ReportTable
                section={section}
                currency={currency}
                enumGroups={enumGroups}
              />
            ) : null}
          </>
        ) : (
          <ReportTable
            section={section}
            currency={currency}
            enumGroups={enumGroups}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SectionChart({
  section,
  spec,
  currency,
}: {
  readonly section: ReportSection;
  readonly spec: ReportChartSpec;
  readonly currency?: string;
}): ReactElement {
  const { t, i18n } = useTranslation();
  // Axes and bar ends take a compact number (18K); the tooltip and the
  // table keep the full amount with its currency.
  const compact = new Intl.NumberFormat(i18n.language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const short = (value: unknown): string => compact.format(Number(value ?? 0));
  const label = (value: unknown): string => {
    const raw = text(value);
    if (spec.kind === 'bars' && spec.enumGroup === 'historyType')
      return t(`history.types.${raw}`, { defaultValue: raw });
    if (spec.kind === 'bars' && spec.enumGroup)
      return t(`enums.${spec.enumGroup}.${raw}`, { defaultValue: raw });
    if (spec.kind === 'columns' && spec.ageBuckets)
      return raw === 'unknown'
        ? t('reports.ageUnknown')
        : t('reports.ageYears', { bucket: raw });
    // A row with no name is the records that name none (no department);
    // the server writes it as a dash.
    return raw && raw !== '—' ? raw : t('reports.unassigned');
  };
  const format = (value: unknown): string =>
    spec.money
      ? formatMoney(value, currency)
      : Number(value ?? 0).toLocaleString();

  if (spec.kind === 'bars') {
    const limit = spec.limit ?? 10;
    const rows = [...section.rows]
      .map((row) => ({
        name: label(row[spec.label]),
        value: Number(row[spec.value] ?? 0),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
    const shown = rows.slice(0, limit);
    const config: ChartConfig = {
      value: {
        label: t(`reports.columns.${spec.value}`, { defaultValue: spec.value }),
        color: SERIES_COLORS[0],
      },
    };
    if (shown.length === 0)
      return (
        <p className='text-sm text-muted-foreground'>{t('reports.noRows')}</p>
      );
    return (
      <div className='space-y-1'>
        <ChartContainer
          config={config}
          className='aspect-auto w-full'
          style={{ height: shown.length * 32 + 8 }}
        >
          <BarChart
            accessibilityLayer
            data={shown}
            layout='vertical'
            margin={{ left: 0, right: 48 }}
          >
            <YAxis
              type='category'
              dataKey='name'
              tickLine={false}
              axisLine={false}
              width={112}
              tickFormatter={(value: string) =>
                value.length > 12 ? `${value.slice(0, 11)}…` : value
              }
            />
            <XAxis type='number' dataKey='value' hide />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel={false}
                  formatter={(value) => format(value)}
                />
              }
            />
            <Bar
              dataKey='value'
              fill='var(--color-value)'
              radius={4}
              label={{
                position: 'right',
                className: 'fill-foreground text-xs tabular-nums',
                formatter: (value: unknown) =>
                  spec.money ? short(value) : format(value),
              }}
            />
          </BarChart>
        </ChartContainer>
        {rows.length > shown.length ? (
          <p className='text-xs text-muted-foreground'>
            {t('reports.topRows', { shown: shown.length, total: rows.length })}
          </p>
        ) : null}
      </div>
    );
  }

  const data = section.rows.map((row) => ({
    name: label(row[spec.label]),
    ...Object.fromEntries(
      spec.values.map((key) => [key, Number(row[key] ?? 0)]),
    ),
  }));
  const config: ChartConfig = Object.fromEntries(
    spec.values.map((key, index) => [
      key,
      {
        label: t(`reports.columns.${key}`, { defaultValue: key }),
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      },
    ]),
  );
  const stacked = spec.values.length > 1;
  return (
    <ChartContainer config={config} className='aspect-auto h-56 w-full'>
      <BarChart accessibilityLayer data={data} margin={{ top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey='name'
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          allowDecimals={false}
          tickFormatter={(value: number) => short(value)}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(value) => format(value)} />}
        />
        {stacked ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {spec.values.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId={stacked ? 'stack' : undefined}
            fill={`var(--color-${key})`}
            radius={
              stacked
                ? index === spec.values.length - 1
                  ? [4, 4, 0, 0]
                  : [0, 0, 0, 0]
                : 4
            }
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
