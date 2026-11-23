import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Each record names the lifecycle definition that created it (2026-11-23,
 * `@nocobase/lifecycle` 0.1.0-beta.6, which identifies a definition by
 * `key` and `version` and binds every record to its definition through a
 * field the definition names). The five lifecycles of the application —
 * devices, purchase orders, repairs, disposals and stocktakes — each gain a
 * nullable `lifecycleDefinition` column, which only `runtime.create()`
 * writes from now on.
 *
 * Each table has only ever had one definition, named as the table is
 * (server/lifecycles/*.ts: `devices`, `purchaseOrders`, `repairs`,
 * `disposals`, `auditTasks`, key = name, version 1). Every row of these
 * tables is a record of that lifecycle: the services move every one through
 * the runtime, including the rows written before the lifecycle came
 * (2026-10-18/19) and the rows the demo writes directly, which have no
 * `$create` entry but were fired on all the same (202610190001's own
 * comment). So every row is bound to its table's definition. A `$create`
 * entry that names another definition for a row of a table is a conflict:
 * the migration then fails with the list, changing nothing, and each such
 * record is decided with the user and bound in a later migration.
 *
 * `down` drops the column it added.
 */

const FIELD = 'lifecycleDefinition';

/** Each lifecycle table and the one definition it has had. */
const BINDINGS: readonly { readonly table: string; readonly name: string }[] =
  [
    { table: 'devices', name: 'devices' },
    { table: 'purchaseOrders', name: 'purchaseOrders' },
    { table: 'repairs', name: 'repairs' },
    { table: 'disposals', name: 'disposals' },
    { table: 'auditTasks', name: 'auditTasks' },
  ];

const CHUNK = 500;

type Query = MigrationContext['query'];

/** The records of `table` whose `$create` entry names another definition. */
async function conflicts(
  query: Query,
  table: string,
  name: string,
): Promise<string[]> {
  const entries = await query
    .selectFrom('lifecycleTransitions')
    .select(['recordId', 'lifecycle'])
    .where('transition', '=', '$create')
    .where('lifecycle', '!=', name)
    .execute<{ recordId: string; lifecycle: string }>();
  const found: string[] = [];
  for (let start = 0; start < entries.length; start += CHUNK) {
    const chunk = entries.slice(start, start + CHUNK);
    const ids = new Set(
      (
        await query
          .selectFrom(table)
          .select('id')
          .where(
            'id',
            'in',
            chunk.map((entry) => String(entry.recordId)),
          )
          .execute<{ id: unknown }>()
      ).map((row) => String(row.id)),
    );
    for (const entry of chunk)
      if (ids.has(String(entry.recordId)))
        found.push(
          `${table} ${String(entry.recordId)}: ${name}, ${entry.lifecycle}`,
        );
  }
  return found;
}

const migration: MigrationDefinition = defineMigration({
  name: '202611230001_lifecycle_definition_bindings',
  async up({ builder, query }: MigrationContext): Promise<void> {
    // Read-only first: a conflict leaves every table as it was.
    const problems: string[] = [];
    for (const { table, name } of BINDINGS)
      problems.push(...(await conflicts(query, table, name)));
    if (problems.length > 0)
      throw new Error(
        `Records whose creation names another lifecycle definition (table id: definitions found):\n${problems.join('\n')}`,
      );
    for (const { table, name } of BINDINGS) {
      await builder.alterCollection(table, (c) => {
        // Nullable: a record no definition has started would hold none.
        c.string(FIELD).nullable();
      });
      await query
        .updateTable(table)
        .set({ [FIELD]: name })
        .where(FIELD, 'is', null)
        .execute();
    }
  },
  async down({ builder }: MigrationContext): Promise<void> {
    for (const { table } of [...BINDINGS].reverse())
      await builder.alterCollection(table, (c) => {
        c.dropField(FIELD);
      });
  },
});

export default migration;
