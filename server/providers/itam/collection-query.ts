import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, SelectQuery } from '@nocobase/db';

import { compileAuthzScope, outputFields, pickFields } from './authz-filter.js';
import type { ItamCollectionDefinition } from './collections.js';

/**
 * The list contract every ITAM collection shares: server paging, sorting,
 * free-text search over the registered search fields, equality / IN filters
 * on registered fields, and the authorization record filter in the same
 * WHERE clause.
 */
export type Row = Readonly<Record<string, unknown>>;

/** A row value as text, or undefined for null / undefined / empty. */
export function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

export interface ListOptions {
  readonly page?: number;
  readonly pageSize?: number;
  /** A registered field, or several comma-separated, each breaking ties. */
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly q?: string;
  /**
   * field → value, or field → list of values (matched with IN). Datetime
   * columns must be compared against a Date: SQLite stores them as epoch
   * text, so an ISO string compares lexically and silently matches wrongly.
   */
  readonly filter?: Readonly<Record<string, string | readonly string[] | Date>>;
  readonly ids?: readonly string[];
}

export interface ListResult<T = Row> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Filter keys that are not plain equality: `field:gte`, `field:lte`, `field:lt`, `field:gt`, `field:null`. */
const RANGE_OPERATORS: Readonly<Record<string, '>=' | '<=' | '<' | '>'>> = {
  gte: '>=',
  lte: '<=',
  lt: '<',
  gt: '>',
};

export type ExtraWhere = (query: SelectQuery) => SelectQuery;

/**
 * A search as the words it is made of: split on spaces and the punctuation
 * that separates words in a name (brackets, commas, slashes), at most eight
 * so a pasted paragraph cannot build an unbounded query.
 */
export function searchWords(q: string | undefined): string[] {
  return (q ?? '')
    .split(/[\s,，、;；/|()（）[\]【】]+/u)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function applyListFilters(
  query: SelectQuery,
  definition: ItamCollectionDefinition,
  options: ListOptions,
  conditions: DatabaseAuthorizationConditions,
  extra?: ExtraWhere,
): SelectQuery {
  // Columns are qualified with the table so a sort join (see
  // `listCollection`) cannot make `name` or `id` ambiguous.
  const col = (field: string) => `${definition.name}.${field}`;
  let next = query.where((eb) => compileAuthzScope(eb, conditions.scope));
  if (extra) next = extra(next);
  if (options.ids && options.ids.length > 0) {
    next = next.where(col('id'), 'in', options.ids);
  }
  for (const [key, value] of Object.entries(options.filter ?? {})) {
    const [field, operator] = key.split(':');
    if (!field || !definition.fields.includes(field)) continue;
    if (operator && RANGE_OPERATORS[operator]) {
      if (typeof value === 'string' || value instanceof Date) {
        next = next.where(col(field), RANGE_OPERATORS[operator], value);
      }
      continue;
    }
    if (operator === 'null') {
      next = next.where(col(field), value === 'false' ? 'is not' : 'is', null);
      continue;
    }
    if (operator === 'ne') {
      if (typeof value === 'string') next = next.where(col(field), '!=', value);
      continue;
    }
    if (operator || value instanceof Date) continue;
    next = Array.isArray(value)
      ? next.where(col(field), 'in', value)
      : value === 'null'
        ? next.where(col(field), 'is', null)
        : next.where(col(field), '=', value);
  }
  // Searched word by word: every word must appear in one of the search
  // fields (or a referenced record's name), in any order, so "MacBook Pro
  // 14" finds "MacBook Pro 14 (M3)" and "M3 MacBook" does too. One string
  // matched whole found nothing as soon as the words came in another order
  // or with a bracket between them.
  const words = searchWords(options.q);
  const throughReferences = definition.searchByReference ?? [];
  if (definition.searchFields.length + throughReferences.length > 0) {
    for (const word of words) {
      next = next.where((eb) =>
        eb.or([
          ...definition.searchFields.map((field) =>
            eb(col(field), 'like', `%${word}%`),
          ),
          // A match on the referenced record's name, e.g. a device by its
          // model: what the record points at, not a column of its own.
          ...throughReferences.map((reference) =>
            eb(
              col(reference.field),
              'in',
              eb
                .selectFrom(reference.collection)
                .select('id')
                .where(reference.column, 'like', `%${word}%`),
            ),
          ),
        ]),
      );
    }
  }
  return next;
}

export interface DecodeOptions {
  readonly jsonFields?: readonly string[];
}

const EPOCH_TEXT = /^\d{11,}(?:\.\d+)?$/;

/**
 * Normalises a row for the API: JSON columns are parsed and datetime
 * columns, which SQLite hands back as epoch text, become ISO strings.
 */
export function decodeRow(row: Row, options: DecodeOptions = {}): Row {
  const jsonFields = options.jsonFields ?? [];
  const decoded: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(decoded)) {
    if (
      key.endsWith('At') &&
      (typeof value === 'number' ||
        (typeof value === 'string' && EPOCH_TEXT.test(value)))
    ) {
      decoded[key] = new Date(Number(value)).toISOString();
    }
  }
  for (const field of jsonFields) {
    const value = decoded[field];
    if (typeof value === 'string') {
      try {
        decoded[field] = JSON.parse(value);
      } catch {
        // keep the raw string
      }
    }
  }
  return decoded;
}

export async function listCollection(
  database: DatabaseManager,
  definition: ItamCollectionDefinition,
  options: ListOptions,
  conditions: DatabaseAuthorizationConditions,
  decode: DecodeOptions = {},
  extra?: ExtraWhere,
): Promise<ListResult> {
  const fields = outputFields(definition.fields, conditions);
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 20));
  // `a,b` sorts by a, then by b among equals (2026-10-21: a department's
  // people by status, then by employee number); only registered fields.
  const [requested, ...thenBy] = (options.sort ?? definition.defaultSort)
    .split(',')
    .map((key) => key.trim());
  const byReference = definition.sortByReference?.[requested];
  const sort =
    !byReference && definition.fields.includes(requested)
      ? requested
      : byReference
        ? undefined
        : definition.defaultSort;
  const order = options.order === 'desc' ? 'desc' : 'asc';

  const countRow = await applyListFilters(
    database
      .query()
      .selectFrom(definition.name)
      .select((eb) => [eb.fn.countAll().as('total')]),
    definition,
    options,
    conditions,
    extra,
  ).executeTakeFirst<{ total: number | string }>();
  // Sorting by a referenced record's name joins that table under an alias;
  // ties fall back to the record's own name.
  const base = database.query().selectFrom(definition.name);
  let listQuery = applyListFilters(
    byReference
      ? base
          .leftJoin(
            `${byReference.collection} as sortRef`,
            'sortRef.id',
            `${definition.name}.${byReference.field}`,
          )
          .selectAll(definition.name)
      : base.selectAll(),
    definition,
    options,
    conditions,
    extra,
  );
  if (byReference) {
    listQuery = listQuery
      .orderBy('sortRef.name', order)
      .orderBy(`${definition.name}.name`, order);
  } else if (sort) {
    listQuery = listQuery.orderBy(sort, order);
    for (const key of thenBy)
      if (key !== sort && definition.fields.includes(key))
        listQuery = listQuery.orderBy(key, order);
    // Rows tied on the sort key (repairs sent the same day) keep a stable,
    // newest-first order instead of insertion order.
    if (sort !== 'createdAt' && definition.fields.includes('createdAt'))
      listQuery = listQuery.orderBy(`${definition.name}.createdAt`, order);
  }
  const rows = await listQuery
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .execute<Row>();

  return {
    data: rows.map((row) => pickFields(decodeRow(row, decode), fields)),
    total: Number(countRow?.total ?? 0),
    page,
    pageSize,
  };
}

/** Counts rows matching a filter under the same authorization conditions. */
export async function countCollection(
  database: DatabaseManager,
  definition: ItamCollectionDefinition,
  filter: ListOptions['filter'],
  conditions: DatabaseAuthorizationConditions,
  extra?: ExtraWhere,
): Promise<number> {
  const row = await applyListFilters(
    database
      .query()
      .selectFrom(definition.name)
      .select((eb) => [eb.fn.countAll().as('total')]),
    definition,
    { filter },
    conditions,
    extra,
  ).executeTakeFirst<{ total: number | string }>();
  return Number(row?.total ?? 0);
}
