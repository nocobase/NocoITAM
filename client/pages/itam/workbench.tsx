import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight, Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import {
  AUDIT_CARD,
  DISPOSAL_CARD,
  PURCHASE_ORDER_CARD,
  LOAN_CARD,
  REPAIR_CARD,
} from '@/components/itam/board-card-specs';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { BoardCards, type BoardCardSpec } from '@/components/itam/board-cards';
import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { SearchTrigger } from '@/components/itam/global-search';
import { Page, PageHeader } from '@/components/itam/page-header';
import { WorkScopeToggle } from '@/components/itam/work-scope-toggle';
import { useWorkScope } from '@/lib/itam/work-scope';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamList, useItamSettings, type ItamRecord } from '@/lib/itam/api';
import type { DocumentKind } from '@/lib/itam/document-kinds';
import {
  AUDITS_PATH,
  DISPOSALS_PATH,
  REPAIRS_PATH,
} from '@/lib/itam/operations';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
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
  useMyWork,
  useReminders,
  type ReminderSummary,
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
  const leavers = cards.find((card) => card.key === 'leaverRecovery');
  const joiners = cards.find((card) => card.key === 'pendingOnboarding');
  const rest = cards.filter((card) => card !== leavers && card !== joiners);
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
        {/* 需要关注 leads the board, then 离职交接 (2026-10-05): somebody has
            left with the company's equipment, the one to-do that was ever
            `critical`, and each is a job of several parts. */}
        <AttentionColumn />
        {leavers ? <WorkColumn card={leavers} /> : null}
        {joiners ? <WorkColumn card={joiners} /> : null}
        {loading ? (
          <Column title={t('workbench.myWork')}>
            <Skeleton className='h-24 w-full rounded-lg' />
          </Column>
        ) : (
          rest.map((card) => <WorkColumn key={card.key} card={card} />)
        )}
      </div>
    </Page>
  );
}

/** One column: a heading with an optional count, then what it holds. */
function Column({
  title,
  count,
  dimmed = false,
  attention = false,
  footer,
  children,
}: {
  readonly title: string;
  readonly count?: number;
  readonly dimmed?: boolean;
  /** 需要关注: risks rather than to-dos, so it is told apart by its ground. */
  readonly attention?: boolean;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      aria-label={title}
      // The status boards' column: a tint of the foreground, since the page
      // is the muted grey, at least 15rem and sharing the room up to 22rem.
      className={cn(
        'flex max-w-[22rem] min-w-[15rem] flex-1 basis-[15rem] flex-col rounded-2xl',
        attention ? 'bg-warning/50' : 'bg-foreground/[0.025]',
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
        <ColumnCards card={card} />
      )}
    </Column>
  );
}

/**
 * The documents that have a board of their own, and the card it draws them
 * with: on the workbench they read exactly as on their page (2026-10-05).
 */
const DOCUMENT_BOARDS: Partial<
  Record<DocumentKind, { readonly path: string; readonly spec: BoardCardSpec }>
> = {
  purchaseOrders: { path: PURCHASE_ORDERS_PATH, spec: PURCHASE_ORDER_CARD },
  disposals: { path: DISPOSALS_PATH, spec: DISPOSAL_CARD },
  auditTasks: { path: AUDITS_PATH, spec: AUDIT_CARD },
  repairs: { path: REPAIRS_PATH, spec: REPAIR_CARD },
};

/** Which document a row is: its tag, or — a stocktake names itself — its column. */
function kindOf(column: string, record: CardRecord): DocumentKind | undefined {
  return record.tag ?? (column === 'activeAudits' ? 'auditTasks' : undefined);
}

/** The full rows of one kind of document, by id, keyed `kind:id`. */
function useDocumentRows(
  kind: DocumentKind,
  ids: readonly string[],
): readonly (readonly [string, ItamRecord])[] {
  const list = useItamList<ItamRecord>(
    DOCUMENT_BOARDS[kind]?.path ?? '',
    { ids, page: 1, pageSize: Math.max(ids.length, 1) },
    { enabled: ids.length > 0 && Boolean(DOCUMENT_BOARDS[kind]) },
  );
  return ids.length === 0
    ? []
    : (list.data?.data ?? []).map((row) => [`${kind}:${String(row.id)}`, row]);
}

/**
 * A column's records. A purchase order, a disposal or a stocktake is drawn
 * by its board's own card, from its full row — the to-do carries only its
 * number and date, so the rows are read by id, one request per kind. Until
 * they arrive, and for everything without a board of its own (a repair, a
 * loan, a leaver), the to-do's own card stands in.
 */
function ColumnCards({ card }: { readonly card: WorkCard }): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const scope = useWorkScope();
  const idsOf = (kind: DocumentKind) =>
    card.records
      .filter((record) => kindOf(card.key, record) === kind)
      .map((record) => record.id);
  const rows = new Map<string, ItamRecord>([
    ...useDocumentRows('purchaseOrders', idsOf('purchaseOrders')),
    ...useDocumentRows('disposals', idsOf('disposals')),
    ...useDocumentRows('auditTasks', idsOf('auditTasks')),
    ...useDocumentRows('repairs', idsOf('repairs')),
  ]);
  const entries = card.records.map((record) => {
    const kind = kindOf(card.key, record);
    const board = kind ? DOCUMENT_BOARDS[kind] : undefined;
    const row = kind ? rows.get(`${kind}:${record.id}`) : undefined;
    // An overdue loan is a device, not a document: the to-do itself carries
    // what its card says (the borrower, the date it was due back).
    if (card.key === 'loansDueToday')
      return {
        spec: LOAN_CARD,
        row: { ...record },
        url: record.url,
        badge: <AssetTypeBadge value='device' className='shrink-0' />,
      };
    return board && row
      ? {
          spec: board.spec,
          row,
          url: record.url,
          // In the team's view, which approvals are this reader's to
          // decide; under 我负责的 every one of them is, so none says so.
          marker:
            card.key === 'pendingApprovals' && scope === 'all' && record.mine
              ? t('workbench.work.awaitingYou')
              : undefined,
        }
      : null;
  });
  if (entries.length > 0 && entries.every((entry) => entry !== null)) {
    const urls = new Map(
      entries.map((entry) => [
        `${entry.spec.nameField}:${String(entry.row.id)}`,
        entry.url,
      ]),
    );
    return (
      <BoardCards
        entries={entries}
        onOpen={({ spec, row }) => {
          const url = urls.get(`${spec.nameField}:${String(row.id)}`);
          if (url) openRecord(url);
        }}
      />
    );
  }
  return (
    <ul className='flex flex-col gap-2'>
      {card.records.map((record) => (
        <li key={record.url}>
          <RecordCard column={card.key} record={record} />
        </li>
      ))}
    </ul>
  );
}

/** One record on the board; a leaver reads as a person (`LeaverCard`). */
function RecordCard({
  column,
  record,
}: {
  readonly column: string;
  readonly record: CardRecord;
}): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  if (column === 'leaverRecovery') return <LeaverCard record={record} />;
  if (column === 'pendingOnboarding')
    return <LeaverCard record={record} joining />;
  return (
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
          <DocumentTypeBadge kind={record.tag} className='shrink-0' />
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
        {record.date ? <span>{formatDate(record.date)}</span> : null}
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
            {column === 'pendingApprovals'
              ? t('workbench.work.awaitingYou')
              : t('workbench.work.yours')}
          </span>
        ) : null}
      </p>
    </button>
  );
}

/**
 * A leaver's card. A person is not a document, so it reads as one: who they
 * are and when they left, then how far their handover has got — the bar is
 * the thing a column of leavers is scanned for, since each of them is a job
 * of several parts and the name alone says nothing about which ones are
 * nearly done. The reader's own share sits beside it, as on every card.
 */
function LeaverCard({
  record,
  joining = false,
}: {
  readonly record: CardRecord;
  /** 入职准备 rather than 离职交接: the date joins, and progress is 已配备. */
  readonly joining?: boolean;
}): ReactElement {
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
          {/* The job right after the name, and giving way first. */}
          <div className='flex min-w-0 items-baseline gap-1.5'>
            <span className='max-w-full shrink-0 truncate text-sm font-semibold'>
              {record.title}
            </span>
            {record.subtitle ? (
              <span className='min-w-0 truncate text-xs text-muted-foreground'>
                {record.subtitle}
              </span>
            ) : null}
          </div>
          {record.date ? (
            <p className='text-xs text-muted-foreground tabular-nums'>
              {t(joining ? 'workbench.work.joinsOn' : 'workbench.work.leftOn', {
                date: formatDate(record.date),
              })}
            </p>
          ) : null}
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
                {t(
                  joining ? 'onboarding.progress' : 'people.recovery.progress',
                  {
                    done: progress.done,
                    total: progress.total,
                  },
                )}
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
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  // The groups give the order a rule keeps among equals; a card no longer
  // shows its group, since its own sentence says what it is about.
  const order = new Map(
    REMINDER_GROUPS.flatMap((group) => group.kinds).map((kind, index) => [
      kind,
      index,
    ]),
  );
  const entries = reminders.data ?? [];
  // Worst first, then the biggest: a card per rule that found something.
  const found = entries
    .filter((entry) => entry.count > 0)
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        b.count - a.count ||
        (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0),
    );
  // The rules that found nothing are still listed — "0" says the check ran
  // — but as one line, not a card each.
  const clear = entries.filter((entry) => entry.count === 0);

  const label = (kind: string) =>
    t(`workbench.reminders.${kind}`, {
      warrantyDays: thresholds?.warrantyDays ?? 30,
      idleDays: thresholds?.idleDays ?? 90,
      auditDays: thresholds?.auditDays ?? 365,
      subscriptionExpiryDays: thresholds?.subscriptionExpiryDays ?? 7,
      maintenanceExpiryDays: thresholds?.maintenanceExpiryDays ?? 30,
    });

  return (
    <Column title={t('workbench.attention')} attention>
      {reminders.isLoading ? (
        <Skeleton className='h-24 w-full rounded-lg' />
      ) : (
        <>
          {/* Closer together than the to-do cards: eleven rules share the
              column, and a risk card is a line to scan, not a record. */}
          <div className='flex flex-col gap-1.5'>
            {found.map((entry) => (
              <Link
                key={entry.kind}
                to={REMINDER_ROUTES[entry.kind]}
                title={t(`workbench.reminderCaptions.${entry.kind}`, {
                  subscriptionExpiryDays:
                    thresholds?.subscriptionExpiryDays ?? 7,
                  maintenanceExpiryDays:
                    thresholds?.maintenanceExpiryDays ?? 30,
                })}
                // A risk card: the number, what it counts beside it, and the
                // first few records it found on one line, so a card says what
                // is at risk without being opened (2026-10-05). Compact: eleven
                // rules share one column. Only a critical rule is red; severity
                // is the rule's, not today's.
                className={cn(
                  'block w-full rounded-lg border bg-card px-2.5 py-1.5 shadow-xs transition hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  entry.severity === 'critical'
                    ? 'border-destructive/40 hover:border-destructive/60'
                    : 'border-border/50 hover:border-border',
                )}
              >
                <span className='flex items-baseline gap-1.5'>
                  <span
                    className={cn(
                      'text-sm leading-none font-semibold tabular-nums',
                      SEVERITY_TEXT[entry.severity],
                    )}
                  >
                    {entry.count}
                  </span>
                  <span className='min-w-0 text-xs leading-tight font-medium'>
                    {label(entry.kind)}
                  </span>
                </span>
                <PreviewLine entry={entry} />
              </Link>
            ))}
          </div>
          {clear.length > 0 ? (
            <p
              className='flex items-center gap-1.5 px-1.5 text-xs text-muted-foreground'
              title={clear.map((entry) => label(entry.kind)).join('\n')}
            >
              <Check aria-hidden='true' className='size-3.5 shrink-0' />
              {found.length === 0
                ? t('workbench.nothingToAttend')
                : t('workbench.attentionClear', { count: clear.length })}
            </p>
          ) : null}
        </>
      )}
    </Column>
  );
}

/**
 * Under a risk card's number: the records it found, by name — with the date
 * a dated rule turns on, or used against total where that is the point —
 * and how many more.
 */
function PreviewLine({
  entry,
}: {
  readonly entry: ReminderSummary;
}): ReactElement | null {
  const { t } = useTranslation();
  if (entry.preview.length === 0) return null;
  const first = entry.preview[0];
  const names = entry.preview.map((item) =>
    item.figures
      ? `${item.label} ${item.figures[0]}/${item.figures[1]}`
      : item.label,
  );
  const more = entry.count - entry.preview.length;
  // 最早 only when there are several to be soonest among.
  const date = first?.date
    ? entry.count > 1
      ? t('workbench.attentionSoonest', { date: formatDate(first.date) })
      : formatDate(first.date)
    : undefined;
  // One line: the names give way to the edge, and how many more stays.
  return (
    <span className='mt-0.5 flex min-w-0 gap-1 text-xs text-muted-foreground'>
      <span className='min-w-0 truncate'>
        {[date, ...names].filter(Boolean).join(' · ')}
      </span>
      {more > 0 ? (
        <span className='shrink-0'>
          · {t('workbench.attentionMore', { count: more })}
        </span>
      ) : null}
    </span>
  );
}
