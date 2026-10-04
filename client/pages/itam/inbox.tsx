import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { Page } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { PersonBelongings } from '@/components/itam/person-belongings';
import { RecordPane } from '@/components/itam/record-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/itam/format';
import { useWorkCards, WORK_TONE, type CardRecord } from '@/lib/itam/my-work';

/**
 * 我的待办: the work waiting on this reader, as a queue beside the thing
 * being worked on.
 *
 * The workbench answers "is anything waiting" the moment somebody signs in,
 * with the same to-dos as a strip of counts. This page is where they are
 * settled, so it is laid out for working through: every waiting record in one
 * list on the left, under the to-do it belongs to, and the one picked open on
 * the right — the record's own page, with its own actions, rather than a
 * second rendering of it. Choosing one does not leave the page, so the next
 * is one click away.
 *
 * Narrow, the two halves come one at a time: the list, then the record opened
 * from it, with 返回 back to the list.
 */
export default function InboxPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // A queue with nothing in it is left out: the strip shows every to-do
  // with 暂无待办 under it, because a card that disappears at zero cannot be
  // told from one the reader does not have — but here a heading with no rows
  // under it is just a line to scroll past on the way to the work.
  const cards = useWorkCards().filter((card) => card.records.length > 0);
  // Which to-do is in view and which record is open live in the address, so
  // every item in the queue has one of its own: a reload lands back on it,
  // and it can be sent to whoever should look at it. Replacing rather than
  // pushing keeps the back button on the page the reader came from, the way
  // a list and its detail behave everywhere else.
  const [params, setParams] = useSearchParams();
  const kind = params.get('view') ?? undefined;
  const chosen = params.get('open') ?? undefined;
  const choose = (next: Readonly<Record<string, string | undefined>>) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) updated.delete(key);
      else updated.set(key, value);
    }
    setParams(updated, { replace: true });
  };
  // Beside the list the first stands open before anything is picked; narrow,
  // nothing is open until one is.
  const [reading, setReading] = useState(false);
  // One list across every to-do, oldest date first. Each record's date is
  // the day its own to-do turns on — submitted, due, expected back, left —
  // so soonest first is "what has waited longest or is furthest past due",
  // which is the order a queue is worked in. A record without one goes last.
  const rows = cards
    .filter((card) => kind === undefined || card.key === kind)
    .flatMap((card) => card.records.map((record) => ({ card, record })))
    .sort((a, b) =>
      (a.record.date ?? '9999').localeCompare(b.record.date ?? '9999'),
    );
  const current = rows.find((row) => row.record.url === chosen) ?? rows[0];
  const total = cards.reduce((sum, card) => sum + card.count, 0);

  return (
    <Page>
      <section className='@container space-y-3'>
        <h2 className='font-heading text-base leading-snug font-medium'>
          {t('workbench.myWork')}
          {total > 0 ? (
            <span className='ml-2 text-base font-normal text-muted-foreground tabular-nums'>
              {total}
            </span>
          ) : null}
        </h2>
        {/* The to-dos as a filter across the top rather than as headings
            over the rows: headings cut a queue of eight into six segments
            and stop it being ordered by urgency across them, while the same
            words up here both say what is waiting and narrow the list to
            it. The counts are each whole queue's. */}
        {cards.length > 0 ? (
          <div className='flex flex-wrap gap-1'>
            <FilterChip
              label={t('common.all')}
              count={total}
              active={kind === undefined}
              onClick={() => choose({ view: undefined, open: undefined })}
            />
            {cards.map((card) => (
              <FilterChip
                key={card.key}
                label={card.label}
                count={card.count}
                active={kind === card.key}
                onClick={() => choose({ view: card.key, open: undefined })}
              />
            ))}
          </div>
        ) : null}
        {!current ? (
          <p className='rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground'>
            {t('workbench.nothingPending')}
          </p>
        ) : (
          // Side by side the list and the item share one card; narrow, each
          // stands on the page on its own.
          <div className='grid @3xl:grid-cols-[22rem_minmax(0,1fr)] @3xl:overflow-hidden @3xl:rounded-xl @3xl:border @3xl:border-border @3xl:bg-card'>
            <div
              className={`min-w-0 @3xl:block @3xl:border-r @3xl:border-border ${
                reading ? 'hidden' : ''
              }`}
            >
              <ul className='@3xl:overflow-y-auto'>
                {rows.map(({ card, record }) => (
                  <li
                    key={record.url}
                    className='border-b border-border last:border-b-0'
                  >
                    <WorkRow
                      kind={card.label}
                      tone={WORK_TONE[card.key]}
                      record={record}
                      chosen={record.url === current.record.url}
                      onChoose={() => {
                        choose({ open: record.url });
                        setReading(
                          !window.matchMedia('(min-width: 48rem)').matches,
                        );
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <div className={`min-w-0 ${reading ? '' : 'hidden @3xl:block'}`}>
              {reading ? (
                <div className='flex h-12 items-center px-3 @3xl:hidden'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setReading(false)}
                  >
                    <ArrowLeft data-icon='inline-start' />
                    {t('common.back')}
                  </Button>
                </div>
              ) : null}
              {/* A leaver's row opens their 归属 and nothing else: who they
                  are is not the work — what is in their name is. Every other
                  row opens its record, where the work is the record. */}
              {current.card.key === 'leaverRecovery' ? (
                <>
                  <PaneHeading
                    kind={current.card.label}
                    tone={WORK_TONE[current.card.key]}
                    title={current.record.title}
                    subtitle={current.record.subtitle}
                    to={current.record.url}
                  />
                  <div className='px-4 pb-6'>
                    <PersonBelongings
                      key={current.record.id}
                      personId={current.record.id}
                      personName={current.record.title}
                    />
                  </div>
                </>
              ) : (
                <RecordPane
                  key={current.record.url}
                  to={current.record.url}
                  onLeave={(path) => void navigate(path)}
                  toolbar={
                    <OpenPaneFullPage onLeave={(path) => void navigate(path)} />
                  }
                />
              )}
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}

/**
 * Leaves the queue for the record itself.
 *
 * The pane shows the record's own page but the page's address is the
 * inbox's, so there is otherwise no way to open it whole, keep it, or send
 * it to somebody. It reads the pane's own location, which follows the tabs
 * inside it.
 */
/**
 * What the pane is showing, where it is not a record page and so carries no
 * title of its own. The name opens the record in the drawer, which is the
 * way into a record everywhere else here.
 */
function PaneHeading({
  kind,
  tone,
  title,
  subtitle,
  to,
}: {
  /** The to-do this is, wearing the colour it wears in the queue. */
  readonly kind: string;
  readonly tone: string | undefined;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly to: string;
}): ReactElement {
  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-4 pb-3'>
      <Badge
        variant={tone ? undefined : 'outline'}
        className={`shrink-0 ${tone ?? ''}`}
      >
        {kind}
      </Badge>
      <RecordLink to={to} className='font-heading text-base font-medium'>
        {title}
      </RecordLink>
      {/* A dot between them: the job is about the person, not part of their
          name, and side by side with only a gap the two read as one phrase.
          The same dot separates the details on a row in the list. */}
      {subtitle ? (
        <span className='text-sm text-muted-foreground'>· {subtitle}</span>
      ) : null}
    </div>
  );
}

function OpenFullPage({
  onLeave,
}: {
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex h-10 items-center justify-end px-3'>
      <Button variant='ghost' size='sm' onClick={() => onLeave('')}>
        <ExternalLink data-icon='inline-start' />
        {t('common.openFullPage')}
      </Button>
    </div>
  );
}

/** A to-do as a filter: what is waiting, and the way to see only it. */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
      <span className='tabular-nums'>{count}</span>
    </button>
  );
}

/** The pane's own location, which the plain button cannot read from outside. */
function OpenPaneFullPage({
  onLeave,
}: {
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const location = useLocation();
  return (
    <OpenFullPage
      onLeave={() => onLeave(`${location.pathname}${location.search}`)}
    />
  );
}

function WorkRow({
  kind,
  tone,
  record,
  chosen,
  onChoose,
}: {
  /** Which to-do it belongs to, which no heading says any more. */
  readonly kind: string;
  /** That to-do's own colour, so the eye sorts the queue without reading. */
  readonly tone: string | undefined;
  readonly record: CardRecord;
  readonly chosen: boolean;
  readonly onChoose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type='button'
      aria-current={chosen}
      onClick={onChoose}
      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
        chosen ? 'bg-muted shadow-[inset_2px_0_0_var(--primary)]' : ''
      }`}
    >
      <span className='flex min-w-0 items-center gap-2'>
        {/* One tag, naming the to-do rather than the record's own kind: in
            a flat list that is what tells the rows apart, and the title
            already says what the record is. */}
        <Badge
          variant={tone ? undefined : 'outline'}
          className={`shrink-0 ${tone ?? ''}`}
        >
          {kind}
        </Badge>
        <span className='truncate font-medium'>{record.title}</span>
        {record.subtitle ? (
          <span className='truncate text-xs text-muted-foreground'>
            {record.subtitle}
          </span>
        ) : null}
      </span>
      <span className='flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums'>
        {/* Where a record stands for several things — a leaver holds a
            number of them — how many are the reader's own. */}
        {record.count === undefined ? null : (
          <span>{t('workbench.work.mine', { count: record.count })}</span>
        )}
        {record.count !== undefined && record.date ? <span>·</span> : null}
        {record.date ? <span>{formatDate(record.date)}</span> : null}
      </span>
    </button>
  );
}
