import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { AiQuickEntries } from '@/components/itam/ai/quick-entries';
import { MyWork } from '@/components/itam/my-work';
import { Page, PageHeader } from '@/components/itam/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useItamSettings } from '@/lib/itam/api';
import {
  addDays,
  formatDate,
  text,
  todayIso,
} from '@/lib/itam/format';
import { cn } from '@/lib/utils';
import {
  REMINDER_GROUPS,
  REMINDER_ROUTES,
  useMyWork,
  useReminders,
  useReport,
  type ReportSection,
} from '@/lib/itam/workbench';

/**
 * The workbench answers "what do I do today, and what needs watching". The
 * IT view: a greeting with what waits, four key numbers for this month, my
 * work beside the reminders, then where the devices stand and what expires
 * in the next 90 days. Everything deeper lives in the reports. Only IT
 * signs in (2026-10-05), so there is no other view.
 */
export default function WorkbenchPage(): ReactElement {
  return <ItWorkbench />;
}

/** 早上好，Mia — and today's date with how many things wait. */
function Greeting({
  actions,
}: {
  readonly actions?: ReactElement;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const { session } = useAuthentication();
  const work = useMyWork();
  const pending = (work.data ?? []).reduce((sum, item) => sum + item.count, 0);
  // Read once per mount: the greeting and the date need not tick.
  const [now] = useState(() => new Date());
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = text(session?.user?.name);
  const date = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);
  return (
    <PageHeader
      title={
        name ? t(`workbench.greeting.${part}`, { name }) : t('workbench.title')
      }
      description={
        work.data
          ? pending > 0
            ? t('workbench.today', { date, count: pending })
            : t('workbench.todayClear', { date })
          : date
      }
      actions={actions}
    />
  );
}

function ItWorkbench(): ReactElement {
  const { t } = useTranslation();
  // Still the 概览 report, now only for the 设备状态 card: the numbers this
  // page used to head with are read on the reports page, with a period.
  const overview = useReport('overview', {});
  const section = (key: string): ReportSection | undefined =>
    overview.data?.sections.find((entry) => entry.key === key);

  return (
    <Page>
      <Greeting
        actions={
          <AiQuickEntries
            entries={[
              { key: 'planToday', prompt: t('ai.prompts.planToday') },
              { key: 'inspectRisks', prompt: t('ai.prompts.inspectRisks') },
              { key: 'costAnalysis', prompt: t('ai.prompts.costAnalysis') },
            ]}
          />
        }
      />
      {/* The to-dos are the strip: what must be done, one card per kind,
          each listing the records behind it. The numbers that used to sit
          here (在管设备, 账面价值, 本月采购, 授权合规) are the 概览 report,
          which is where they are read with a period and filters. */}
      <MyWork />
      <div className='grid gap-6 @3xl:grid-cols-2'>
        <Attention />
        <DeviceStatus section={section('byStatus')} />
        <ExpiringSoon />
      </div>
    </Page>
  );
}

/**
 * Only the two critical rules colour their count. Severity is a property of
 * the rule rather than of how bad today is, and seven of eleven are
 * `warning` — a colour on most rows differentiates nothing. The order
 * already carries severity; the colour is kept for the exception.
 */
const SEVERITY_TEXT: Readonly<Record<string, string>> = {
  critical: 'text-destructive',
};

/**
 * The rule-layer reminders as one row each, worst first.
 *
 * Two cards, not one: `patterns` selects the kinds that describe a shape
 * across several records — a vendor's last three orders, a batch's repairs
 * — and the rest are limits one record passed. Reading "保修 30 天内到期 4"
 * and "供应商连续延迟交货 1" in the same list makes both look like items on
 * a chore list, when the second is something to think about rather than
 * something to clear.
 */
function Attention(): ReactElement | null {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const thresholds = settings.data?.thresholds;
  const reminders = useReminders(true);
  const byKind = new Map(
    (reminders.data ?? []).map((entry) => [entry.kind, entry]),
  );
  // Every rule stays listed, the empty ones last **within their group**: a
  // rule that vanishes at zero cannot be told from one that was never set
  // up, and "0" is an answer — it says the check ran.
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const groups = REMINDER_GROUPS.map((group) => ({
    key: group.key,
    rows: group.kinds
      .flatMap((kind) => {
        const entry = byKind.get(kind);
        return entry ? [entry] : [];
      })
      .sort(
        (a, b) =>
          Number(b.count > 0) - Number(a.count > 0) ||
          rank[a.severity] - rank[b.severity],
      ),
  })).filter((group) => group.rows.length > 0);

  const label = (kind: string) =>
    t(`workbench.reminders.${kind}`, {
      warrantyDays: thresholds?.warrantyDays ?? 30,
      idleDays: thresholds?.idleDays ?? 90,
      auditDays: thresholds?.auditDays ?? 365,
      subscriptionExpiryDays: thresholds?.subscriptionExpiryDays ?? 7,
      maintenanceExpiryDays: thresholds?.maintenanceExpiryDays ?? 30,
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('workbench.attention')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {reminders.data && groups.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('workbench.nothingToAttend')}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              <h3 className='mb-1 text-xs font-medium tracking-wide text-muted-foreground'>
                {t(`workbench.reminderGroups.${group.key}`)}
              </h3>
              {/* No inner frame: the card is the frame. The number carries
                  the severity, so there is one signal per row instead of a
                  coloured dot beside a grey count. */}
              <ul className='-mx-2 text-sm'>
                {group.rows.map((entry) => (
                  <li key={entry.kind}>
                    <Link
                      to={REMINDER_ROUTES[entry.kind]}
                      title={t(`workbench.reminderCaptions.${entry.kind}`, {
                        subscriptionExpiryDays:
                          thresholds?.subscriptionExpiryDays ?? 7,
                        maintenanceExpiryDays:
                          thresholds?.maintenanceExpiryDays ?? 30,
                      })}
                      className={cn(
                        'flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted',
                        entry.count === 0 && 'text-muted-foreground',
                      )}
                    >
                      <span className='min-w-0 truncate'>
                        {label(entry.kind)}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          entry.count === 0
                            ? 'text-muted-foreground/50'
                            : cn(
                                'font-medium',
                                SEVERITY_TEXT[entry.severity],
                              ),
                        )}
                      >
                        {entry.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Readonly<Record<string, string>> = {
  inUse: 'var(--chart-2)',
  inStock: 'var(--chart-3)',
  onLoan: 'var(--chart-4)',
  inRepair: 'var(--chart-1)',
  pendingDisposal: 'var(--chart-5)',
};

/** Where the devices stand: one bar split by status, each part a link. */
function DeviceStatus({
  section,
}: {
  readonly section?: ReportSection;
}): ReactElement {
  const { t } = useTranslation();
  const rows = (section?.rows ?? [])
    .map((row) => ({ status: text(row.status), count: Number(row.count ?? 0) }))
    .filter((row) => row.count > 0 && row.status !== 'disposed');
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('workbench.deviceStatus')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {total === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('reports.noRows')}</p>
        ) : (
          <>
            <div
              className='flex h-3 overflow-hidden rounded-full bg-muted'
              role='img'
              aria-label={rows
                .map(
                  (row) =>
                    `${t(`enums.deviceStatus.${row.status}`)} ${row.count}`,
                )
                .join('，')}
            >
              {rows.map((row) => (
                <div
                  key={row.status}
                  style={{
                    width: `${(row.count / total) * 100}%`,
                    background:
                      STATUS_COLORS[row.status] ?? 'var(--muted-foreground)',
                  }}
                />
              ))}
            </div>
            <ul className='grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
              {rows.map((row) => (
                <li key={row.status}>
                  <Link
                    to={`/devices?status=${row.status}`}
                    className='flex items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted'
                  >
                    <span className='flex items-center gap-2'>
                      <span
                        aria-hidden='true'
                        className='size-2 rounded-full'
                        style={{
                          background:
                            STATUS_COLORS[row.status] ??
                            'var(--muted-foreground)',
                        }}
                      />
                      {t(`enums.deviceStatus.${row.status}`, {
                        defaultValue: row.status,
                      })}
                    </span>
                    <span className='tabular-nums text-muted-foreground'>
                      {row.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const HORIZON_DAYS = 90;

/** Warranties and entitlements ending in the next 90 days, soonest first. */
function ExpiringSoon(): ReactElement {
  const { t } = useTranslation();
  const expiry = useReport('expiry', {});
  const today = todayIso();
  const until = addDays(today, HORIZON_DAYS);
  const within = (date: unknown) => {
    const value = text(date).slice(0, 10);
    return value >= today && value <= until ? value : undefined;
  };
  const rows = [
    ...(
      expiry.data?.sections.find((entry) => entry.key === 'warranty')?.rows ??
      []
    ).map((row) => ({
      key: `device:${text(row.id)}`,
      to: `/devices/${text(row.id)}`,
      name: [text(row.deviceNo), text(row.name)].filter(Boolean).join(' / '),
      what: t('workbench.expiring.warranty'),
      date: within(row.warrantyEndDate),
    })),
    ...(
      expiry.data?.sections.find((entry) => entry.key === 'entitlements')
        ?.rows ?? []
    ).map((row) => ({
      key: `entitlement:${text(row.id)}`,
      to: `/entitlements/${text(row.id)}`,
      name: text(row.name),
      what: t('workbench.expiring.entitlement'),
      date: within(row.expiryDate),
    })),
  ]
    .filter((row) => row.date !== undefined)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const shown = rows.slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {t('workbench.expiring.title', { days: HORIZON_DAYS })}
          <Badge variant='secondary' className='tabular-nums'>
            {rows.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-2'>
        {expiry.data && rows.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('workbench.expiring.none', { days: HORIZON_DAYS })}
          </p>
        ) : (
          <ul className='divide-y divide-border rounded-lg border border-border bg-card text-sm'>
            {shown.map((row) => (
              <li key={row.key}>
                <Link
                  to={row.to}
                  className='flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted'
                >
                  <span className='min-w-0 truncate'>
                    {row.name}
                    <span className='text-muted-foreground'> · {row.what}</span>
                  </span>
                  <span className='shrink-0 tabular-nums text-muted-foreground'>
                    {formatDate(row.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 ? (
          <Link
            to='/reports?report=expiry'
            className='inline-flex items-center text-sm text-link underline-offset-4 hover:underline'
          >
            {t('workbench.expiring.all', { count: rows.length })}
            <ArrowRight className='ml-1 size-4' aria-hidden='true' />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
