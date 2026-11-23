import { createHash } from 'node:crypto';

import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Parameter snapshots for the requests created before parameters froze
 * (2026-11-23, `@nocobase/lifecycle` 0.1.0-beta.6).
 *
 * Disposals and purchase orders take an approver range (设置 → 流程), which
 * the released lifecycles read live on every transition, saved as the
 * range group's own configuration (`disposalApprovers`,
 * `purchaseOrderApprovers`). Since 0.1.0-beta.6 a definition has one
 * configuration, kept under its name, and `runtime.create()` freezes the
 * effective values into the record's snapshot, which everything about the
 * record reads afterwards; a record without one is refused
 * (`PARAMETER_SNAPSHOT_MISSING`). So, for each of the two:
 *
 * 1. The range saved under the group's key becomes the definition's
 *    configuration, under its name, at the same revision with the same
 *    values, author and time. A definition that already has a configuration
 *    keeps it; the group's own rows stay as they were.
 * 2. Every record (each is bound to its table's definition,
 *    202611230001_lifecycle_definition_bindings) gets a snapshot:
 *    - a valid snapshot it already has is kept as it is;
 *    - otherwise the parameter usage the released runtime recorded for the
 *      record's one `$create` entry is the creation evidence: its values,
 *      sources and time, its revision the largest source revision, the
 *      entry, the usage and the group revisions in `recoveredFrom`;
 *    - otherwise (rows written before the lifecycle or by the demo, with no
 *      `$create` entry) the range in force now, from step 1 or the
 *      definition's default, marked `origin: 'upgrade'` — what the record
 *      read at upgrade, not what it was created under.
 *
 * Everything is checked before anything is written: a record with more
 * than one `$create` entry, an invalid snapshot, creation usage or stored
 * range fails the migration with the list, changing nothing. The values are
 * parsed as the released definitions parsed them (server/lifecycles/
 * approver-range.ts at 2026-11-23), written out here rather than imported.
 *
 * `down` removes the snapshots this wrote (those with `recoveredFrom` or a
 * value of origin `upgrade`) and the configuration version it copied,
 * leaving the head if it has moved on since.
 */

const SCOPE = 'itam';
const FIELD = 'approverRange';
const SCHEMA_VERSION = 1;
/** Released `APPROVER_SELECTOR_TYPES`. */
const TYPES = ['anyone', 'role', 'user'];
/** Released `DEFAULT_APPROVER_RANGE`. */
const DEFAULT_RANGE: readonly Selection[] = [
  { group: 1, type: 'anyone', referenceId: '*' },
];

const LIFECYCLES: readonly {
  readonly name: string;
  readonly table: string;
  /** The released range group's key, which every source names. */
  readonly group: string;
}[] = [
  { name: 'disposals', table: 'disposals', group: 'disposalApprovers' },
  {
    name: 'purchaseOrders',
    table: 'purchaseOrders',
    group: 'purchaseOrderApprovers',
  },
];

interface Selection {
  readonly group: number;
  readonly type: string;
  readonly referenceId: string;
}

interface Source {
  readonly group: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly origin: 'default' | 'configuration' | 'upgrade';
}

interface Snapshot {
  readonly scope: string;
  readonly revision: number;
  readonly values: { readonly approverRange: readonly Selection[] };
  readonly sources: { readonly approverRange: Source };
  readonly lifecycle: string;
  readonly recordId: string;
  readonly at: string;
  readonly recoveredFrom?: {
    readonly transitionId: string;
    readonly usageId?: string;
    readonly groupRevisions?: Readonly<Record<string, number>>;
  };
}

type Query = MigrationContext['query'];

/** The library's row identity: a SHA-256 of the identifying parts. */
const identity = (...parts: readonly (string | number)[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The released range parser: 1–100 selections, each complete and allowed. */
function parseRange(value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100)
    throw new Error('a range needs between 1 and 100 selections');
  return value.map((item: unknown) => {
    if (
      !isObject(item) ||
      Object.keys(item).some(
        (key) => !['group', 'type', 'referenceId'].includes(key),
      ) ||
      !Number.isSafeInteger(item.group) ||
      Number(item.group) < 1 ||
      typeof item.type !== 'string' ||
      !TYPES.includes(item.type) ||
      typeof item.referenceId !== 'string' ||
      !item.referenceId
    )
      throw new Error('invalid selection');
    return {
      group: Number(item.group),
      type: item.type,
      referenceId: item.referenceId,
    };
  });
}

const validTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));

const validRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

function parseSource(value: unknown, group: string): Source {
  if (
    !isObject(value) ||
    value.group !== group ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !validRevision(value.revision) ||
    !['default', 'configuration', 'upgrade'].includes(String(value.origin))
  )
    throw new Error('invalid source');
  return {
    group,
    schemaVersion: SCHEMA_VERSION,
    revision: value.revision,
    origin: value.origin as Source['origin'],
  };
}

/** A stored configuration version, with its selections put back. */
interface StoredVersion {
  readonly revision: number;
  readonly range: Selection[];
  readonly actorId: string;
  readonly at: string;
}

async function readVersion(
  query: Query,
  group: string,
): Promise<StoredVersion | undefined> {
  const head = await query
    .selectFrom('lifecycleParameterHeads')
    .select(['revision'])
    .where('id', '=', identity(SCOPE, group))
    .executeTakeFirst<{ revision: unknown }>();
  if (!head) return undefined;
  const revision = Number(head.revision);
  if (!validRevision(revision)) throw new Error(`${group}: invalid revision`);
  const row = await query
    .selectFrom('lifecycleParameterVersions')
    .select(['payload', 'selectionCounts'])
    .where('id', '=', identity(SCOPE, group, revision))
    .executeTakeFirst<{ payload: unknown; selectionCounts: unknown }>();
  if (!row) throw new Error(`${group}: its current version is missing`);
  const payload = parseJson(row.payload);
  const counts = parseJson(row.selectionCounts);
  if (
    !isObject(payload) ||
    payload.scope !== SCOPE ||
    payload.group !== group ||
    payload.revision !== revision ||
    !isObject(counts)
  )
    throw new Error(`${group}: version metadata does not match`);
  const count = Number(counts[FIELD]);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100)
    throw new Error(`${group}: invalid selection count`);
  const selections: unknown[] = [];
  for (let index = 0; index < count; index++) {
    const selection = await query
      .selectFrom('lifecycleParameterSelections')
      .select(['group', 'type', 'referenceId'])
      .where('id', '=', identity(SCOPE, group, revision, FIELD, index))
      .executeTakeFirst<{ group: unknown; type: unknown; referenceId: unknown }>();
    if (!selection) throw new Error(`${group}: a selection is missing`);
    selections.push({
      group: Number(selection.group),
      type: String(selection.type),
      referenceId: String(selection.referenceId),
    });
  }
  return {
    revision,
    range: parseRange(selections),
    actorId: typeof payload.actorId === 'string' ? payload.actorId : 'system',
    at: typeof payload.at === 'string' ? payload.at : new Date().toISOString(),
  };
}

/** Writes a configuration version under `group` (the library's layout). */
async function writeVersion(
  query: Query,
  group: string,
  version: StoredVersion,
  withHead: boolean,
): Promise<void> {
  if (withHead)
    await query
      .insertInto('lifecycleParameterHeads')
      .values({
        id: identity(SCOPE, group),
        scope: SCOPE,
        groupKey: group,
        status: 'current',
        revision: version.revision,
      })
      .execute();
  for (const [index, selection] of version.range.entries())
    await query
      .insertInto('lifecycleParameterSelections')
      .values({
        id: identity(SCOPE, group, version.revision, FIELD, index),
        versionId: identity(SCOPE, group, version.revision),
        ruleKey: FIELD,
        group: selection.group,
        type: selection.type,
        referenceId: selection.referenceId,
      })
      .execute();
  await query
    .insertInto('lifecycleParameterVersions')
    .values({
      id: identity(SCOPE, group, version.revision),
      payload: {
        scope: SCOPE,
        group,
        revision: version.revision,
        schemaVersion: SCHEMA_VERSION,
        values: {},
        actorId: version.actorId,
        at: version.at,
      },
      selectionCounts: { [FIELD]: version.range.length },
    })
    .execute();
}

/** A snapshot already stored, checked as the runtime checks it. */
function checkSnapshot(
  value: unknown,
  name: string,
  group: string,
  recordId: string,
): void {
  if (
    !isObject(value) ||
    value.scope !== SCOPE ||
    value.lifecycle !== name ||
    value.recordId !== recordId ||
    !validRevision(value.revision) ||
    !validTime(value.at) ||
    !isObject(value.values) ||
    !isObject(value.sources) ||
    Object.keys(value.values).some((key) => key !== FIELD) ||
    Object.keys(value.sources).some((key) => key !== FIELD)
  )
    throw new Error('invalid snapshot');
  parseRange(value.values[FIELD]);
  parseSource(value.sources[FIELD], group);
}

/** The snapshot the released creation usage of a record evidences. */
function fromUsage(
  usage: unknown,
  usageId: string,
  entryId: string,
  name: string,
  group: string,
  recordId: string,
): Snapshot {
  if (
    !isObject(usage) ||
    usage.scope !== SCOPE ||
    usage.lifecycle !== name ||
    usage.recordId !== recordId ||
    usage.kind !== 'transition' ||
    String(usage.associationId) !== entryId ||
    (usage.attempt !== undefined && usage.attempt !== 0) ||
    !validTime(usage.at) ||
    !isObject(usage.values) ||
    !isObject(usage.sources)
  )
    throw new Error('invalid creation usage');
  const range = parseRange(usage.values[FIELD]);
  const source = parseSource(usage.sources[FIELD], group);
  if (source.origin === 'upgrade')
    throw new Error('creation usage names an upgrade');
  const revision = validRevision(usage.revision)
    ? usage.revision
    : source.revision;
  return {
    scope: SCOPE,
    revision,
    values: { [FIELD]: range },
    sources: { [FIELD]: source },
    lifecycle: name,
    recordId,
    at: usage.at,
    recoveredFrom: {
      transitionId: entryId,
      usageId,
      groupRevisions: { [group]: source.revision },
    },
  };
}

interface Plan {
  readonly name: string;
  /** The range to copy under the definition's name, if any. */
  readonly copy?: StoredVersion;
  readonly snapshots: Snapshot[];
}

const CHUNK = 500;

async function plan(
  query: Query,
  now: string,
  problems: string[],
): Promise<Plan[]> {
  const plans: Plan[] = [];
  for (const { name, table, group } of LIFECYCLES) {
    let copy: StoredVersion | undefined;
    let effective: { revision: number; range: Selection[] } = {
      revision: 0,
      range: parseRange(DEFAULT_RANGE),
    };
    try {
      const own = await readVersion(query, name);
      if (own) effective = own;
      else {
        copy = await readVersion(query, group);
        if (copy) effective = copy;
      }
    } catch (error) {
      problems.push(
        `${name} configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const ids = (
      await query.selectFrom(table).select('id').execute<{ id: unknown }>()
    ).map((row) => String(row.id));
    const snapshots: Snapshot[] = [];
    for (let start = 0; start < ids.length; start += CHUNK) {
      const chunk = ids.slice(start, start + CHUNK);
      const existing = new Map(
        (
          await query
            .selectFrom('lifecycleParameterSnapshots')
            .select(['id', 'payload'])
            .where(
              'id',
              'in',
              chunk.map((id) => identity(SCOPE, name, id)),
            )
            .execute<{ id: string; payload: unknown }>()
        ).map((row) => [row.id, parseJson(row.payload)]),
      );
      const creations = new Map<string, string[]>();
      for (const entry of await query
        .selectFrom('lifecycleTransitions')
        .select(['id', 'recordId'])
        .where('lifecycle', '=', name)
        .where('transition', '=', '$create')
        .where('recordId', 'in', chunk)
        .execute<{ id: unknown; recordId: unknown }>())
        creations.set(String(entry.recordId), [
          ...(creations.get(String(entry.recordId)) ?? []),
          String(entry.id),
        ]);
      for (const recordId of chunk) {
        try {
          const stored = existing.get(identity(SCOPE, name, recordId));
          if (stored !== undefined) {
            checkSnapshot(stored, name, group, recordId);
            continue;
          }
          const entries = creations.get(recordId) ?? [];
          if (entries.length > 1)
            throw new Error(`${String(entries.length)} $create entries`);
          if (entries.length === 1) {
            const usageId = identity(name, 'transition', entries[0], 0);
            const usage = await query
              .selectFrom('lifecycleParameterUsages')
              .select(['payload'])
              .where('id', '=', usageId)
              .executeTakeFirst<{ payload: unknown }>();
            if (usage) {
              snapshots.push(
                fromUsage(
                  parseJson(usage.payload),
                  usageId,
                  entries[0],
                  name,
                  group,
                  recordId,
                ),
              );
              continue;
            }
          }
          snapshots.push({
            scope: SCOPE,
            revision: effective.revision,
            values: { [FIELD]: effective.range },
            sources: {
              [FIELD]: {
                group,
                schemaVersion: SCHEMA_VERSION,
                revision: effective.revision,
                origin: 'upgrade',
              },
            },
            lifecycle: name,
            recordId,
            at: now,
          });
        } catch (error) {
          problems.push(
            `${table} ${recordId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    plans.push({ name, ...(copy ? { copy } : {}), snapshots });
  }
  return plans;
}

const migration: MigrationDefinition = defineMigration({
  name: '202611230002_lifecycle_parameter_snapshots',
  async up({ query }: MigrationContext): Promise<void> {
    // The whole plan is checked before anything is written.
    const problems: string[] = [];
    const plans = await plan(query, new Date().toISOString(), problems);
    if (problems.length > 0)
      throw new Error(
        `Lifecycle parameter snapshots cannot be completed:\n${problems.join('\n')}`,
      );
    for (const { name, copy, snapshots } of plans) {
      if (copy) await writeVersion(query, name, copy, true);
      for (let start = 0; start < snapshots.length; start += CHUNK)
        await query
          .insertInto('lifecycleParameterSnapshots')
          .values(
            snapshots.slice(start, start + CHUNK).map((snapshot) => ({
              id: identity(SCOPE, name, snapshot.recordId),
              payload: snapshot,
            })),
          )
          .execute();
    }
  },
  async down({ query }: MigrationContext): Promise<void> {
    for (const { name, group } of LIFECYCLES) {
      // The snapshots this wrote: recovered from creation, or of the upgrade.
      const rows = await query
        .selectFrom('lifecycleParameterSnapshots')
        .select(['id', 'payload'])
        .execute<{ id: string; payload: unknown }>();
      const written = rows
        .filter((row) => {
          const payload = parseJson(row.payload);
          if (!isObject(payload) || payload.lifecycle !== name) return false;
          const source = isObject(payload.sources)
            ? payload.sources[FIELD]
            : undefined;
          return (
            payload.recoveredFrom !== undefined ||
            (isObject(source) && source.origin === 'upgrade')
          );
        })
        .map((row) => row.id);
      for (let start = 0; start < written.length; start += CHUNK)
        await query
          .deleteFrom('lifecycleParameterSnapshots')
          .where('id', 'in', written.slice(start, start + CHUNK))
          .execute();
      // The configuration version copied from the group's key, at the
      // revision the group's head stands at; the head only while it still
      // stands there.
      const original = await query
        .selectFrom('lifecycleParameterHeads')
        .select(['revision'])
        .where('id', '=', identity(SCOPE, group))
        .executeTakeFirst<{ revision: unknown }>();
      if (!original) continue;
      const revision = Number(original.revision);
      await query
        .deleteFrom('lifecycleParameterSelections')
        .where('versionId', '=', identity(SCOPE, name, revision))
        .execute();
      await query
        .deleteFrom('lifecycleParameterVersions')
        .where('id', '=', identity(SCOPE, name, revision))
        .execute();
      await query
        .deleteFrom('lifecycleParameterHeads')
        .where('id', '=', identity(SCOPE, name))
        .where('revision', '=', revision)
        .execute();
    }
  },
});

export default migration;
