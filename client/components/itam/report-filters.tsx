import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { ReferenceSelect } from '@/components/itam/reference-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { periodRange, type ReportPeriod } from '@/lib/itam/report-charts';
import type { ReportFilters } from '@/lib/itam/workbench';

const PERIODS: readonly ReportPeriod[] = ['month', 'quarter', 'year', 'custom'];

/** Which preset a range is, or custom when it is none of them. */
function periodOf(value: ReportFilters): ReportPeriod {
  for (const period of ['month', 'quarter', 'year'] as const) {
    const range = periodRange(period);
    if (value.from === range.from && value.to === range.to) return period;
  }
  // No range at all is the server's default: this month so far.
  return value.from || value.to ? 'custom' : 'month';
}

/**
 * The filters every report shares: a period — this month, quarter or year,
 * or dates of one's own — and location, department and category.
 */
export function ReportFilterBar({
  value,
  onChange,
}: {
  readonly value: ReportFilters;
  readonly onChange: (next: ReportFilters) => void;
}): ReactElement {
  const { t } = useTranslation();
  // Kept here as well as derived: 自定义 may start on a preset's dates.
  const [period, setPeriod] = useState<ReportPeriod>(() => periodOf(value));
  const set = (patch: Partial<ReportFilters>) =>
    onChange({ ...value, ...patch });
  const items = PERIODS.map((entry) => ({
    value: entry,
    label: t(`reports.periods.${entry}`),
  }));
  return (
    <div className='flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3'>
      <div className='grid gap-1.5'>
        <Label htmlFor='report-period'>{t('reports.period')}</Label>
        <Select
          items={items}
          value={period}
          onValueChange={(next) => {
            const chosen = String(next) as ReportPeriod;
            setPeriod(chosen);
            if (chosen !== 'custom') set(periodRange(chosen));
          }}
        >
          <SelectTrigger id='report-period' className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {period === 'custom' ? (
        <>
          <div className='grid gap-1.5'>
            <Label htmlFor='report-from'>{t('reports.from')}</Label>
            <Input
              id='report-from'
              type='date'
              max='9999-12-31'
              value={value.from ?? ''}
              onChange={(event) =>
                set({ from: event.target.value || undefined })
              }
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='report-to'>{t('reports.to')}</Label>
            <Input
              id='report-to'
              type='date'
              max='9999-12-31'
              value={value.to ?? ''}
              onChange={(event) => set({ to: event.target.value || undefined })}
            />
          </div>
        </>
      ) : null}
      <div className='grid min-w-44 flex-1 gap-1.5 sm:flex-none'>
        <Label htmlFor='report-location'>{t('fields.location')}</Label>
        <ReferenceSelect
          id='report-location'
          reference={{ collection: 'locations' }}
          value={value.locationId ?? null}
          onChange={(next) => set({ locationId: next ?? undefined })}
        />
      </div>
      <div className='grid min-w-44 flex-1 gap-1.5 sm:flex-none'>
        <Label htmlFor='report-department'>{t('fields.department')}</Label>
        <ReferenceSelect
          id='report-department'
          reference={{ collection: 'departments' }}
          value={value.departmentId ?? null}
          onChange={(next) => set({ departmentId: next ?? undefined })}
        />
      </div>
      <div className='grid min-w-44 flex-1 gap-1.5 sm:flex-none'>
        <Label htmlFor='report-category'>{t('fields.category')}</Label>
        <ReferenceSelect
          id='report-category'
          reference={{
            collection: 'categories',
            filter: { appliesTo: 'device' },
          }}
          value={value.categoryId ?? null}
          onChange={(next) => set({ categoryId: next ?? undefined })}
        />
      </div>
    </div>
  );
}
