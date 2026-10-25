import { randomUUID } from 'node:crypto';

const ids = new Map<string, string>();

/**
 * A UUID standing for `name`, the same each time within a run (2026-10-25):
 * an uploaded file's id is a UUID column, which PostgreSQL holds to where
 * SQLite took any text.
 */
export function uuidOf(name: string): string {
  let id = ids.get(name);
  if (!id) ids.set(name, (id = randomUUID()));
  return id;
}
