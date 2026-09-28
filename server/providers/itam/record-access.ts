import {
  anyScope,
  condition,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

/**
 * The scope behind the `itam.myAudits` Record Access policy: the audit tasks
 * whose `executorIds` name this user.
 *
 * It resolves the ids with a query rather than filtering in the scope,
 * because `executorIds` is a JSON array and a scope may not use a JSON
 * operator (`assertDatabaseScope` in the authorization plugin refuses one).
 * Membership then expands to an `or` of `$eq`, since `FilterOperator` has no
 * `$in`.
 *
 * Running no audits is an empty list, not a refusal: returning `false` would
 * deny the action outright and the 盘点 page would answer "Not allowed" to
 * someone who simply has not been named an executor yet, so the scope
 * matches no row instead.
 */
export async function auditsIRunScope(
  database: DatabaseManager,
  userId: string,
): Promise<DatabaseScope> {
  const rows = await database
    .query()
    .selectFrom('auditTasks')
    .select(['id', 'executorIds'])
    .execute<{ id: string; executorIds: unknown }>();
  const mine = rows
    .filter((row) => executorsOf(row.executorIds).includes(userId))
    .map((row) => String(row.id));
  return anyScope(
    mine.length > 0
      ? mine.map((id) => condition('id', '$eq', id))
      : [condition('id', '$eq', '')],
  );
}

/**
 * The query layer decodes a JSON column, but a row written before that was
 * fixed still holds the string, so both are read.
 */
function executorsOf(value: unknown): string[] {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(decoded) ? decoded.map((id) => String(id)) : [];
}
