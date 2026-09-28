import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

import { compileAuthzScope, outputFields, pickFields } from './authz-filter.js';
import { decodeRow, type Row } from './collection-query.js';
import type { ItamCollectionDefinition } from './collections.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';
import type { HistoryService } from './history.js';
import type { OperationContext } from './devices.js';

/**
 * The record plumbing every status-driven ITAM domain repeats: load under
 * the caller's record filter, shape the output to the readable fields, run
 * one operation in a transaction, and change status with both history rows.
 */
export interface RecordHelpers {
  findRaw(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined>;
  /** Loads under the record filter; not found when out of scope. */
  load(
    id: string,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row>;
  shape(row: Row, conditions: DatabaseAuthorizationConditions): Row;
  /** Runs `fn` in a transaction (or the caller's) and returns the shaped record. */
  mutate(
    id: string,
    conditions: DatabaseAuthorizationConditions,
    fn: (connection: DatabaseConnection, record: Row) => Promise<void>,
    within?: DatabaseConnection,
  ): Promise<Row>;
  requireStatus(
    record: Row,
    allowed: readonly string[],
    operation: string,
  ): void;
  /**
   * Moves the record to `next`, logging the field change and, unless the
   * summary is `null`, an event for it. It is `null` when the operation has
   * already written the event that says what happened — a decision writes
   * `approvalApproved` with its comment — because a second `statusChange`
   * event only repeats it as another timeline line, and the field change
   * folds into the event that is there.
   */
  setStatus(
    connection: DatabaseConnection,
    record: Row,
    next: string,
    context: OperationContext,
    summary: string | null,
    payload?: Record<string, unknown>,
    extra?: Row,
  ): Promise<void>;
}

export function createRecordHelpers(
  database: DatabaseManager,
  history: HistoryService,
  definition: ItamCollectionDefinition,
  options: { readonly jsonFields?: readonly string[] } = {},
): RecordHelpers {
  const table = definition.name;
  const decode = (row: Row): Row =>
    decodeRow(row, { jsonFields: options.jsonFields });

  const findRaw: RecordHelpers['findRaw'] = async (id, connection) => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom(table)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row ? decode(row) : undefined;
  };

  const load: RecordHelpers['load'] = async (id, conditions, connection) => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom(table)
      .selectAll()
      .where('id', '=', id)
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError(table, id);
    return decode(row);
  };

  const shape: RecordHelpers['shape'] = (row, conditions) =>
    pickFields(row, outputFields(definition.fields, conditions));

  return {
    findRaw,
    load,
    shape,
    async mutate(id, conditions, fn, within) {
      const run = async (connection: DatabaseConnection) => {
        const record = await load(id, conditions, connection);
        await fn(connection, record);
      };
      if (within) await run(within);
      else await database.transaction(run);
      return shape((await findRaw(id, within)) ?? {}, conditions);
    },
    requireStatus(record, allowed, operation) {
      if (!allowed.includes(String(record.status))) {
        throw new BusinessRuleError(
          `Operation "${operation}" is not allowed from status "${String(record.status)}"`,
          'INVALID_STATUS',
        );
      }
    },
    async setStatus(
      connection,
      record,
      next,
      context,
      summary,
      payload = {},
      extra = {},
    ) {
      await connection.query
        .updateTable(table)
        .set({ status: next, ...extra, updatedAt: new Date() })
        .where('id', '=', String(record.id))
        .execute();
      await history.log(
        {
          subjectType: table,
          subjectId: String(record.id),
          action: 'statusChange',
          field: 'status',
          oldValue: record.status,
          newValue: next,
          ...context,
        },
        connection,
      );
      if (summary === null) return;
      await history.record(
        {
          subjectType: table,
          subjectId: String(record.id),
          type: 'statusChange',
          summary,
          payload: { from: record.status, to: next, ...payload },
          ...context,
        },
        connection,
      );
    },
  };
}
