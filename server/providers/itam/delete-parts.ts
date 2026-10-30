import type { DatabaseManager } from '@nocobase/db';

import type { DeleteImpact, DeleteReference } from './errors.js';

/**
 * How many rows of `table` match every condition: a value, or one of a list
 * (an empty list matches nothing).
 */
export async function countRows(
  database: DatabaseManager,
  table: string,
  where: Readonly<Record<string, string | readonly string[] | null>>,
): Promise<number> {
  let builder = database
    .query()
    .selectFrom(table)
    .select((eb) => [eb.fn.countAll().as('total')]);
  for (const [field, value] of Object.entries(where)) {
    if (Array.isArray(value)) {
      if (value.length === 0) return 0;
      builder = builder.where(field, 'in', value);
    } else if (value === null) builder = builder.where(field, 'is', null);
    else builder = builder.where(field, '=', value as string);
  }
  const row = await builder.executeTakeFirst<{ total: number | string }>();
  return Number(row?.total ?? 0);
}

/** A reference of `count` rows, or none when there are none. */
export const reference = (
  collection: string,
  field: string,
  count: number,
): DeleteReference[] => (count > 0 ? [{ collection, field, count }] : []);

/**
 * An unrestricted delete's impact (2026-10-30): blocked while another
 * record still depends on it, else a warning listing the parts that go
 * with it, or plain when it has none.
 */
export const unrestrictedImpact = (
  blockers: readonly DeleteReference[],
  parts: readonly DeleteReference[],
): DeleteImpact =>
  blockers.length > 0
    ? { level: 'blocked', references: blockers, parts }
    : { level: parts.length > 0 ? 'warn' : 'plain', references: [], parts };
