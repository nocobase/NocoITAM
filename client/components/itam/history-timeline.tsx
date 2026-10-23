import { AssetTypeBadge } from './asset-type-badge.js';
import { isAssetTypeField } from '@/lib/itam/fields';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { ChevronDown, Sparkles } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useApi } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { formatDate, formatMoney, relativeTime, text } from '@/lib/itam/format';
import { HistoryIcon } from '@/lib/itam/history-icons';
import {
  bucketOf,
  groupEdits,
  layoutTimeline,
  type HistoryBucket,
  type TimelineUnit,
} from '@/lib/itam/history-layout';
import { recordKindOf } from '@/lib/itam/record-kind';
import { referenceRoute, useReferenceNames } from '@/lib/itam/references';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import {
  describeEvent,
  describeEventParts,
  eventTargetLink,
  quickActionLink,
  quickActionLinkedDetail,
} from '@/lib/itam/history-event';
import { cn } from '@/lib/utils';

import { useColleagues } from './comments/colleagues.js';
import {
  CommentComposer,
  CommentThread,
  type CommentScope,
} from './comments/comments.js';
import { EmptyState } from './empty-state.js';
import { RecordLink } from './record-link.js';

/**
 * What put the line there, beside who it is attributed to. Absent on rows
 * written before it was recorded, and `human` on a person's own edit —
 * neither is shown, because saying so on every line says nothing.
 */
export type HistoryOrigin =
  'human' | 'agent' | 'ai' | 'import' | 'schedule' | 'sync' | 'install';

export interface HistoryEvent {
  readonly origin?: HistoryOrigin | null;
  readonly id: string;
  readonly type: string;
  readonly summary: string;
  readonly payload: Record<string, unknown> | null;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export interface ChangeLogEntry {
  readonly origin?: HistoryOrigin | null;
  readonly id: string;
  readonly action: string;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorId: string | null;
  readonly createdAt: string;
}

/** Which enum a record's `from` / `to` status values belong to, by API path. */
const STATUS_ENUMS: Readonly<Record<string, string>> = {
  'itam/audits': 'auditStatus',
  'itam/disposals': 'disposalStatus',
  'itam/purchase-orders': 'poStatus',
};

/** One line of the merged timeline: an event, the fields it changed, or both. */
export interface TimelineItem {
  readonly origin?: HistoryOrigin | null;
  readonly id: string;
  readonly createdAt: string;
  readonly actorId: string | null;
  readonly event: HistoryEvent | null;
  readonly changes: readonly ChangeLogEntry[];
  /** A comment's replies, oldest first. */
  readonly replies?: readonly HistoryEvent[];
}

interface PageResult<T> {
  readonly data: readonly T[];
  readonly total: number;
}

/**
 * One record's story: the business events and the field changes of the same
 * operation on one line, newest first, all in one list — there is no
 * events / changes switch.
 */
/** The record's currency, for money changes deep in the timeline's rows. */
const CurrencyContext = createContext<string | null>(null);
/**
 * How the record's page shows a value it renders itself (an audit's scope,
 * a list of people), so a change reads as the page reads, not as JSON.
 */
type DisplayValue = (
  field: FieldDefinition,
  value: unknown,
) => ReactNode | undefined;
const DisplayContext = createContext<DisplayValue | undefined>(undefined);

/** What the history shows: everything, what people wrote, or what changed. */
type HistoryFilter = 'all' | 'comments' | 'changes';
const HISTORY_FILTERS: readonly HistoryFilter[] = [
  'all',
  'comments',
  'changes',
];
// Remembered in this browser, a convenience: blocked storage only means the
// history opens on everything.
const FILTER_KEY = 'nocoitam:history-filter';
function readFilter(): HistoryFilter {
  try {
    const stored = localStorage.getItem(FILTER_KEY);
    return HISTORY_FILTERS.find((filter) => filter === stored) ?? 'all';
  } catch {
    return 'all';
  }
}

/**
 * A line's time under its heading: how long ago, today; the time of day,
 * yesterday; the date otherwise (its year is the heading's). The full stamp
 * shows on hover either way.
 */
function timeLabel(iso: string, language: string, justNow: string): string {
  const bucket = bucketOf(iso);
  if (bucket === 'today') return relativeTime(iso, language, justNow);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(
    language,
    bucket === 'yesterday'
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { month: 'short', day: 'numeric' },
  ).format(date);
}

/** A heading: 今天, 昨天, 最近 7 天, 本月, 今年, or the year. */
function bucketLabel(bucket: HistoryBucket, t: Translate): string {
  return bucket.startsWith('yr-')
    ? t('history.inYear', { year: bucket.slice(3) })
    : t(`history.buckets.${bucket}`);
}

export function HistoryTimeline({
  path,
  id,
  keyLabels,
  fields = [],
  currency = null,
  displayValue,
}: {
  readonly path: string;
  readonly id: string;
  /** The page's own rendering of the values it does not show generically. */
  readonly displayValue?: DisplayValue;
  /** The record's currency: money changes read as an amount in it. */
  readonly currency?: string | null;
  /** The record's field definitions, so changes show labels and typed values. */
  readonly fields?: readonly FieldDefinition[];
  /** Labels for keys inside JSON fields, e.g. a category's extended fields. */
  readonly keyLabels?: Readonly<Record<string, string>>;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const colleagues = useColleagues();
  const subjectType = recordKindOf(path);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState<HistoryFilter>(readFilter);
  // The folds the reader opened, by id; one opened stays open.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const pageSize = 30;
  const query = useQuery({
    queryKey: ['itam', path, 'history', id, 'all', pages],
    queryFn: () =>
      api.request<PageResult<TimelineItem>>({
        path: `${path}/${id}/history`,
        query: { kind: 'all', page: 1, pageSize: pageSize * pages },
      }),
  });

  const items = query.data?.data ?? [];
  // A notification about a comment opens the history at it (?focus=), as
  // NocoCRM's does: brought into view once loaded, and lit up once.
  const [search] = useSearchParams();
  const focus = search.get('focus');
  const loaded = items.length;
  useEffect(() => {
    if (!focus || !loaded) return;
    const element = document.getElementById(`history-${focus}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center' });
    element.classList.add('rounded-md', 'bg-accent');
    const timer = setTimeout(
      () => element.classList.remove('rounded-md', 'bg-accent'),
      2000,
    );
    return () => clearTimeout(timer);
  }, [focus, loaded]);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  // Reference ids in old / new values resolve to names, grouped by collection.
  const referenceIds = new Map<string, (string | null)[]>();
  for (const item of items)
    for (const change of item.changes) {
      const field = change.field ? fieldByKey.get(change.field) : undefined;
      if (field?.type !== 'reference' || !field.reference) continue;
      const list = referenceIds.get(field.reference.collection) ?? [];
      for (const value of [change.oldValue, change.newValue])
        if (typeof value === 'string' && value) list.push(value);
      referenceIds.set(field.reference.collection, list);
    }
  const names = useReferenceNames([
    {
      collection: 'users',
      // Who acted, who replied, and who an approval request was addressed to.
      ids: items.flatMap((item) => [
        item.actorId,
        ...(item.replies ?? []).map((reply) => reply.actorId),
        typeof item.event?.payload?.approverId === 'string'
          ? item.event.payload.approverId
          : null,
      ]),
    },
    ...[...referenceIds.entries()].map(([collection, ids]) => ({
      collection,
      ids,
    })),
  ]);

  if (query.isLoading) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-5 w-1/2' />
        <Skeleton className='h-5 w-2/3' />
      </div>
    );
  }
  const statusEnum = STATUS_ENUMS[path] ?? 'deviceStatus';
  const loadMore =
    (query.data?.total ?? 0) > items.length ? (
      <Button
        variant='outline'
        onClick={() => setPages((current) => current + 1)}
      >
        {t('common.loadMore')}
      </Button>
    ) : null;

  // Everybody a comment may name: IT's accounts, and whoever wrote one
  // here even if they are no longer among them.
  const people = [
    ...colleagues.all,
    ...[...(names.users?.entries() ?? [])]
      .filter(([id]) => !colleagues.all.some((person) => person.id === id))
      .map(([id, name]) => ({ id, name })),
  ];
  const scope: CommentScope | undefined = subjectType
    ? {
        subjectType,
        subjectId: id,
        colleagues: colleagues.mentionable,
        people,
        me: colleagues.me,
      }
    : undefined;

  // The history (2026-10-16, after Linear's and Attio's activity rather than
  // NocoCRM's 动态 it started from): the comment box atop, a 全部 / 评论 /
  // 变更 switch, then the lines newest first under day headings — changes as
  // quiet single lines, a person's edits of one sitting folded into one,
  // long runs of changes between comments folded behind a count, and
  // comments as tinted cards among them.
  const shown = items.filter(
    (item) =>
      filter === 'all' ||
      (filter === 'comments') === (item.event?.type === 'comment'),
  );
  const entries = layoutTimeline(groupEdits(shown), opened);
  const row = (unit: TimelineUnit<TimelineItem>) =>
    unit.kind === 'item' ? (
      <TimelineRow
        key={unit.id}
        item={unit.item}
        scope={scope}
        fieldByKey={fieldByKey}
        keyLabels={keyLabels}
        names={names}
        statusEnum={statusEnum}
        language={i18n.language}
        t={t}
      />
    ) : (
      <EditsRow
        key={unit.id}
        items={unit.items}
        scope={scope}
        fieldByKey={fieldByKey}
        keyLabels={keyLabels}
        names={names}
        statusEnum={statusEnum}
        language={i18n.language}
        t={t}
      />
    );
  return (
    <CurrencyContext.Provider value={currency}>
      <DisplayContext.Provider value={displayValue}>
        <div className='space-y-4'>
          {scope ? <CommentComposer scope={scope} /> : null}
          {items.length > 0 ? (
            <Tabs
              value={filter}
              onValueChange={(value) => {
                const next = value as HistoryFilter;
                setFilter(next);
                try {
                  localStorage.setItem(FILTER_KEY, next);
                } catch {
                  // Storage unavailable: kept until the page is left.
                }
              }}
            >
              <TabsList>
                {HISTORY_FILTERS.map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {t(`history.filter.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          {shown.length === 0 ? (
            <EmptyState title={t('history.empty')} />
          ) : (
            <ol>
              {entries.map((entry) =>
                entry.kind === 'day' ? (
                  <li
                    key={entry.id}
                    className='pt-4 pb-1.5 text-xs font-medium text-muted-foreground first:pt-0'
                  >
                    {bucketLabel(entry.bucket, t)}
                  </li>
                ) : entry.kind === 'fold' ? (
                  <li key={entry.id} className='flex gap-3 py-1'>
                    <span className='w-5 shrink-0' />
                    <button
                      type='button'
                      className='text-xs text-link'
                      onClick={() =>
                        setOpened((current) => new Set([...current, entry.id]))
                      }
                    >
                      {t('history.moreChanges', {
                        count: entry.units.reduce(
                          (sum, unit) =>
                            sum +
                            (unit.kind === 'item' ? 1 : unit.items.length),
                          0,
                        ),
                      })}
                    </button>
                  </li>
                ) : (
                  row(entry.unit)
                ),
              )}
            </ol>
          )}
          {loadMore}
        </div>
      </DisplayContext.Provider>
    </CurrencyContext.Provider>
  );
}

/**
 * A person's field edits of one sitting, folded: who, how many things they
 * changed, when; opened, each edit as its own line beneath.
 */
function EditsRow({
  items,
  ...rest
}: Omit<Parameters<typeof TimelineRow>[0], 'item'> & {
  readonly items: readonly TimelineItem[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const first = items[0];
  const actor = first.actorId
    ? actorName(rest.names.users, first.actorId, rest.t)
    : undefined;
  const count = items.reduce((sum, item) => sum + item.changes.length, 0);
  return (
    <li className='py-1.5'>
      <div className='flex gap-3'>
        <span className='flex h-6 w-5 shrink-0 items-center justify-center'>
          <HistoryIcon
            type={undefined}
            className='size-3.5 text-muted-foreground'
          />
        </span>
        <div className='flex min-w-0 flex-1 items-start gap-3 text-sm'>
          <p className='min-w-0 flex-1 leading-6'>
            {actor ? <span className='font-semibold'>{actor} </span> : null}
            <span className='text-muted-foreground'>
              {rest.t('history.editedFields', { count })}
            </span>{' '}
            {/* A chevron rather than a word (2026-10-16): the line is short,
                and a link after it read as part of the sentence. */}
            <button
              type='button'
              aria-expanded={open}
              aria-label={
                open
                  ? rest.t('history.hideFields')
                  : rest.t('history.showEdits')
              }
              title={
                open
                  ? rest.t('history.hideFields')
                  : rest.t('history.showEdits')
              }
              className='inline-flex size-5 items-center justify-center rounded align-middle text-muted-foreground hover:bg-accent hover:text-foreground'
              onClick={() => setOpen((current) => !current)}
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden='true'
              />
            </button>
          </p>
          <time
            dateTime={first.createdAt}
            title={formatDate(first.createdAt, true)}
            className='shrink-0 text-xs leading-6 text-muted-foreground/80 tabular-nums'
          >
            {timeLabel(
              first.createdAt,
              rest.language,
              rest.t('comments.justNow'),
            )}
          </time>
        </div>
      </div>
      {open ? (
        <ol className='mt-1 ml-8 border-l border-border pl-3'>
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} {...rest} nested />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/**
 * What an event's own sentence already states, so the line does not offer to
 * open it and say the same thing again. An operation that touches anything
 * else still folds that.
 */
const IMPLIED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  assign: ['assigneeType', 'assigneeId', 'assignedAt', 'status'],
  return: ['assigneeType', 'assigneeId', 'assignedAt', 'status'],
  transfer: ['assigneeType', 'assigneeId', 'assignedAt', 'status'],
  loan: ['assigneeType', 'assigneeId', 'assignedAt', 'returnDueDate', 'status'],
  reserve: ['reservedForType', 'reservedForId', 'reservedUntil', 'status'],
  unreserve: ['reservedForType', 'reservedForId', 'reservedUntil', 'status'],
  statusChange: ['status'],
  // Completing a repair: the line names the result and where the device
  // went (its status), and the return date is when. On the device, sending
  // it to repair is what moved its status.
  repairCompleted: ['result', 'actualReturnAt', 'status'],
  repairCreated: ['status'],
  // An approval step names the status it moved the request to.
  approvalRequested: ['status'],
  approvalWithdrawn: ['status'],
  approvalApproved: ['status'],
  approvalRejected: ['status'],
  disposalExecuted: ['status'],
  signed: ['signedAt', 'status'],
  markLeft: ['employmentStatus', 'leaveDate'],
};

/** One line, with its field changes folded in until they are asked for. */
function TimelineRow({
  item,
  scope,
  fieldByKey,
  keyLabels,
  names,
  statusEnum,
  language,
  t,
  nested,
}: {
  readonly item: TimelineItem;
  /**
   * Inside a folded sitting's edits (`EditsRow`), whose line already names
   * who and wears the icon: each edit says only what changed (2026-10-16).
   */
  readonly nested?: boolean;
  readonly scope: CommentScope | undefined;
  readonly language: string;
  readonly fieldByKey: ReadonlyMap<string, FieldDefinition>;
  readonly keyLabels?: Readonly<Record<string, string>>;
  readonly names: Record<string, ReadonlyMap<string, string> | undefined>;
  readonly statusEnum: string;
  readonly t: Translate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const actor = item.actorId
    ? actorName(names.users, item.actorId, t)
    : undefined;
  // An approval request says whom it waits for: the approver's name comes
  // from the same directory as the actor's.
  const approverId =
    item.event?.type === 'approvalRequested' &&
    typeof item.event.payload?.approverId === 'string'
      ? item.event.payload.approverId
      : undefined;
  const event =
    item.event && approverId
      ? {
          ...item.event,
          payload: {
            ...item.event.payload,
            targetLabel: names.users?.get(approverId) ?? approverId,
          },
        }
      : item.event;
  const link = event ? quickActionLink(event) : undefined;
  // Linked only where the summary actually names the record and it has a page.
  const named = event ? eventTargetLink(event) : undefined;
  const summaryParts =
    event && named
      ? describeEventParts(event, t, statusEnum, named.slot)
      : undefined;
  const target = summaryParts?.linked ? named : undefined;
  const linkedDetail = event ? quickActionLinkedDetail(event, t) : '';
  const fieldLabel = (change: ChangeLogEntry) =>
    change.field
      ? (() => {
          const field = fieldByKey.get(change.field);
          return field
            ? t(field.label)
            : t(`fields.${change.field}`, { defaultValue: change.field });
        })()
      : t(`history.actions.${change.action}`, { defaultValue: change.action });
  // One change of its own reads as the field it touched; the rest fold
  // behind a count — except what the event has already said. An assignment
  // that reports the new status needs no "1 field" to open and find the
  // status again.
  const single =
    !event && item.changes.length === 1 ? item.changes[0] : undefined;
  // One field set to a plain value reads as one line (2026-10-21):
  // 「更新 规格说明 → 新值」, the value cut to the line, the old and the
  // whole new one on hover. Lists and structured values keep their lines.
  const compact = Boolean(
    single?.field && isCompactChange(single, fieldByKey.get(single.field)),
  );
  // The one entry a list change added, removed or changed, said up front.
  const soleKind =
    single?.field && !compact
      ? soleEntryKind(
          single.field,
          single.oldValue,
          single.newValue,
          fieldByKey.get(single.field),
          t,
          keyLabels,
        )
      : undefined;
  const folded = single
    ? []
    : item.changes.filter(
        (change) =>
          !change.field ||
          !(IMPLIED_FIELDS[event?.type ?? ''] ?? []).includes(change.field),
      );
  const comment = event?.type === 'comment' && scope ? event : undefined;
  // A comment is a card of its own, its writer's round in place of an icon.
  if (comment && scope)
    return (
      <li className='py-2'>
        <CommentThread comment={comment} replies={item.replies} scope={scope} />
      </li>
    );
  // Done by a job or a sync rather than a person: quieter still.
  const automatic = item.origin === 'schedule' || item.origin === 'sync';
  return (
    <li className={cn('flex gap-3', nested ? 'py-0.5' : 'py-1.5')}>
      {/* Each line's icon, on no rail: the day headings carry the order. */}
      {nested ? null : (
        <span className='flex h-6 w-5 shrink-0 items-center justify-center'>
          <HistoryIcon
            type={event?.type}
            // One colour: the AI tag on the line says who wrote it.
            className='size-3.5 text-muted-foreground'
          />
        </span>
      )}
      <div className={cn('min-w-0 flex-1 text-sm', automatic && 'opacity-80')}>
        {
          <>
            <div className='flex items-start gap-3'>
              {/* A sentence: who, what they did, what changed. Inline text,
                  so it wraps like one. */}
              <p
                className={cn(
                  'min-w-0 flex-1 leading-6',
                  compact
                    ? 'flex items-baseline gap-x-1.5 whitespace-nowrap'
                    : 'whitespace-pre-wrap',
                )}
              >
                {actor && !nested ? (
                  <span className={cn('font-semibold', compact && 'shrink-0')}>
                    {actor}{' '}
                  </span>
                ) : null}
                <span
                  className={cn('text-muted-foreground', compact && 'shrink-0')}
                >
                  {event
                    ? t(`history.types.${event.type}`, {
                        defaultValue: event.type,
                      })
                    : single
                      ? // A verb before the field (2026-10-22): one entry of a
                        // list added or removed says which, 新增 职位 计数总监;
                        // anything else 修改 扩展字段, its entries following.
                        single.field
                        ? t('history.updatedField', {
                            verb: t(`history.entry.${soleKind ?? 'changed'}`),
                            field: fieldLabel(single),
                          })
                        : fieldLabel(single)
                      : t('history.fieldsChanged', {
                          count: item.changes.length,
                        })}
                </span>
                {event ? (
                  <span className='text-foreground/80'>
                    {event.type === 'quickAction' ? '' : ' '}
                    {target ? (
                      // The record the summary names opens where it is named. What
                      // follows the name may be typed — a return's condition — so
                      // it folds like any other summary (2026-10-16).
                      <>
                        {summaryParts?.before}
                        <RecordLink to={target.to} className='text-link'>
                          {target.label}
                        </RecordLink>
                        {summaryParts?.after ? (
                          <CollapsibleText text={summaryParts.after} />
                        ) : null}
                      </>
                    ) : (
                      // A note, a cancellation reason, an approver's comment: any
                      // summary may carry what someone typed, so all of them fold.
                      <CollapsibleText
                        text={describeEvent(event, t, statusEnum)}
                      />
                    )}
                    {link ? (
                      <>
                        {' '}
                        <RecordLink to={link.to} className='text-link'>
                          {link.label}
                        </RecordLink>
                        {linkedDetail
                          ? t('history.quick.detailWrap', {
                              detail: linkedDetail,
                            })
                          : ''}
                      </>
                    ) : null}
                  </span>
                ) : null}
                {single?.field ? (
                  <span
                    className={cn(
                      'text-foreground/80',
                      compact && 'flex min-w-0',
                    )}
                  >
                    {compact ? null : ' '}
                    <ChangeValue
                      field={fieldByKey.get(single.field)}
                      fieldKey={single.field}
                      oldValue={single.oldValue}
                      newValue={single.newValue}
                      names={names}
                      keyLabels={keyLabels}
                      t={t}
                      compact={compact}
                      kindSaid={Boolean(soleKind)}
                    />
                  </span>
                ) : null}
                {folded.length > 0 ? (
                  // Right after the sentence that counts them, the chevron
                  // the folded edits around it use (2026-10-20).
                  <>
                    {' '}
                    <button
                      type='button'
                      aria-expanded={open}
                      aria-label={t(
                        open ? 'history.hideFields' : 'history.showFields',
                      )}
                      title={t(
                        open ? 'history.hideFields' : 'history.showFields',
                      )}
                      className='inline-flex size-5 items-center justify-center rounded align-middle text-muted-foreground hover:bg-accent hover:text-foreground'
                      onClick={() => setOpen((current) => !current)}
                    >
                      <ChevronDown
                        className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                        aria-hidden='true'
                      />
                    </button>
                  </>
                ) : null}
                {item.origin === 'ai' || item.origin === 'agent' ? (
                  // A tag for what AI wrote (2026-10-20): AI 整理 / 完善, or
                  // a plan Asset Steward proposed, saved by the person named.
                  <span className='ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium text-primary'>
                    <Sparkles className='size-3' aria-hidden='true' />
                    {t(`history.origin.${item.origin}`)}
                  </span>
                ) : item.origin && item.origin !== 'human' ? (
                  <span className='ml-1.5 text-muted-foreground'>
                    · {t(`history.origin.${item.origin}`)}
                  </span>
                ) : null}
              </p>
              {/* How long ago, the full time on hover. */}
              <time
                dateTime={item.createdAt}
                title={formatDate(item.createdAt, true)}
                className='shrink-0 text-xs leading-6 text-muted-foreground/80 tabular-nums'
              >
                {timeLabel(item.createdAt, language, t('comments.justNow'))}
              </time>
            </div>
            {folded.length > 0 && open ? (
              <ul className='mt-1 space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs'>
                {folded.map((change) => {
                  // As a one-field line reads (2026-10-21): the field and
                  // its new value, the old one on hover; a list or a
                  // structured value keeps its lines.
                  const field = change.field
                    ? fieldByKey.get(change.field)
                    : undefined;
                  const plain = isCompactChange(change, field);
                  return (
                    <li
                      key={change.id}
                      className={cn(
                        plain && 'flex min-w-0 items-baseline gap-x-1.5',
                      )}
                    >
                      <span
                        className={cn(
                          'text-muted-foreground',
                          plain && 'shrink-0',
                        )}
                      >
                        {fieldLabel(change)}
                      </span>
                      {plain ? null : ' '}
                      {change.field ? (
                        <ChangeValue
                          field={field}
                          fieldKey={change.field}
                          oldValue={change.oldValue}
                          newValue={change.newValue}
                          names={names}
                          keyLabels={keyLabels}
                          t={t}
                          compact={plain}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        }
      </div>
    </li>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Who did it, by name (2026-10-21): an account since deleted reads as
 * such rather than as its id, and nothing shows while the names load —
 * the directory answers every id it knows once it has loaded.
 */
function actorName(
  users: ReadonlyMap<string, string> | undefined,
  id: string,
  t: Translate,
): string {
  if (!users) return '';
  return users.get(id) ?? t('history.formerUser');
}

/**
 * The value a change replaced: struck through and quiet, so the line reads
 * as old → new at a glance (2026-10-16, as Attio's and Jira's history do).
 * An empty one stays a plain dash.
 */
const OLD_VALUE =
  'text-muted-foreground line-through decoration-muted-foreground/50';
const oldClass = (shown: unknown): string =>
  shown === '—' || shown === undefined ? 'text-muted-foreground' : OLD_VALUE;

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '';

/** A scalar value shown the way the field would show it. */
function formatScalar(
  value: unknown,
  field: FieldDefinition | undefined,
  names: Record<string, ReadonlyMap<string, string> | undefined>,
  t: Translate,
  currency: string | null = null,
): string {
  if (isEmpty(value)) return '—';
  switch (field?.type) {
    case 'money':
      return formatMoney(value, currency) || text(value);
    case 'boolean':
      return value ? t('common.yes') : t('common.no');
    case 'date':
      return formatDate(value, field.key.endsWith('At'));
    case 'percent':
      return `${Math.round(Number(value) * 10000) / 100}%`;
    case 'select':
    case 'multiselect': {
      const values = Array.isArray(value) ? value : [value];
      return values
        .map((entry) => {
          const option = field.options?.find((o) => o.value === text(entry));
          return option ? t(option.label) : text(entry);
        })
        .join(', ');
    }
    case 'reference':
      return (
        (field.reference &&
          names[field.reference.collection]?.get(text(value))) ??
        text(value)
      );
    default:
      return typeof value === 'boolean'
        ? value
          ? t('common.yes')
          : t('common.no')
        : text(value);
  }
}

/** Old → new for a change; structured values become a per-key diff. */
function ChangeValue({
  field,
  fieldKey,
  oldValue,
  newValue,
  names,
  keyLabels,
  t,
  compact = false,
  kindSaid = false,
}: {
  readonly field: FieldDefinition | undefined;
  readonly fieldKey: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly names: Record<string, ReadonlyMap<string, string> | undefined>;
  readonly keyLabels?: Readonly<Record<string, string>>;
  readonly t: Translate;
  /** `→ new` on one line, the rest on hover (`isCompactChange`). */
  readonly compact?: boolean;
  /** The sentence already said 新增 / 删除 / 修改 for a lone entry. */
  readonly kindSaid?: boolean;
}): ReactElement {
  const currency = useContext(CurrencyContext);
  const displayValue = useContext(DisplayContext);
  const shown = (value: unknown) =>
    field && !isEmpty(value) ? displayValue?.(field, value) : undefined;
  const ownFrom = shown(oldValue);
  const ownTo = shown(newValue);
  if (compact && (ownFrom !== undefined || ownTo !== undefined))
    return (
      <CompactChange from={ownFrom ?? '—'} to={ownTo ?? '—'} t={t}>
        {ownTo ?? '—'}
      </CompactChange>
    );
  if (ownFrom !== undefined || ownTo !== undefined)
    return (
      <span className='inline-flex flex-wrap items-baseline gap-x-2 break-words'>
        <span
          className={
            ownFrom === undefined ? 'text-muted-foreground' : OLD_VALUE
          }
        >
          {ownFrom ?? '—'}
        </span>
        <span aria-hidden='true' className='text-muted-foreground'>
          →
        </span>
        <span>{ownTo ?? '—'}</span>
      </span>
    );
  // Attaching a file is an event now; rows written before that are still
  // field changes and read as the sentence they always did.
  if (fieldKey === 'attachments')
    return (
      <span className='break-words'>
        {newValue
          ? t('history.attachmentAdded', { name: text(newValue) })
          : t('history.attachmentRemoved', { name: text(oldValue) })}
      </span>
    );
  const structured =
    (oldValue !== null && typeof oldValue === 'object') ||
    (newValue !== null && typeof newValue === 'object');
  if (structured && field?.type !== 'multiselect') {
    const lines = diffStructured(fieldKey, oldValue, newValue, t, keyLabels);
    // One key changed reads as part of the sentence; several keep a line
    // each, which is what a list is for.
    if (lines.length === 1) {
      const line = lines[0];
      return (
        <span className='inline-flex flex-wrap items-baseline gap-x-2'>
          {line.kind && !kindSaid ? <KindTag kind={line.kind} t={t} /> : null}
          {line.label ? (
            <span className='text-muted-foreground'>{line.label}</span>
          ) : null}
          {line.from !== undefined ? (
            <>
              <span className={oldClass(line.from)}>{line.from}</span>
              <span aria-hidden='true' className='text-muted-foreground'>
                →
              </span>
            </>
          ) : null}
          <span
            className={cn(line.to === undefined && 'text-muted-foreground')}
          >
            {line.to ?? t('history.removed')}
          </span>
        </span>
      );
    }
    return (
      // The size of where it sits: a folded list is small, a sentence not;
      // indented under the field it belongs to.
      <ul className='space-y-0.5 pl-3'>
        {lines.map((line) => (
          <li key={line.key} className='flex flex-wrap items-baseline gap-x-2'>
            {line.kind ? <KindTag kind={line.kind} t={t} /> : null}
            {line.label ? (
              <span className='text-muted-foreground'>{line.label}</span>
            ) : null}
            {line.from !== undefined ? (
              <>
                <span className={oldClass(line.from)}>{line.from}</span>
                <span aria-hidden='true' className='text-muted-foreground'>
                  →
                </span>
              </>
            ) : null}
            <span
              className={cn(line.to === undefined && 'text-muted-foreground')}
            >
              {line.to ?? t('history.removed')}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (field && isAssetTypeField(field))
    return (
      <span className='inline-flex flex-wrap items-center gap-2'>
        <AssetTypeBadge value={oldValue} />
        <span aria-hidden='true'>→</span>
        <AssetTypeBadge value={newValue} />
      </span>
    );
  const from = formatScalar(oldValue, field, names, t, currency);
  const to = formatScalar(newValue, field, names, t, currency);
  // Long text (a description, a note) keeps its line breaks and folds.
  const long = field?.type === 'textarea';
  // A reference names a record: it opens the record it names, the way an
  // event's own summary does.
  const reference = (value: unknown, label: string, muted: boolean) => {
    const collection = field?.reference?.collection;
    if (
      field?.type !== 'reference' ||
      !collection ||
      typeof value !== 'string' ||
      !value
    )
      return <span className={muted ? oldClass(label) : ''}>{label}</span>;
    return (
      <RecordLink
        to={`/${referenceRoute(collection)}/${value}`}
        className={cn(
          'text-link',
          muted && 'line-through decoration-link/50 opacity-70',
        )}
      >
        {label}
      </RecordLink>
    );
  };
  if (compact)
    return (
      <CompactChange from={from} to={to} t={t}>
        {reference(newValue, to, false)}
      </CompactChange>
    );
  return (
    <span className='inline-flex flex-wrap items-baseline gap-x-2 break-words'>
      {long ? (
        <CollapsibleText text={from} className={oldClass(from)} />
      ) : (
        reference(oldValue, from, true)
      )}
      <span aria-hidden='true' className='text-muted-foreground'>
        →
      </span>
      {long ? <CollapsibleText text={to} /> : reference(newValue, to, false)}
    </span>
  );
}

/**
 * Whether a change reads as one line: a plain value (text, a number, a
 * date, a choice, a reference), not a list, a structured value, an
 * attachment or the asset type's tags.
 */
function isCompactChange(
  change: {
    readonly field?: string | null;
    oldValue: unknown;
    newValue: unknown;
  },
  field: FieldDefinition | undefined,
): boolean {
  if (!change.field || change.field === 'attachments') return false;
  if (field && (isAssetTypeField(field) || field.type === 'multiselect'))
    return false;
  const plain = (value: unknown) => value === null || typeof value !== 'object';
  return plain(change.oldValue) && plain(change.newValue);
}

/** `→ new`, cut to the line; the old and the whole new one on hover. */
function CompactChange({
  from,
  to,
  t,
  children,
}: {
  readonly from: ReactNode;
  readonly to: ReactNode;
  readonly t: Translate;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className='flex min-w-0 items-baseline gap-x-1.5' />}
      >
        <span aria-hidden='true' className='shrink-0 text-muted-foreground'>
          →
        </span>
        <span className='min-w-0 truncate'>{children}</span>
      </TooltipTrigger>
      <TooltipContent className='max-w-sm whitespace-pre-wrap'>
        {t('history.wasLabel')} {from}
        {'\n'}
        {t('history.nowLabel')} {to}
      </TooltipContent>
    </Tooltip>
  );
}

interface DiffLine {
  readonly key: string;
  readonly label: string;
  readonly from?: string;
  readonly to?: string;
  /** In a list of entries (a field template): what happened to this one. */
  readonly kind?: 'added' | 'removed' | 'changed';
}

type Entry = Record<string, unknown> | undefined;

const KIND_ORDER = { changed: 0, added: 1, removed: 2 } as const;
/**
 * 修改 / 新增 / 删除 before an entry of a list, as a muted word (2026-10-22;
 * a coloured tag until then), the way 「修改 字段」 reads on one line.
 */
function KindTag({
  kind,
  t,
}: {
  readonly kind: NonNullable<DiffLine['kind']>;
  readonly t: Translate;
}): ReactElement {
  return (
    <span className='shrink-0 text-muted-foreground'>
      {t(`history.entry.${kind}`)}
    </span>
  );
}

/** The kind of a list change's one entry, when it changed exactly one. */
function soleEntryKind(
  fieldKey: string,
  oldValue: unknown,
  newValue: unknown,
  field: FieldDefinition | undefined,
  t: Translate,
  keyLabels: Readonly<Record<string, string>> | undefined,
): DiffLine['kind'] {
  const structured =
    (oldValue !== null && typeof oldValue === 'object') ||
    (newValue !== null && typeof newValue === 'object');
  if (!structured || field?.type === 'multiselect') return undefined;
  const lines = diffStructured(fieldKey, oldValue, newValue, t, keyLabels);
  return lines.length === 1 ? lines[0].kind : undefined;
}

/**
 * Per-key comparison of two JSON values: an array of `{key,label,…}` (a
 * field template) diffs by entry key and describes each entry by its label;
 * any other object diffs by property.
 */
function diffStructured(
  fieldKey: string,
  oldValue: unknown,
  newValue: unknown,
  t: Translate,
  keyLabels: Readonly<Record<string, string>> = {},
): DiffLine[] {
  const describeEntry = (entry: unknown): string => {
    // A plain entry (a department's position) as itself, not quoted JSON
    // (2026-10-22).
    if (typeof entry === 'string' || typeof entry === 'number')
      return String(entry);
    if (entry && typeof entry === 'object' && 'label' in entry) {
      const e = entry as {
        label?: unknown;
        type?: unknown;
        options?: unknown;
        required?: unknown;
        hidden?: unknown;
      };
      const parts = [text(e.label)];
      if (typeof e.type === 'string')
        parts.push(
          t(`fieldTemplate.types.${e.type}`, { defaultValue: e.type }),
        );
      if (Array.isArray(e.options) && e.options.length)
        parts.push(`(${e.options.map(text).join(', ')})`);
      if (e.required) parts.push('*');
      if (e.hidden) parts.push(t('fieldTemplate.hiddenShort'));
      return parts.join(' ');
    }
    return JSON.stringify(entry);
  };
  const toMap = (value: unknown): Map<string, unknown> => {
    if (Array.isArray(value)) {
      return new Map(
        value.map((entry, index) => [
          entry && typeof entry === 'object' && 'key' in entry
            ? String((entry as { key: unknown }).key)
            : // A plain entry by itself, so removing one in the middle
              // does not read as the rest each changing (2026-10-22).
              typeof entry === 'string' || typeof entry === 'number'
              ? `=${String(entry)}`
              : String(index),
          entry,
        ]),
      );
    }
    if (value && typeof value === 'object')
      return new Map(Object.entries(value as Record<string, unknown>));
    return new Map();
  };
  const before = toMap(oldValue);
  const after = toMap(newValue);
  const isArray = Array.isArray(oldValue) || Array.isArray(newValue);
  const lines: DiffLine[] = [];
  /**
   * A template entry that changed, by what changed (2026-10-20): its label
   * when that changed, else the label names it and only the rest differs.
   */
  const changedEntry = (key: string, a: unknown, b: unknown): DiffLine => {
    if (!a || typeof a !== 'object' || !b || typeof b !== 'object')
      return {
        key,
        kind: 'changed',
        label: '',
        from: describeEntry(a),
        to: describeEntry(b),
      };
    const one = (entry: unknown, part: string): string => {
      const e = entry as Record<string, unknown>;
      if (part === 'type')
        return t(`fieldTemplate.types.${text(e.type)}`, {
          defaultValue: text(e.type),
        });
      if (part === 'options')
        return Array.isArray(e.options)
          ? `(${e.options.map(text).join(', ')})`
          : '—';
      if (part === 'required')
        return e.required ? t('fieldTemplate.required') : t('common.no');
      if (part === 'hidden')
        return e.hidden ? t('fieldTemplate.hiddenShort') : t('common.no');
      return text(e[part]);
    };
    const parts = ['type', 'options', 'required', 'hidden'].filter(
      (part) =>
        JSON.stringify((a as Entry)?.[part] ?? null) !==
        JSON.stringify((b as Entry)?.[part] ?? null),
    );
    const labelChanged =
      text((a as Entry)?.label) !== text((b as Entry)?.label);
    const join = (entry: unknown, list: readonly string[]) =>
      list.map((part) => one(entry, part)).join(' ');
    return labelChanged
      ? {
          key,
          kind: 'changed',
          label: '',
          from: [text((a as Entry)?.label), join(a, parts)]
            .filter(Boolean)
            .join(' '),
          to: [text((b as Entry)?.label), join(b, parts)]
            .filter(Boolean)
            .join(' '),
        }
      : {
          key,
          kind: 'changed',
          label: text((b as Entry)?.label),
          from: join(a, parts),
          to: join(b, parts),
        };
  };
  // An entry gone and another come at the same place is one entry edited
  // (2026-10-22): renaming CPU to CPU1 gives it a new key, and read as
  // CPU removed and CPU1 added.
  const renamed = new Map<string, string>();
  if (isArray) {
    const oldKeys = [...before.keys()];
    const newKeys = [...after.keys()];
    for (const [index, key] of newKeys.entries()) {
      const was = oldKeys[index];
      if (
        was !== undefined &&
        !before.has(key) &&
        !after.has(was) &&
        ![...renamed.values()].includes(was)
      )
        renamed.set(key, was);
    }
  }
  const replaced = new Set(renamed.values());
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (replaced.has(key)) continue;
    const a = before.get(renamed.get(key) ?? key);
    const b = after.get(key);
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    if (isArray && a !== undefined && b !== undefined) {
      lines.push(changedEntry(key, a, b));
      continue;
    }
    const render = (v: unknown) =>
      v === undefined || isEmpty(v)
        ? undefined
        : isArray
          ? describeEntry(v)
          : typeof v === 'object'
            ? JSON.stringify(v)
            : text(v);
    lines.push({
      key,
      label: isArray
        ? ''
        : (keyLabels[key] ?? t(`fields.${key}`, { defaultValue: key })),
      ...(isArray ? { kind: a === undefined ? 'added' : 'removed' } : {}),
      // An entry added or removed is shown once, as it is, not as a change.
      ...(isArray
        ? { to: render(b ?? a) }
        : { from: render(a), to: render(b) }),
    });
  }
  if (isArray)
    lines.sort(
      (x, y) =>
        KIND_ORDER[x.kind ?? 'changed'] - KIND_ORDER[y.kind ?? 'changed'],
    );
  if (lines.length === 0)
    lines.push({
      key: fieldKey,
      label: '',
      to: t('history.reordered'),
    });
  return lines;
}
