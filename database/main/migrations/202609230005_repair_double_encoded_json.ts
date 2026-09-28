import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Repairs JSON columns that hold their value encoded twice.
 *
 * Since template beta.43 the query layer encodes a JSON field itself, so the
 * services' own `JSON.stringify` before a write stored the text of the JSON
 * rather than the JSON. The reads all parse a string defensively, which is
 * why nothing looked wrong, but a JSON condition (`$jsonEq`, `$jsonHas`) can
 * never match such a row, and any reader that trusts the column gets a string
 * where it expects an object. The write sites now pass the value itself; the
 * rows written in between are fixed here.
 *
 * Only a value that decodes to a string which is itself an object or an array
 * is rewritten. A JSON column may legitimately hold a string — a change log
 * records `"inStock"` that way — and such a value never parses further.
 */
/** The settings table is keyed by `key`; every other one by `id`. */
const KEYS: Readonly<Record<string, string>> = { itamSettings: 'key' };

const COLUMNS: Readonly<Record<string, readonly string[]>> = {
  vendors: ['types'],
  categories: ['fieldTemplate'],
  devices: ['attributes'],
  itamSettings: ['value'],
  historyEvents: ['payload'],
  changeLogs: ['oldValue', 'newValue'],
  reminders: ['data'],
  approvals: ['approverIds'],
  auditTasks: ['scope', 'executorIds'],
  jobRuns: ['summary'],
  aiActions: ['payload', 'rows', 'result'],
  aiFindings: ['subjectIds'],
  discoveryCandidates: ['data'],
};

/** The value a double encoding left behind, or null when the row is sound. */
const repaired = (value: unknown): unknown => {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  return typeof parsed === 'object' && parsed !== null ? parsed : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609230005_repair_double_encoded_json',
  async up({ query }) {
    for (const [collection, fields] of Object.entries(COLUMNS)) {
      const key = KEYS[collection] ?? 'id';
      const rows = await query
        .selectFrom(collection)
        .select([key, ...fields])
        .execute<Record<string, unknown>>();
      for (const row of rows) {
        const values: Record<string, unknown> = {};
        for (const field of fields) {
          const next = repaired(row[field]);
          if (next !== null) values[field] = next;
        }
        if (Object.keys(values).length === 0) continue;
        await query
          .updateTable(collection)
          .set(values)
          .where(key, '=', row[key])
          .execute();
      }
    }
  },
  async down() {
    // Deliberately empty: the reverse would encode the rows twice again.
  },
});

export default migration;
