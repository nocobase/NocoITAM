import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight, Columns3, List, TriangleAlert } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';

import {
  AUDIT_CARD,
  DISPOSAL_CARD,
  PURCHASE_ORDER_CARD,
  PURCHASING_CARD,
  LOAN_CARD,
  REPAIR_CARD,
} from '@/components/itam/board-card-specs';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { BoardCards, type BoardCardSpec } from '@/components/itam/board-cards';
import { DifferenceTag } from '@/components/itam/difference-tag';
import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { Page, PageHeader } from '@/components/itam/page-header';
import { WorkScopeToggle } from '@/components/itam/work-scope-toggle';
import { useWorkScope } from '@/lib/itam/work-scope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDragPan } from '@/hooks/use-drag-pan';
import { useItamList, useItamSettings, type ItamRecord } from '@/lib/itam/api';
import type { DocumentKind } from '@/lib/itam/document-kinds';
import {
  AUDITS_PATH,
  DISPOSALS_PATH,
  REPAIRS_PATH,
} from '@/lib/itam/operations';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import { daysOverdue, formatDate } from '@/lib/itam/format';
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
import { CountPill } from '@/components/itam/count-pill';

/**
 * The workbench is the team's to-do board (2026-10-05): 需要关注 as a band
 * above it and a line counting what waits (2026-10-17), then one column per
 * kind of to-do — 看板, or 列表 with each column a section down the page —
 * each listing its records as cards that open in the record drawer. It answers "what is waiting" and nothing else —
 * where the devices stand and what expires are the reports' to say, with a
 * period and filters. 全部 / 我负责的 narrows every column to the reader's
 * part; the board stays live (`useLiveWork` in the app layout).
 *
 * A column with nothing in it stays where it is, dimmed, saying 暂无待办: a
 * column that disappears at zero cannot be told from one the reader does
 * not have, and a board whose columns move is one the eye has to search.
 */
type WorkView = 'board' | 'list';
const WORK_VIEWS: readonly WorkView[] = ['board', 'list'];
// Remembered in this browser, a convenience: blocked storage opens the board.
const VIEW_KEY = 'nocoitam:workbench-view';
function readView(): WorkView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

export default function WorkbenchPage(): ReactElement {
  const { t } = useTranslation();
  const cards = useWorkCards();
  const loading = useMyWork().isLoading;
  const [view, setView] = useState<WorkView>(readView);
  // Held on its empty space, the board drags sideways (useDragPan).
  const pan = useDragPan();
  const layout = view === 'board' ? 'column' : 'section';
  // The bar pinned atop: its height is what the board leaves it.
  const barRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState(0);
  useEffect(() => {
    const element = barRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setBar(element.getBoundingClientRect().height),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const columns = loading ? (
    <Column title={t('workbench.myWork')} layout={layout}>
      <Skeleton className='h-24 w-full rounded-lg' />
    </Column>
  ) : (
    cards.map((card) => (
      <WorkColumn key={card.key} card={card} layout={layout} />
    ))
  );
  return (
    <Page wide>
      <PageHeader title={t('workbench.title')} />
      {/* 需要关注 first (2026-10-17): risks, not work, read before the
          to-dos and scrolled away with the title. */}
      <AttentionBand />
      {/* The switches and what waits stay pinned as the page scrolls: one
          count per column, which jumps to it — a column off the right edge
          is still said. */}
      <div
        ref={barRef}
        // One row (2026-10-22): wrapped, the switches fell to a line of
        // their own under the counts; now the counts scroll sideways where
        // they do not fit, and the switches keep the right end.
        className='sticky top-0 z-10 -mx-6 flex items-center justify-between gap-4 bg-background/85 px-6 py-2.5 backdrop-blur-xl'
      >
        {loading ? <span /> : <WorkCounts cards={cards} offset={bar + 8} />}
        <div className='ml-auto flex shrink-0 items-center gap-2'>
          <WorkViewToggle
            value={view}
            onChange={(next) => {
              setView(next);
              try {
                localStorage.setItem(VIEW_KEY, next);
              } catch {
                // Storage unavailable: kept until the page is left.
              }
            }}
          />
          <WorkScopeToggle />
        </div>
      </div>
      {view === 'board' ? (
        // The board is the window's height less the header and the pinned
        // bar, and scrolls with the page (2026-10-17): scrolled past the
        // band, it has the rest of the window, each column scrolling its
        // own cards and the sideways scrollbar at its foot — as the status
        // boards do.
        <div
          className='scroll-shown -mx-1 flex min-h-80 shrink-0 cursor-grab gap-3 overflow-x-auto px-1 pb-2 data-[panning]:cursor-grabbing data-[panning]:select-none'
          style={{
            height: `calc(100dvh - var(--spacing) * 22 - ${String(bar)}px)`,
          }}
          {...pan}
        >
          {columns}
        </div>
      ) : (
        // 列表: every column a section down the page, its cards across, so
        // nothing hides past the right edge (2026-10-17).
        <div className='space-y-4'>{columns}</div>
      )}
    </Page>
  );
}

/** 看板 / 列表, beside 全部 / 我负责的 and drawn as it is. */
function WorkViewToggle({
  value,
  onChange,
}: {
  readonly value: WorkView;
  readonly onChange: (view: WorkView) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='radiogroup'
      aria-label={t('workbench.view.label')}
      className='inline-flex rounded-lg border border-border p-0.5'
    >
      {WORK_VIEWS.map((option) => (
        <Button
          key={option}
          role='radio'
          aria-checked={value === option}
          variant={value === option ? 'default' : 'ghost'}
          className='h-7 px-2.5'
          onClick={() => onChange(option)}
        >
          {option === 'board' ? (
            <Columns3 data-icon='inline-start' />
          ) : (
            <List data-icon='inline-start' />
          )}
          {t(`workbench.view.${option}`)}
        </Button>
      ))}
    </div>
  );
}

/**
 * What is waiting, one count per column that holds something, each a link
 * to its column: the board scrolls sideways to it, the list down.
 */
function WorkCounts({
  cards,
  offset,
}: {
  readonly cards: readonly WorkCard[];
  /** The pinned bar's height: a column lands below it, its title in view. */
  readonly offset: number;
}): ReactElement | null {
  const waiting = cards.filter((card) => card.count > 0);
  if (waiting.length === 0) return null;
  // Each a small capsule (2026-10-17): the name, then its count in the pill
  // the columns' headings wear, so the line reads as the columns it leads to.
  return (
    // A fade at the right end says more scroll in when they do not fit.
    <nav className='-my-1 flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none]'>
      {waiting.map((card) => (
        <button
          key={card.key}
          type='button'
          className='flex h-8 shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card pr-1 pl-3.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-border hover:text-foreground'
          onClick={() => {
            const target = document.getElementById(`work-${card.key}`);
            if (!target) return;
            target.style.scrollMarginTop = `${String(offset)}px`;
            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'start',
            });
          }}
        >
          {card.label}
          <span className='rounded-full bg-muted px-2 leading-6 font-semibold text-foreground tabular-nums'>
            {card.count}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** One column: a heading with an optional count, then what it holds. */
function Column({
  id,
  title,
  count,
  dimmed = false,
  layout = 'column',
  action,
  footer,
  children,
}: {
  readonly id?: string;
  readonly title: string;
  readonly count?: number;
  readonly dimmed?: boolean;
  /** A board's column, or a section of the list running down the page. */
  readonly layout?: 'column' | 'section';
  /** A link at the heading's far end, about the column as a whole. */
  readonly action?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  if (layout === 'section')
    return (
      <section
        id={id}
        aria-label={title}
        className={cn(
          'scroll-mt-2 rounded-2xl bg-foreground/[0.025] pb-2',
          dimmed && 'opacity-60',
        )}
      >
        <header className='flex h-11 items-center gap-2 px-3.5'>
          <span className='truncate text-sm font-semibold'>{title}</span>
          {count === undefined ? null : <CountPill>{count}</CountPill>}
          {action ? <span className='ml-auto shrink-0'>{action}</span> : null}
        </header>
        <div className='flex flex-col gap-2 px-2'>
          {children}
          {footer}
        </div>
      </section>
    );
  return (
    <section
      id={id}
      aria-label={title}
      // The status boards' column: a tint of the foreground, since the page
      // is the muted grey, at least 15rem and sharing the room up to 22rem.
      className={cn(
        'flex max-w-[22rem] min-w-[15rem] flex-1 basis-[15rem] scroll-ml-1 flex-col rounded-2xl bg-foreground/[0.025]',
        dimmed && 'opacity-60',
      )}
    >
      <header className='flex h-11 shrink-0 items-center gap-2 px-3.5'>
        <span className='truncate text-sm font-semibold'>{title}</span>
        {count === undefined ? null : <CountPill>{count}</CountPill>}
        {action ? <span className='ml-auto shrink-0'>{action}</span> : null}
      </header>
      <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2'>
        {children}
        {footer}
      </div>
    </section>
  );
}

/** A list section's cards before 展开: two rows of however many fit. */
const SECTION_ROWS = 2;

/**
 * How many cards a list section's grid lays side by side, from its width:
 * `CARD_GRID`'s 16rem minimum and its gap. Four until it is measured.
 */
function useCardsPerRow(
  ref: { readonly current: HTMLElement | null },
  enabled: boolean,
): number {
  const [perRow, setPerRow] = useState(4);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rem = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const gap = rem * 0.5;
      setPerRow(
        Math.max(1, Math.floor((element.clientWidth + gap) / (rem * 16 + gap))),
      );
    };
    // Measured as soon as it is observed, then on every change of width.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return perRow;
}

function WorkColumn({
  card,
  layout,
}: {
  readonly card: WorkCard;
  readonly layout: 'column' | 'section';
}): ReactElement {
  const { t } = useTranslation();
  // In the list, a section shows two rows and folds the rest (2026-10-17),
  // so one busy kind of to-do does not push every other below the fold.
  const gridRef = useRef<HTMLDivElement>(null);
  const perRow = useCardsPerRow(gridRef, layout === 'section');
  const [expanded, setExpanded] = useState(false);
  const limit = perRow * SECTION_ROWS;
  const shown =
    layout === 'section' && !expanded && card.records.length > limit
      ? { ...card, records: card.records.slice(0, limit) }
      : card;
  const folded = card.records.length - shown.records.length;
  return (
    <Column
      id={`work-${card.key}`}
      title={card.label}
      count={card.count}
      dimmed={card.count === 0}
      layout={layout}
      action={
        // The joiners worked out together: what each will get, and what
        // must be bought across them (入职供需).
        card.key === 'people' &&
        card.records.some((record) => record.origin === 'pendingOnboarding') ? (
          <Link
            to='/onboarding-supply'
            className='flex items-center gap-0.5 text-xs text-link underline-offset-4 hover:underline'
          >
            {t('onboarding.supply.link')}
            <ArrowRight aria-hidden='true' className='size-3' />
          </Link>
        ) : // MDM 核对, empty column or not: the page has no menu entry,
        // and what is settled there — ignored records, the rules — is
        // not on the board.
        card.key === 'deviceChecks' ? (
          <Link
            to='/device-sync'
            className='flex items-center gap-0.5 text-xs text-link underline-offset-4 hover:underline'
          >
            {t('workbench.seeAll')}
            <ArrowRight aria-hidden='true' className='size-3' />
          </Link>
        ) : null
      }
      footer={
        card.links.length > 0 ? (
          <div className='flex flex-col gap-1 px-1.5'>
            {card.links.map((link) => (
              <Link
                key={link.url}
                to={link.url}
                className='flex items-center gap-1 text-xs text-link underline-offset-4 hover:underline'
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
        <>
          {card.summary?.length ? (
            // In the list, the same width as the cards beside them.
            <div
              className={
                layout === 'section' ? CARD_GRID : 'flex flex-col gap-2'
              }
            >
              {card.summary.map((entry) => (
                <SummaryCard key={entry.key} entry={entry} />
              ))}
            </div>
          ) : null}
          {card.records.length > 0 ? (
            <div ref={gridRef}>
              <ColumnCards card={shown} grid={layout === 'section'} />
            </div>
          ) : null}
          {folded > 0 ? (
            <button
              type='button'
              className='mx-1.5 w-fit text-xs text-link underline-offset-4 hover:underline'
              onClick={() => setExpanded(true)}
            >
              {t('workbench.showMoreCards', { count: folded })}
            </button>
          ) : null}
        </>
      )}
    </Column>
  );
}

/**
 * MDM 核对's 只在 MDM or 只在台账 (2026-10-15): a count rather than its
 * records — a record not on the register has no 负责人 and no drawer, and
 * each set is settled on its own tab, which the card opens. Drawn like a
 * 需要关注 card, since it is a number to act on rather than a record.
 */
function SummaryCard({
  entry,
}: {
  readonly entry: NonNullable<WorkCard['summary']>[number];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Link
      to={entry.url}
      className='block w-full rounded-xl border border-border/50 bg-card px-3.5 py-3 shadow-xs transition hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
    >
      <span className='flex items-baseline gap-2'>
        <span className='text-base leading-none font-semibold tabular-nums'>
          {entry.count}
        </span>
        <span className='text-sm font-semibold'>
          {t(`deviceSync.review.views.${entry.key}`)}
        </span>
      </span>
      <span className='mt-1 block text-xs text-muted-foreground'>
        {entry.key === 'checks'
          ? // Each kind with its count (2026-10-22).
            (['stale', 'userMismatch', 'statusMismatch'] as const)
              .filter((kind) => (entry.kinds?.[kind] ?? 0) > 0)
              .map(
                (kind) =>
                  `${t(`deviceSync.checks.kinds.${kind}`)} ${String(entry.kinds?.[kind])}`,
              )
              .join(' · ') || t('workbench.work.mdmChecks')
          : t(
              entry.key === 'unregistered'
                ? 'workbench.work.mdmUnregistered'
                : 'workbench.work.mdmUnmanaged',
            )}
      </span>
    </Link>
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
/** The list view's cards: side by side, as many as the width takes. */
const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2';

function ColumnCards({
  card,
  grid = false,
}: {
  readonly card: WorkCard;
  readonly grid?: boolean;
}): ReactElement {
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
    if ((record.origin ?? card.key) === 'loansDueToday')
      return {
        spec: LOAN_CARD,
        row: { ...record },
        url: record.url,
        badge: <AssetTypeBadge value='device' className='shrink-0' />,
      };
    return board && row
      ? {
          // 采购中 holds orders at several steps, so its cards say which.
          spec: card.key === 'purchasing' ? PURCHASING_CARD : board.spec,
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
        className={grid ? CARD_GRID : undefined}
        entries={entries}
        onOpen={({ spec, row }) => {
          const url = urls.get(`${spec.nameField}:${String(row.id)}`);
          if (url) openRecord(url);
        }}
      />
    );
  }
  return (
    <ul className={grid ? CARD_GRID : 'flex flex-col gap-2'}>
      {card.records.map((record) => (
        <li key={record.url}>
          <RecordCard column={record.origin ?? card.key} record={record} />
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
  if (column === 'leaverRecovery')
    return <LeaverCard record={record} tagged={Boolean(record.origin)} />;
  if (column === 'pendingOnboarding')
    return (
      <LeaverCard record={record} joining tagged={Boolean(record.origin)} />
    );
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
      {/* 设备核对: what the platform says otherwise (device sync). */}
      {record.check ? (
        <p className='mt-1.5 flex min-w-0 items-center gap-1.5 text-xs'>
          <DifferenceTag critical={record.check.critical}>
            {t(`deviceSync.checks.kinds.${record.check.kind}`)}
          </DifferenceTag>
          {record.check.userName ? (
            <span className='min-w-0 truncate text-muted-foreground'>
              {t('deviceSync.checks.platformUser', {
                user: record.check.userName,
              })}
            </span>
          ) : null}
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
  tagged = false,
}: {
  readonly record: CardRecord;
  /** 入职准备 rather than 离职交接: the date joins, and progress is 已配备. */
  readonly joining?: boolean;
  /** In 人员变动, beside the other kind: a tag says which this is. */
  readonly tagged?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const progress = record.progress;
  const ratio =
    progress && progress.total > 0 ? progress.done / progress.total : 0;
  // Negative while the first day is ahead.
  const since = daysOverdue(record.date);
  const countdown =
    since < 0
      ? t('workbench.work.joinsIn', { count: -since })
      : since === 0
        ? t('workbench.work.joinsToday')
        : t('workbench.work.joinedAgo', { count: since });
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
            {tagged ? (
              // 离职 and 入职 told apart at a glance: the one to recover
              // from, the one to equip.
              <Badge
                className={cn(
                  'shrink-0',
                  joining
                    ? 'bg-success text-success-foreground'
                    : 'bg-destructive/10 text-destructive',
                )}
              >
                {t(
                  joining
                    ? 'workbench.work.tagJoining'
                    : 'workbench.work.tagLeaving',
                )}
              </Badge>
            ) : null}
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
            // Each phrase whole: on a narrow card the countdown moves under
            // the date rather than either breaking mid-phrase.
            <p className='flex flex-wrap gap-x-1.5 text-xs text-muted-foreground tabular-nums'>
              <span className='whitespace-nowrap'>
                {t(
                  joining ? 'workbench.work.joinsOn' : 'workbench.work.leftOn',
                  { date: formatDate(record.date) },
                )}
              </span>
              {/* A joiner's column runs from next week to months out, so
                  each card says how far off the first day is. */}
              {joining ? (
                <span className='font-medium whitespace-nowrap text-foreground'>
                  {countdown}
                </span>
              ) : null}
            </p>
          ) : null}
          {/* Device sync: their devices still synced after they left. */}
          {!joining && record.onlineAfterLeaving ? (
            <p className='mt-1 text-xs font-medium text-warning-foreground'>
              {t('deviceSync.onlineAfterLeaving', {
                count: record.onlineAfterLeaving,
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
function AttentionBand(): ReactElement {
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
  // — after the cards, in the same order.
  const clear = entries
    .filter((entry) => entry.count === 0)
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0),
    );

  const label = (kind: string) =>
    t(`workbench.reminders.${kind}`, {
      warrantyDays: thresholds?.warrantyDays ?? 30,
      idleDays: thresholds?.idleDays ?? 90,
      auditDays: thresholds?.auditDays ?? 365,
      subscriptionExpiryDays: thresholds?.subscriptionExpiryDays ?? 7,
      maintenanceExpiryDays: thresholds?.maintenanceExpiryDays ?? 30,
    });

  return (
    // A band across the top (2026-10-17): risks rather than to-dos, so it
    // takes no column of the board. On the columns' own quiet ground, the
    // warning said by the heading's icon rather than a yellow wash.
    <section
      aria-label={t('workbench.attention')}
      className='shrink-0 rounded-2xl bg-foreground/[0.025] px-3 py-2.5'
    >
      <h2 className='mb-2 flex items-center gap-1.5 px-0.5 text-sm font-semibold'>
        <TriangleAlert
          aria-hidden='true'
          className='size-4 text-warning-foreground'
        />
        {t('workbench.attention')}
      </h2>
      {reminders.isLoading ? (
        <Skeleton className='h-12 w-full rounded-lg' />
      ) : (
        <>
          {/* Side by side, filling the row (2026-10-17): as many to a row
              as fit at 14rem, each stretched to share it. */}
          <div className='grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-1.5'>
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
                  'block min-w-0 rounded-lg border bg-card px-2.5 py-1.5 shadow-xs transition hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  entry.severity === 'critical'
                    ? 'border-destructive/40 hover:border-destructive/60'
                    : 'border-border/50 hover:border-border',
                )}
              >
                {/* The number is what the eye looks for, the sentence what
                    it means: a larger, bolder figure beside a quieter line,
                    rather than two pieces of text of the same weight. */}
                <span className='flex items-baseline gap-2'>
                  <span
                    className={cn(
                      'text-base leading-none font-semibold tabular-nums',
                      SEVERITY_TEXT[entry.severity],
                    )}
                  >
                    {entry.count}
                  </span>
                  <span className='min-w-0 text-xs leading-tight text-muted-foreground'>
                    {label(entry.kind)}
                  </span>
                </span>
                <PreviewLine entry={entry} />
              </Link>
            ))}
          </div>
          {/* The rules that found nothing come last, each on its own line
              and dimmed rather than folded into a count (2026-10-06): "0"
              says the check ran, and a folded line hid which checks those
              were. They are plain rows, not cards — there is nothing behind
              a zero to open. */}
          {clear.length > 0 ? (
            <ul className='flex flex-wrap gap-x-4 gap-y-1 px-0.5 pt-2'>
              {clear.map((entry) => (
                <li
                  key={entry.kind}
                  className='flex items-baseline gap-1.5 text-muted-foreground/70'
                >
                  <span className='w-[1ch] text-sm leading-none tabular-nums'>
                    0
                  </span>
                  <span className='min-w-0 text-xs leading-tight'>
                    {label(entry.kind)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
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
  // An entitlement coming up says how many seats are used, and how many
  // of those leavers hold (2026-10-17): Figma 3/6 (离职 1).
  const names = entry.preview.map((item) =>
    [
      item.label,
      item.figures ? `${item.figures[0]}/${item.figures[1]}` : null,
      item.leavers
        ? t('workbench.attentionLeavers', { count: item.leavers })
        : null,
    ]
      .filter(Boolean)
      .join(' '),
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
    <span className='mt-0.5 flex min-w-0 gap-1 text-xs text-muted-foreground/70'>
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
