import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight, Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { SearchTrigger } from '@/components/itam/global-search';
import { Page, PageHeader } from '@/components/itam/page-header';
import { WorkScopeToggle } from '@/components/itam/work-scope-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamSettings } from '@/lib/itam/api';
import { formatDate } from '@/lib/itam/format';
import {
  useWorkCards,
  type CardRecord,
  type WorkCard,
} from '@/lib/itam/my-work';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { cn } from '@/lib/utils';
import {
  REMINDER_GROUPS,
  REMINDER_ROUTES,
  useDoneWork,
  useMyWork,
  useReminders,
} from '@/lib/itam/workbench';

/**
 * The workbench is the team's to-do board (2026-10-05): 需要关注 on the left,
 * then one column per kind of to-do, each listing its records as cards that
 * open in the record drawer. It answers "what is waiting" and nothing else —
 * where the devices stand and what expires are the reports' to say, with a
 * period and filters. 全部 / 我负责的 narrows every column to the reader's
 * part; the board stays live (`useLiveWork` in the app layout).
 *
 * A column with nothing in it stays where it is, dimmed, saying 暂无待办: a
 * column that disappears at zero cannot be told from one the reader does
 * not have, and a board whose columns move is one the eye has to search.
 */
export default function WorkbenchPage(): ReactElement {
  const { t } = useTranslation();
  const cards = useWorkCards();
  const loading = useMyWork().isLoading;
  return (
    <Page fill>
      <PageHeader
        title={t('workbench.title')}
        aside={<SearchTrigger />}
        actions={<WorkScopeToggle />}
      />
      {/* The board takes the rest of the page's height, so each column
          scrolls its own cards and the sideways scrollbar sits at the foot
          of the page — as the status boards do. */}
      <div className='-mx-1 flex min-h-80 flex-1 gap-3 overflow-x-auto px-1 pb-2'>
        <AttentionColumn />
        {loading ? (
          <Column title={t('workbench.myWork')}>
            <Skeleton className='h-24 w-full rounded-lg' />
          </Column>
        ) : (
          cards.map((card) => <WorkColumn key={card.key} card={card} />)
        )}
        <DoneColumn waiting={cards.flatMap((card) => card.records)} />
      </div>
    </Page>
  );
}

/** One column: a heading with an optional count, then what it holds. */
function Column({
  title,
  count,
  dimmed = false,
  footer,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly dimmed?: boolean;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={title}
      // The status boards' column: a tint of the foreground, since the page
      // is the muted grey, at least 15rem and sharing the room up to 22rem.
      className={cn(
        'flex max-w-[22rem] min-w-[15rem] flex-1 basis-[15rem] flex-col rounded-2xl bg-foreground/[0.025]',
        dimmed && 'opacity-60',
      )}
    >
      <header className='flex h-11 shrink-0 items-center gap-2 px-3.5'>
        <span className='truncate text-sm font-semibold'>{title}</span>
        {count === undefined ? null : (
          <span className='rounded-full bg-background px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums ring-1 ring-border/60'>
            {count}
          </span>
        )}
      </header>
      <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2'>
        {children}
        {footer}
      </div>
    </section>
  );
}

function WorkColumn({ card }: { readonly card: WorkCard }): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  return (
    <Column
      title={card.label}
      count={card.count}
      dimmed={card.count === 0}
      footer={
        card.links.length > 0 ? (
          <div className='flex flex-col gap-1 px-1.5'>
            {card.links.map((link) => (
              <Link
                key={link.url}
                to={link.url}
                className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                {link.label}
                <ArrowRight aria-hidden='true' className='size-3' />
              </Link>
            ))}
          </div>
        ) : null
      }
    >
      {card.count === 0 ? (
        <p className='mx-1 rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground'>
          {t('workbench.nothingPending')}
        </p>
      ) : (
        <ul className='flex flex-col gap-2'>
          {card.records.map((record) =>
            card.key === 'leaverRecovery' ? (
              <li key={record.url}>
                <LeaverCard record={record} />
              </li>
            ) : (
              <li key={record.url}>
                <button
                  type='button'
                  onClick={() => {
                    openRecord(record.url);
                  }}
                  className='w-full rounded-xl border border-border/50 bg-card px-3.5 py-3 text-left shadow-xs transition hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                >
                  <div className='flex items-center gap-2'>
                    {/* A record whose title is only a number says what kind
                      it is; a device or a person names itself. */}
                    {record.tag ? (
                      <DocumentTypeBadge
                        kind={record.tag}
                        className='shrink-0'
                      />
                    ) : null}
                    <span className='min-w-0 truncate text-sm font-semibold'>
                      {record.title}
                    </span>
                  </div>
                  {record.subtitle ? (
                    <p className='mt-1 truncate text-sm text-muted-foreground'>
                      {record.subtitle}
                    </p>
                  ) : null}
                  <p className='mt-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums'>
                    {record.date ? (
                      <span>{formatDate(record.date)}</span>
                    ) : null}
                    {/* Where a record stands for several things — a leaver
                      holds a number of them — how many are the reader's own;
                      where it is the one thing, that it is theirs. The
                      column lists everybody's. */}
                    {record.count === undefined ? null : (
                      <span className='ml-auto'>
                        {t('workbench.work.mine', { count: record.count })}
                      </span>
                    )}
                    {record.mine ? (
                      <span className='ml-auto'>
                        {t('workbench.work.yours')}
                      </span>
                    ) : null}
                  </p>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Column>
  );
}

/**
 * A leaver's card. A person is not a document, so it reads as one: who they
 * are and when they left, then how far their handover has got — the bar is
 * the thing a column of leavers is scanned for, since each of them is a job
 * of several parts and the name alone says nothing about which ones are
 * nearly done. The reader's own share sits beside it, as on every card.
 */
function LeaverCard({ record }: { readonly record: CardRecord }): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const progress = record.progress;
  const ratio =
    progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <button
      type='button'
      onClick={() => {
        openRecord(record.url);
      }}
      className='w-full rounded-xl border border-border/50 bg-card px-3.5 py-3 text-left shadow-xs transition hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
    >
      <div className='flex items-center gap-2.5'>
        {/* Avatars are not tags: a plain disc with the first letter. */}
        <span
          aria-hidden='true'
          className='flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'
        >
          {Array.from(record.title)[0] ?? ''}
        </span>
        <div className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-semibold'>
            {record.title}
          </span>
          {/* The job gives way before the date: when they left is what
              says how long this has been waiting. */}
          <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            {record.subtitle ? (
              <span className='min-w-0 truncate'>{record.subtitle}</span>
            ) : null}
            {record.subtitle && record.date ? (
              <span aria-hidden='true'>·</span>
            ) : null}
            {record.date ? (
              <span className='shrink-0 tabular-nums'>
                {t('workbench.work.leftOn', { date: formatDate(record.date) })}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {progress || record.count !== undefined ? (
        <div className='mt-3'>
          {progress ? (
            <div
              aria-hidden='true'
              className='h-1.5 overflow-hidden rounded-full bg-muted'
            >
              <div
                className='h-full rounded-full bg-primary transition-[width]'
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          ) : null}
          <p className='mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums'>
            {progress ? (
              <span>
                {t('people.recovery.progress', {
                  done: progress.done,
                  total: progress.total,
                })}
              </span>
            ) : null}
            {record.count === undefined ? null : (
              <span className='ml-auto'>
                {t('workbench.work.mine', { count: record.count })}
              </span>
            )}
          </p>
        </div>
      ) : null}
    </button>
  );
}

/**
 * Only the critical rules colour their count. Severity is a property of the
 * rule rather than of how bad today is, and most rules are `warning` — a
 * colour on most rows differentiates nothing. The order already carries
 * severity; the colour is kept for the exception.
 */
const SEVERITY_TEXT: Readonly<Record<string, string>> = {
  critical: 'text-destructive',
};

/**
 * 需要关注, the board's first column: the rule-layer reminders, one row each,
 * grouped. Every rule stays listed, the empty ones last **within their
 * group** and dimmed: a rule that vanishes at zero cannot be told from one
 * that was never set up, and "0" is an answer — it says the check ran.
 */
function AttentionColumn(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const thresholds = settings.data?.thresholds;
  const reminders = useReminders(true);
  const byKind = new Map(
    (reminders.data ?? []).map((entry) => [entry.kind, entry]),
  );
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
    <Column title={t('workbench.attention')}>
      {reminders.isLoading ? (
        <Skeleton className='h-24 w-full rounded-lg' />
      ) : groups.length === 0 ? (
        <p className='mx-1 rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground'>
          {t('workbench.nothingToAttend')}
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.key}
            className='rounded-xl border border-border/50 bg-card px-2 py-2 shadow-xs'
          >
            <h3 className='mb-1 px-1.5 text-xs font-medium tracking-wide text-muted-foreground'>
              {t(`workbench.reminderGroups.${group.key}`)}
            </h3>
            {/* The number carries the severity, so there is one signal per
                row instead of a coloured dot beside a grey count. */}
            <ul className='text-sm'>
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
                      'flex items-baseline justify-between gap-3 rounded-md px-1.5 py-1.5 hover:bg-muted',
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
                          : cn('font-medium', SEVERITY_TEXT[entry.severity]),
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
    </Column>
  );
}

/**
 * 已完成, the board's last column: what was finished in the last 30 days,
 * newest first (`doneWork` on the server), so a to-do settled on the board
 * moves here instead of vanishing. One that is waiting again — an order
 * rejected and resubmitted — reads as waiting, not as done.
 */
function DoneColumn({
  waiting,
}: {
  readonly waiting: readonly { readonly url: string }[];
}): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const pending = new Set(waiting.map((record) => record.url));
  const done = (useDoneWork().data ?? []).filter(
    (record) => !pending.has(record.url),
  );
  // The two approval queues are one column, so they are one kind here too.
  const kindOf = (key: string) =>
    key === 'pendingPurchaseApprovals' || key === 'pendingDisposalApprovals'
      ? 'pendingApprovals'
      : key;
  return (
    <Column
      title={t('workbench.work.done')}
      count={done.length}
      dimmed={done.length === 0}
    >
      {done.length === 0 ? (
        <p className='mx-1 rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground'>
          {t('workbench.nothingDone')}
        </p>
      ) : (
        <ul className='flex flex-col gap-2'>
          {done.map((record) => (
            <li key={`${record.key}:${record.url}`}>
              <button
                type='button'
                onClick={() => {
                  openRecord(record.url);
                }}
                className='w-full rounded-xl border border-border/50 bg-card/60 px-3.5 py-3 text-left text-muted-foreground transition hover:border-border hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              >
                <span className='block truncate text-sm font-medium text-foreground/80'>
                  {record.title}
                </span>
                <p className='mt-2 flex items-center gap-1.5 text-xs tabular-nums'>
                  <Check aria-hidden='true' className='size-3.5 shrink-0' />
                  <span className='truncate'>
                    {t(`workbench.work.${kindOf(record.key)}`)}
                  </span>
                  <span className='ml-auto shrink-0'>
                    {formatDate(record.doneAt)}
                  </span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Column>
  );
}
