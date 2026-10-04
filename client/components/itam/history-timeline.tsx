import { AssetTypeBadge } from './asset-type-badge.js';
import { isAssetTypeField } from '@/lib/itam/fields';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
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

import { EmptyState } from './empty-state.js';
import { RecordLink } from './record-link.js';

/**
 * What put the line there, beside who it is attributed to. Absent on rows
 * written before it was recorded, and `human` on a person's own edit —
 * neither is shown, because saying so on every line says nothing.
 */
export type HistoryOrigin = 'human' | 'agent' | 'import' | 'schedule';

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
  const { t } = useTranslation();
  const api = useApi();
  const [pages, setPages] = useState(1);
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
      // Who acted, and who an approval request was addressed to.
      ids: items.flatMap((item) => [
        item.actorId,
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
        size='sm'
        onClick={() => setPages((current) => current + 1)}
      >
        {t('common.loadMore')}
      </Button>
    ) : null;

  // A vertical timeline: a rail on the left with a dot per line, what
  // happened, and who / when underneath.
  return (
    <CurrencyContext.Provider value={currency}>
      <DisplayContext.Provider value={displayValue}>
        <div className='space-y-3'>
          {items.length === 0 ? (
            <EmptyState title={t('history.empty')} />
          ) : (
            <ol className='relative ml-2 border-l border-border pl-6'>
              {items.map((item) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  fieldByKey={fieldByKey}
                  keyLabels={keyLabels}
                  names={names}
                  statusEnum={statusEnum}
                  t={t}
                />
              ))}
            </ol>
          )}
          {loadMore}
        </div>
      </DisplayContext.Provider>
    </CurrencyContext.Provider>
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
  fieldByKey,
  keyLabels,
  names,
  statusEnum,
  t,
}: {
  readonly item: TimelineItem;
  readonly fieldByKey: ReadonlyMap<string, FieldDefinition>;
  readonly keyLabels?: Readonly<Record<string, string>>;
  readonly names: Record<string, ReadonlyMap<string, string> | undefined>;
  readonly statusEnum: string;
  readonly t: Translate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const actor = item.actorId
    ? (names.users?.get(item.actorId) ?? item.actorId)
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
  const folded = single
    ? []
    : item.changes.filter(
        (change) =>
          !change.field ||
          !(IMPLIED_FIELDS[event?.type ?? ''] ?? []).includes(change.field),
      );
  return (
    <li className='relative pb-5 text-sm last:pb-0'>
      <span
        aria-hidden
        // Centred on the rail: the rail sits one padding step (pl-6) plus half
        // its own width left of the item, and the dot is shifted back by half
        // of itself. Spacing units, not rems: the theme's step is not 4px.
        className='absolute top-1.5 left-[calc(var(--spacing)*-6-0.5px)] size-2.5 -translate-x-1/2 rounded-full border-2 border-primary bg-background'
      />
      {/* Inline text, so the summary continues after the label and wraps like
          a sentence rather than dropping to its own line. */}
      <p className='whitespace-pre-wrap'>
        <span className='font-medium'>
          {event
            ? t(`history.types.${event.type}`, { defaultValue: event.type })
            : single
              ? fieldLabel(single)
              : t('history.fieldsChanged', { count: item.changes.length })}
        </span>
        {event ? (
          <span className='text-foreground/80'>
            {event.type === 'quickAction' ? '' : ' '}
            {target ? (
              // The record the summary names opens where it is named; such a
              // summary is a sentence around a name, never long free text.
              <>
                {summaryParts?.before}
                <RecordLink
                  to={target.to}
                  className='text-link underline-offset-4 hover:underline'
                >
                  {target.label}
                </RecordLink>
                {summaryParts?.after}
              </>
            ) : (
              // A note, a cancellation reason, an approver's comment: any
              // summary may carry what someone typed, so all of them fold.
              <CollapsibleText text={describeEvent(event, t, statusEnum)} />
            )}
            {link ? (
              <>
                {' '}
                <RecordLink
                  to={link.to}
                  className='text-link underline-offset-4 hover:underline'
                >
                  {link.label}
                </RecordLink>
                {linkedDetail
                  ? t('history.quick.detailWrap', { detail: linkedDetail })
                  : ''}
              </>
            ) : null}
          </span>
        ) : null}
        {single?.field ? (
          <span className='text-foreground/80'>
            {' '}
            <ChangeValue
              field={fieldByKey.get(single.field)}
              fieldKey={single.field}
              oldValue={single.oldValue}
              newValue={single.newValue}
              names={names}
              keyLabels={keyLabels}
              t={t}
            />
          </span>
        ) : null}
      </p>
      {folded.length > 0 ? (
        <>
          <button
            type='button'
            className='mt-0.5 text-xs text-link underline-offset-4 hover:underline'
            onClick={() => setOpen((current) => !current)}
          >
            {open
              ? t('history.hideFields')
              : t('history.showFields', { count: folded.length })}
          </button>
          {open ? (
            <ul className='mt-1 space-y-0.5 border-l border-border pl-3 text-xs'>
              {folded.map((change) => (
                <li key={change.id}>
                  <span className='text-muted-foreground'>
                    {fieldLabel(change)}
                  </span>{' '}
                  {change.field ? (
                    <ChangeValue
                      field={fieldByKey.get(change.field)}
                      fieldKey={change.field}
                      oldValue={change.oldValue}
                      newValue={change.newValue}
                      names={names}
                      keyLabels={keyLabels}
                      t={t}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <div className='mt-0.5 text-xs text-muted-foreground tabular-nums'>
        {formatDate(item.createdAt, true)}
        {actor ? ` · ${actor}` : ''}
        {item.origin && item.origin !== 'human'
          ? ` · ${t(`history.origin.${item.origin}`)}`
          : ''}
      </div>
    </li>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
}: {
  readonly field: FieldDefinition | undefined;
  readonly fieldKey: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly names: Record<string, ReadonlyMap<string, string> | undefined>;
  readonly keyLabels?: Readonly<Record<string, string>>;
  readonly t: Translate;
}): ReactElement {
  const currency = useContext(CurrencyContext);
  const displayValue = useContext(DisplayContext);
  const shown = (value: unknown) =>
    field && !isEmpty(value) ? displayValue?.(field, value) : undefined;
  const ownFrom = shown(oldValue);
  const ownTo = shown(newValue);
  if (ownFrom !== undefined || ownTo !== undefined)
    return (
      <span className='inline-flex flex-wrap items-baseline gap-x-2 break-words'>
        <span className='text-muted-foreground'>{ownFrom ?? '—'}</span>
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
          {line.label ? (
            <span className='text-muted-foreground'>{line.label}</span>
          ) : null}
          {line.from !== undefined ? (
            <>
              <span className='text-muted-foreground'>{line.from}</span>
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
      <ul className='space-y-0.5 text-sm'>
        {lines.map((line) => (
          <li key={line.key} className='flex flex-wrap items-baseline gap-x-2'>
            {line.label ? (
              <span className='text-muted-foreground'>{line.label}</span>
            ) : null}
            {line.from !== undefined ? (
              <>
                <span className='text-muted-foreground'>{line.from}</span>
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
      return (
        <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      );
    return (
      <RecordLink
        to={`/${referenceRoute(collection)}/${value}`}
        className='text-link underline-offset-4 hover:underline'
      >
        {label}
      </RecordLink>
    );
  };
  return (
    <span className='inline-flex flex-wrap items-baseline gap-x-2 break-words'>
      {long ? (
        <CollapsibleText text={from} className='text-muted-foreground' />
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

interface DiffLine {
  readonly key: string;
  readonly label: string;
  readonly from?: string;
  readonly to?: string;
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
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key);
    const b = after.get(key);
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
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
      from: render(a),
      to: render(b),
    });
  }
  if (lines.length === 0)
    lines.push({
      key: fieldKey,
      label: '',
      to: t('history.reordered'),
    });
  return lines;
}
