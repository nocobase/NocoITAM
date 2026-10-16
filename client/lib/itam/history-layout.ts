/**
 * How a record's history is laid out (2026-10-16, after Linear's and Attio's
 * activity): consecutive field edits by one person fold into one line, a long
 * run of changes between two comments folds behind a count, and the lines
 * fall under day headings. Pure, so the rules are tested without a page.
 */

export interface LayoutItem {
  readonly id: string;
  readonly createdAt: string;
  readonly actorId: string | null;
  /** Null for a line that only changed fields. */
  readonly event: { readonly type: string } | null;
}

export type TimelineUnit<T extends LayoutItem> =
  | { readonly kind: 'item'; readonly id: string; readonly item: T }
  | {
      readonly kind: 'edits';
      readonly id: string;
      readonly items: readonly T[];
    };

export type TimelineEntry<T extends LayoutItem> =
  | { readonly kind: 'day'; readonly id: string; readonly day: string }
  | { readonly kind: 'unit'; readonly unit: TimelineUnit<T> }
  | {
      readonly kind: 'fold';
      readonly id: string;
      readonly units: readonly TimelineUnit<T>[];
    };

/** Edits by one person this close together read as one sitting. */
export const EDIT_WINDOW_MS = 10 * 60 * 1000;
/** A run of changes longer than this between comments folds… */
export const RUN_LIMIT = 6;
/** …keeping this many in view. */
export const RUN_KEEP = 3;

const isComment = (item: LayoutItem): boolean => item.event?.type === 'comment';

/** The local calendar day a timestamp falls on, as YYYY-MM-DD. */
export function dayOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Folds consecutive field-only edits by one person into one unit. */
export function groupEdits<T extends LayoutItem>(
  items: readonly T[],
): TimelineUnit<T>[] {
  const units: TimelineUnit<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length === 1)
      units.push({ kind: 'item', id: run[0].id, item: run[0] });
    else if (run.length > 1)
      units.push({ kind: 'edits', id: `edits:${run[0].id}`, items: run });
    run = [];
  };
  for (const item of items) {
    const previous = run.at(-1);
    const joins =
      item.event === null &&
      previous !== undefined &&
      previous.actorId === item.actorId &&
      Math.abs(
        new Date(previous.createdAt).getTime() -
          new Date(item.createdAt).getTime(),
      ) <= EDIT_WINDOW_MS;
    if (!joins) flush();
    if (item.event === null) run.push(item);
    else units.push({ kind: 'item', id: item.id, item });
  }
  flush();
  return units;
}

const createdAtOf = <T extends LayoutItem>(unit: TimelineUnit<T>): string =>
  unit.kind === 'item' ? unit.item.createdAt : unit.items[0].createdAt;

/**
 * The lines in order with day headings among them, and each run of more
 * than `RUN_LIMIT` changes between comments cut to its first `RUN_KEEP`
 * behind a fold — unless the reader opened that fold (`opened`).
 */
export function layoutTimeline<T extends LayoutItem>(
  units: readonly TimelineUnit<T>[],
  opened: ReadonlySet<string>,
): TimelineEntry<T>[] {
  const visible: (
    | { readonly kind: 'unit'; readonly unit: TimelineUnit<T> }
    | {
        readonly kind: 'fold';
        readonly id: string;
        readonly units: readonly TimelineUnit<T>[];
      }
  )[] = [];
  let run: TimelineUnit<T>[] = [];
  const flush = () => {
    const foldId = run[RUN_KEEP] ? `fold:${run[RUN_KEEP].id}` : '';
    if (run.length > RUN_LIMIT && !opened.has(foldId)) {
      for (const unit of run.slice(0, RUN_KEEP))
        visible.push({ kind: 'unit', unit });
      visible.push({ kind: 'fold', id: foldId, units: run.slice(RUN_KEEP) });
    } else for (const unit of run) visible.push({ kind: 'unit', unit });
    run = [];
  };
  for (const unit of units) {
    if (unit.kind === 'item' && isComment(unit.item)) {
      flush();
      visible.push({ kind: 'unit', unit });
    } else run.push(unit);
  }
  flush();
  const entries: TimelineEntry<T>[] = [];
  let day = '';
  for (const entry of visible) {
    if (entry.kind === 'unit') {
      const next = dayOf(createdAtOf(entry.unit));
      if (next !== day) {
        entries.push({ kind: 'day', id: `day:${next}`, day: next });
        day = next;
      }
    }
    entries.push(entry);
  }
  return entries;
}
