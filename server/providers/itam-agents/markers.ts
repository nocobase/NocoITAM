import type { DatabaseManager } from '@nocobase/db';

/**
 * What ITAM put into the Agents plugin from code, once (template
 * 1.0.0-beta.64): a row of `itamSettings` per thing, keyed by a marker the
 * settings service never reads. Writing the marker before the thing means
 * an instance starting beside this one finds it (the second insert fails on
 * the key) and creates nothing, and a crash in between leaves nothing rather
 * than a second one later.
 */
export async function readMarker(
  database: DatabaseManager,
  key: string,
): Promise<Record<string, unknown> | null> {
  const row = await database
    .query()
    .selectFrom('itamSettings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst<{ value: unknown }>();
  if (!row) return null;
  const value =
    typeof row.value === 'string'
      ? (JSON.parse(row.value) as unknown)
      : row.value;
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

/** Claims a marker: false when it is there already (or another instance won). */
export async function claimMarker(
  database: DatabaseManager,
  key: string,
  value: Record<string, unknown>,
): Promise<boolean> {
  try {
    await database
      .query()
      .insertInto('itamSettings')
      .values({ key, value, updatedById: null, updatedAt: new Date() })
      .execute();
    return true;
  } catch {
    return false;
  }
}

export async function writeMarker(
  database: DatabaseManager,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  await database
    .query()
    .updateTable('itamSettings')
    .set({ value, updatedAt: new Date() })
    .where('key', '=', key)
    .execute();
}
