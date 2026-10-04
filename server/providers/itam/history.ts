import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * The operation a write belongs to when its caller named none: every
 * history write inside one transaction is one operation. A route stamps an
 * operation id on its context; the scheduler, the demo generator and other
 * services calling each other do not, and their event and field changes then
 * stood as separate lines ("状态变更 A → B" beside "状态 A → B"). Each
 * transaction has a connection object of its own, so it keys the id.
 */
const transactionOperations = new WeakMap<object, string>();
const operationFor = (
  explicit: string | undefined,
  connection: DatabaseConnection | undefined,
): string | null => {
  if (explicit) return explicit;
  if (!connection) return null;
  let id = transactionOperations.get(connection);
  if (!id) {
    id = crypto.randomUUID();
    transactionOperations.set(connection, id);
  }
  return id;
};

/** Fields a write stamps by itself, never a change worth a line. */
const BOOKKEEPING_FIELDS: ReadonlySet<string> = new Set(['updatedAt']);

/**
 * The unified history timeline and the field-level change log. Every service
 * that changes an ITAM record writes through here, inside its own
 * transaction, so history and data cannot disagree.
 */
/**
 * What put a line on a timeline. `actorId` says whose decision it was, which
 * this does not replace: the assistant's writes are held until a person
 * confirms the card, so they carry `agent` *and* that person's `actorId`.
 * Absent on rows written before it was recorded, which read as `human`.
 */
export type HistoryOrigin = 'human' | 'agent' | 'import' | 'schedule';

export interface HistorySource {
  /** Defaults to `human`: a person acting on a page. */
  readonly origin?: HistoryOrigin;
  readonly sourceType?: string;
  readonly sourceId?: string;
  /**
   * What the source is called, for an event that names it. A device status
   * corrected by an audit reads "… : 三季度盘点" and links there, which
   * needs the name the audit carries rather than the id the device knows.
   */
  readonly sourceLabel?: string;
  readonly actorId?: string;
  /**
   * The operation every writer of one request shares, so the timeline can
   * fold an event's own field changes into it instead of listing the same
   * moment twice. Absent for a writer with no operation context.
   */
  readonly operationId?: string;
}

export interface HistoryEventInput extends HistorySource {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly type: string;
  readonly summary: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ChangeLogInput extends HistorySource {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: 'create' | 'update' | 'statusChange' | 'view' | 'delete';
  readonly field?: string;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export interface HistoryEventRecord {
  /** Null on rows written before it was recorded; read as `human`. */
  readonly origin: HistoryOrigin | null;
  readonly id: string;
  readonly operationId: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly type: string;
  readonly summary: string;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly actorId: string | null;
  readonly createdAt: Date | string;
}

export interface ChangeLogRecord {
  /** Null on rows written before it was recorded; read as `human`. */
  readonly origin: HistoryOrigin | null;
  readonly id: string;
  readonly operationId: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly actorId: string | null;
  readonly createdAt: Date | string;
}

/** One line of the merged timeline. */
export interface TimelineItem {
  /** Null on rows written before it was recorded; read as `human`. */
  readonly origin: HistoryOrigin | null;
  readonly id: string;
  readonly createdAt: Date | string;
  readonly actorId: string | null;
  /** The event this line is about; absent when it is field changes alone. */
  readonly event: HistoryEventRecord | null;
  /** The fields this operation changed, newest first. */
  readonly changes: readonly ChangeLogRecord[];
}

export interface HistoryPage<T> {
  readonly data: readonly T[];
  readonly total: number;
}

export interface HistoryService {
  record(
    event: HistoryEventInput,
    connection?: DatabaseConnection,
  ): Promise<string>;
  log(entry: ChangeLogInput, connection?: DatabaseConnection): Promise<void>;
  /** Writes one change-log row per field whose value differs. */
  logChanges(
    subject: { readonly subjectType: string; readonly subjectId: string },
    before: Readonly<Record<string, unknown>>,
    after: Readonly<Record<string, unknown>>,
    source?: HistorySource,
    connection?: DatabaseConnection,
  ): Promise<readonly string[]>;
  events(
    subject: { readonly subjectType: string; readonly subjectId: string },
    options?: { readonly limit?: number; readonly offset?: number },
  ): Promise<HistoryPage<HistoryEventRecord>>;
  /**
   * Both streams as one: an event carries the field changes stamped with its
   * operation, and changes that belong to no event stand as a group of their
   * own. `kind` narrows it to one of the two.
   */
  timeline(
    subject: { readonly subjectType: string; readonly subjectId: string },
    options?: {
      readonly limit?: number;
      readonly offset?: number;
      readonly kind?: 'all' | 'events' | 'changes';
    },
  ): Promise<HistoryPage<TimelineItem>>;
  changes(
    subject: { readonly subjectType: string; readonly subjectId: string },
    options?: { readonly limit?: number; readonly offset?: number },
  ): Promise<HistoryPage<ChangeLogRecord>>;
}

export const historyServiceToken: ServiceToken<HistoryService> =
  createServiceToken<HistoryService>('itam/history-service');

const parseJson = (value: unknown): unknown =>
  typeof value === 'string' ? safeParse(value) : value;

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Events that are a field edit in disguise. A product key is masked on read,
 * so the change log would compare two masks and record nothing; it is stored
 * as an event and presented with the field changes.
 */
const FIELD_LIKE_EVENTS = new Set(['productKey', 'seatKey']);

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Extra timeline lines a subject type derives from its own records.
 *
 * Stock movements are the record of a movement: they carry the quantity, the
 * balance and the take-back. The timeline shows them so a record's story is
 * whole, but derives them rather than storing a second copy that could drift
 * from the first.
 */
export type DerivedEvents = (
  subjectId: string,
) => Promise<readonly HistoryEventRecord[]>;

export function createHistoryService(
  database: DatabaseManager,
  derived: Readonly<Record<string, DerivedEvents>> = {},
): HistoryService {
  const queryOf = (connection?: DatabaseConnection) =>
    connection ? connection.query : database.query();

  const count = async (
    table: 'historyEvents' | 'changeLogs',
    subject: { readonly subjectType: string; readonly subjectId: string },
  ): Promise<number> => {
    const row = await database
      .query()
      .selectFrom(table)
      .select((eb) => [eb.fn.countAll().as('total')])
      .where('subjectType', '=', subject.subjectType)
      .where('subjectId', '=', subject.subjectId)
      .executeTakeFirst();
    return Number(row?.total ?? 0);
  };

  return {
    async record(event, connection) {
      const id = crypto.randomUUID();
      await queryOf(connection)
        .insertInto('historyEvents')
        .values({
          id,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          type: event.type,
          summary: event.summary,
          payload: event.payload ?? null,
          sourceType: event.sourceType ?? null,
          sourceId: event.sourceId ?? null,
          actorId: event.actorId ?? null,
          origin: event.origin ?? 'human',
          operationId: operationFor(event.operationId, connection),
          createdAt: new Date(),
        })
        .execute();
      return id;
    },
    async log(entry, connection) {
      await queryOf(connection)
        .insertInto('changeLogs')
        .values({
          id: crypto.randomUUID(),
          subjectType: entry.subjectType,
          subjectId: entry.subjectId,
          action: entry.action,
          field: entry.field ?? null,
          oldValue: entry.oldValue ?? null,
          newValue: entry.newValue ?? null,
          sourceType: entry.sourceType ?? null,
          sourceId: entry.sourceId ?? null,
          actorId: entry.actorId ?? null,
          origin: entry.origin ?? 'human',
          operationId: operationFor(entry.operationId, connection),
          createdAt: new Date(),
        })
        .execute();
    },
    async logChanges(subject, before, after, source = {}, connection) {
      // `updatedAt` moves with every write; logging it would add a line to
      // every change that says nothing.
      const changed = Object.keys(after).filter(
        (field) =>
          !BOOKKEEPING_FIELDS.has(field) && !same(before[field], after[field]),
      );
      for (const field of changed) {
        await this.log(
          {
            ...subject,
            ...source,
            action: 'update',
            field,
            oldValue: before[field],
            newValue: after[field],
          },
          connection,
        );
      }
      return changed;
    },
    async events(subject, options = {}) {
      const rows = await database
        .query()
        .selectFrom('historyEvents')
        .selectAll()
        .where('subjectType', '=', subject.subjectType)
        .where('subjectId', '=', subject.subjectId)
        .orderBy('createdAt', 'desc')
        .limit(options.limit ?? 30)
        .offset(options.offset ?? 0)
        .execute<HistoryEventRecord>();
      return {
        data: rows.map((row) => ({
          ...row,
          payload: parseJson(row.payload) as HistoryEventRecord['payload'],
        })),
        total: await count('historyEvents', subject),
      };
    },
    /**
     * The merged view. A record's history is bounded in practice, so both
     * streams are read whole (to a cap) and grouped in memory: paging across
     * two tables in SQL would either lose rows or need a union view, and the
     * grouping has to happen before a page can be cut anyway.
     */
    async timeline(subject, options = {}) {
      const kind = options.kind ?? 'all';
      const cap = 2000;
      const source = derived[subject.subjectType];
      const [stored, extra, changes] = await Promise.all([
        this.events(subject, { limit: cap }),
        source ? source(subject.subjectId) : Promise.resolve([]),
        kind === 'events'
          ? Promise.resolve({ data: [] as ChangeLogRecord[] })
          : this.changes(subject, { limit: cap }),
      ]);
      const allEvents = [...stored.data, ...extra];
      // A key travels as an event because a masked value cannot be compared,
      // but it is a field edit: it reads with the changes, not with what
      // someone did to the record.
      const events = {
        data: allEvents.filter((event) =>
          kind === 'events'
            ? !FIELD_LIKE_EVENTS.has(event.type)
            : kind === 'changes'
              ? FIELD_LIKE_EVENTS.has(event.type)
              : true,
        ),
      };
      const byOperation = new Map<string, ChangeLogRecord[]>();
      const loose: ChangeLogRecord[] = [];
      for (const change of changes.data) {
        const operation = change.operationId;
        if (!operation) {
          loose.push(change);
          continue;
        }
        byOperation.set(operation, [
          ...(byOperation.get(operation) ?? []),
          change,
        ]);
      }
      const items: TimelineItem[] = [];
      const claimed = new Set<string>();
      for (const event of events.data) {
        const operation = event.operationId;
        const own = operation ? (byOperation.get(operation) ?? []) : [];
        // One operation may write several events (a transfer touches the
        // device and its allocation); its changes belong to the first.
        if (operation && own.length > 0 && !claimed.has(operation))
          claimed.add(operation);
        items.push({
          id: `event:${event.id}`,
          createdAt: event.createdAt,
          actorId: event.actorId,
          origin: event.origin,
          event,
          changes: operation && claimed.has(operation) ? own : [],
        });
        if (operation) byOperation.delete(operation);
      }
      // Changes whose operation wrote no event: one line per operation.
      for (const [operation, group] of byOperation)
        items.push({
          id: `operation:${operation}`,
          createdAt: group[0].createdAt,
          actorId: group[0].actorId,
          origin: group[0].origin,
          event: null,
          changes: group,
        });
      // Rows from before operations were stamped stand on their own.
      for (const change of loose)
        items.push({
          id: `change:${change.id}`,
          createdAt: change.createdAt,
          actorId: change.actorId,
          origin: change.origin,
          event: null,
          changes: [change],
        });
      const sorted = [...items].sort(
        (a: TimelineItem, b: TimelineItem) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const offset = options.offset ?? 0;
      return {
        data: sorted.slice(offset, offset + (options.limit ?? 30)),
        total: sorted.length,
      };
    },
    async changes(subject, options = {}) {
      const rows = await database
        .query()
        .selectFrom('changeLogs')
        .selectAll()
        .where('subjectType', '=', subject.subjectType)
        .where('subjectId', '=', subject.subjectId)
        .orderBy('createdAt', 'desc')
        .limit(options.limit ?? 30)
        .offset(options.offset ?? 0)
        .execute<ChangeLogRecord>();
      return {
        data: rows.map((row) => ({
          ...row,
          oldValue: parseJson(row.oldValue),
          newValue: parseJson(row.newValue),
        })),
        total: await count('changeLogs', subject),
      };
    },
  };
}
