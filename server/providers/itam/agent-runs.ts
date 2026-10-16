import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText } from './collection-query.js';
import { dbDateTime } from './dates.js';

/**
 * The work agents' runs (2026-10-16, plan "Work agents"; table
 * `itamAgentRuns`, migration `202610160001_agent_runs`). An agent working
 * on a record without being asked in a conversation writes one: running
 * while it works, then waiting for its decider with its result, or failed
 * with a reason code shown where the result would have been. A person
 * accepts or dismisses a waiting one; a newer run on the same record, or the
 * record decided elsewhere, supersedes it. Every run names what started it:
 * the person who asked, or the trigger an administrator left switched on.
 */

// 离职回收 and 授权续费 (plan "Work agents", step 2) were built on
// 2026-10-17 and removed the same day: what a leaver hands back and what a
// renewal needs are rules (`recovery.ts`, the renewal reminders), not
// judgements a model adds to.
// MDM 跟进 (2026-10-17): what a device sync leaves for a person to judge.
export const AGENTS = ['approvalReview', 'deviceSync'] as const;
export type AgentName = (typeof AGENTS)[number];

export const RUN_STATUSES = [
  'running',
  'pending',
  'accepted',
  'dismissed',
  'failed',
  'superseded',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Why a run gave no result, as the decider reads it. */
export type RunFailure =
  'unavailable' | 'unreadable' | 'timedOut' | 'notFound' | 'failed';

/**
 * How long a run may be at work before it reads as failed (`timedOut`): a
 * process cut short leaves it running, and nobody should wait on it.
 */
export const RUN_LIMIT_MS = 10 * 60_000;
/** How long a run may wait for its turn in the queue. */
const QUEUE_LIMIT_MS = 24 * 60 * 60_000;

export interface AgentRun {
  readonly id: string;
  readonly agent: AgentName;
  readonly trigger: string;
  readonly startedById: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly refId: string | null;
  readonly deciderId: string | null;
  readonly status: RunStatus;
  readonly result: Record<string, unknown> | null;
  readonly failure: RunFailure | null;
  readonly revisesId: string | null;
  readonly instruction: string | null;
  readonly decision: string | null;
  readonly comment: string | null;
  readonly decidedById: string | null;
  readonly decidedAt: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface StartRun {
  readonly agent: AgentName;
  readonly trigger: string;
  readonly startedById: string | null;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly refId?: string | null;
  readonly deciderId: string | null;
  readonly revisesId?: string | null;
  readonly instruction?: string | null;
}

export interface RunCounts {
  readonly runs: number;
  readonly accepted: number;
  readonly dismissed: number;
  readonly waiting: number;
  readonly failed: number;
}

export interface AgentRunService {
  /** A new run, running; any earlier one of the agent on the record still open is superseded. */
  start(input: StartRun, connection?: DatabaseConnection): Promise<AgentRun>;
  get(id: string): Promise<AgentRun | undefined>;
  /** The newest run of the agent on a record. */
  latest(
    agent: AgentName,
    subjectType: string,
    subjectId: string,
  ): Promise<AgentRun | undefined>;
  /** Marks a run as being worked on (`started`), or handed back to the queue. */
  markStarted(id: string, started: boolean): Promise<void>;
  /** Settles a running run: its result waiting, or why there is none. Nothing when it is no longer running. */
  finish(
    id: string,
    outcome:
      | { readonly status: 'pending'; readonly result: Record<string, unknown> }
      | { readonly status: 'failed'; readonly failure: RunFailure },
    model?: string | null,
  ): Promise<boolean>;
  /**
   * A person's decision on a waiting run; false when it is no longer
   * waiting (decided, superseded) — nothing changes then.
   */
  decide(
    id: string,
    input: {
      readonly status: 'accepted' | 'dismissed';
      readonly decidedById: string;
      readonly decision?: string | null;
      readonly comment?: string | null;
    },
    connection?: DatabaseConnection,
  ): Promise<boolean>;
  /** Puts a decided run back to waiting, when what it decided failed. */
  reopen(id: string): Promise<void>;
  /** Retires the open runs of an agent on a record: decided elsewhere, withdrawn, or asked again. */
  supersede(
    agent: AgentName,
    subjectType: string,
    subjectId: string,
    connection?: DatabaseConnection,
  ): Promise<void>;
  /** Runs left running too long, failed `timedOut`. */
  expireStale(now?: Date): Promise<number>;
  /** The runs still running, oldest first: queued again at start. */
  running(): Promise<readonly AgentRun[]>;
  /**
   * The reader's runs to decide, as 收件箱 lists them: waiting, running and
   * failed first, then those handled in the last `days`.
   */
  inbox(
    deciderId: string,
    options?: { readonly days?: number; readonly limit?: number },
  ): Promise<{
    readonly open: readonly AgentRun[];
    readonly handled: readonly AgentRun[];
  }>;
  /** How many runs wait for the reader's decision. */
  waitingCount(deciderId: string): Promise<number>;
  /** An agent's runs since `since`, newest first. */
  list(
    agent: AgentName,
    options: {
      readonly since: Date;
      readonly statuses?: readonly RunStatus[];
      readonly limit?: number;
    },
  ): Promise<readonly AgentRun[]>;
  /** An agent's runs since `since`, counted by how they ended. */
  counts(agent: AgentName, since: Date): Promise<RunCounts>;
  /** How many runs are at work now, by agent. */
  workingNow(): Promise<Partial<Record<AgentName, number>>>;
}

export const agentRunServiceToken: ServiceToken<AgentRunService> =
  createServiceToken<AgentRunService>('itam/agent-run-service');

const text = (value: unknown): string | null => asText(value) || null;
const iso = (value: unknown): string | null => {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = asText(value);
  if (!raw) return null;
  // SQLite keeps datetimes as epoch milliseconds.
  const date = new Date(/^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};
const json = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined || value === '') return null;
  try {
    const parsed: unknown =
      typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export function decodeRun(row: Record<string, unknown>): AgentRun {
  return {
    id: asText(row.id) ?? '',
    agent: asText(row.agent) as AgentName,
    trigger: asText(row.trigger) ?? '',
    startedById: text(row.startedById),
    subjectType: asText(row.subjectType) ?? '',
    subjectId: asText(row.subjectId) ?? '',
    refId: text(row.refId),
    deciderId: text(row.deciderId),
    status: asText(row.status) as RunStatus,
    result: json(row.result),
    failure: text(row.failure) as RunFailure | null,
    revisesId: text(row.revisesId),
    instruction: text(row.instruction),
    decision: text(row.decision),
    comment: text(row.comment),
    decidedById: text(row.decidedById),
    decidedAt: iso(row.decidedAt),
    model: text(row.model),
    createdAt: iso(row.createdAt) ?? '',
    updatedAt: iso(row.updatedAt) ?? '',
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

const OPEN: readonly RunStatus[] = ['running', 'pending'];
const HANDLED: readonly RunStatus[] = ['accepted', 'dismissed', 'superseded'];

export function createAgentRunService(
  database: DatabaseManager,
): AgentRunService {
  const query = (connection?: DatabaseConnection) =>
    connection ? connection.query : database.query();

  const service: AgentRunService = {
    async start(input, connection) {
      await service.supersede(
        input.agent,
        input.subjectType,
        input.subjectId,
        connection,
      );
      const now = new Date();
      const values = {
        id: crypto.randomUUID(),
        agent: input.agent,
        trigger: input.trigger,
        startedById: input.startedById,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        refId: input.refId ?? null,
        deciderId: input.deciderId,
        status: 'running',
        result: null,
        failure: null,
        revisesId: input.revisesId ?? null,
        instruction: input.instruction ?? null,
        decision: null,
        comment: null,
        decidedById: null,
        decidedAt: null,
        model: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
      };
      await query(connection)
        .insertInto('itamAgentRuns')
        .values(values)
        .execute();
      return decodeRun(values);
    },

    async get(id) {
      await service.expireStale();
      const row = await database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Record<string, unknown>>();
      return row ? decodeRun(row) : undefined;
    },

    async latest(agent, subjectType, subjectId) {
      await service.expireStale();
      const row = await database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('agent', '=', agent)
        .where('subjectType', '=', subjectType)
        .where('subjectId', '=', subjectId)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst<Record<string, unknown>>();
      return row ? decodeRun(row) : undefined;
    },

    async markStarted(id, started) {
      await database
        .query()
        .updateTable('itamAgentRuns')
        .set({ startedAt: started ? new Date() : null, updatedAt: new Date() })
        .where('id', '=', id)
        .where('status', '=', 'running')
        .execute();
    },

    async finish(id, outcome, model) {
      const now = new Date();
      const result = await database
        .query()
        .updateTable('itamAgentRuns')
        .set({
          status: outcome.status,
          result: outcome.status === 'pending' ? outcome.result : null,
          failure: outcome.status === 'failed' ? outcome.failure : null,
          ...(model ? { model: model.slice(0, 255) } : {}),
          finishedAt: now,
          updatedAt: now,
        })
        .where('id', '=', id)
        // Decided, withdrawn or asked again meanwhile: left as it is.
        .where('status', '=', 'running')
        .execute();
      return (result.updatedCount ?? 0) > 0;
    },

    async decide(id, input, connection) {
      const now = new Date();
      const result = await query(connection)
        .updateTable('itamAgentRuns')
        .set({
          status: input.status,
          decision: input.decision ?? null,
          comment: input.comment ?? null,
          decidedById: input.decidedById,
          decidedAt: now,
          updatedAt: now,
        })
        .where('id', '=', id)
        .where('status', '=', 'pending')
        .execute();
      return (result.updatedCount ?? 0) > 0;
    },

    async reopen(id) {
      await database
        .query()
        .updateTable('itamAgentRuns')
        .set({
          status: 'pending',
          decision: null,
          comment: null,
          decidedById: null,
          decidedAt: null,
          updatedAt: new Date(),
        })
        .where('id', '=', id)
        .where('status', 'in', ['accepted', 'dismissed'])
        .execute();
    },

    async supersede(agent, subjectType, subjectId, connection) {
      await query(connection)
        .updateTable('itamAgentRuns')
        .set({ status: 'superseded', updatedAt: new Date() })
        .where('agent', '=', agent)
        .where('subjectType', '=', subjectType)
        .where('subjectId', '=', subjectId)
        // A failure too: once the record has a newer run, or is decided,
        // it no longer waits on anyone (2026-10-17).
        .where('status', 'in', [...OPEN, 'failed'])
        .execute();
    },

    async expireStale(now = new Date()) {
      const working = new Date(now.getTime() - RUN_LIMIT_MS);
      const queued = new Date(now.getTime() - QUEUE_LIMIT_MS);
      // Datetime columns are text: compared through `dbDateTime`, as a bound
      // `Date` matches nothing (`.agents/rules/itam-foundations.md`).
      const result = await database
        .query()
        .updateTable('itamAgentRuns')
        .set({
          status: 'failed',
          failure: 'timedOut',
          finishedAt: now,
          updatedAt: now,
        })
        .where('status', '=', 'running')
        .where((eb) =>
          eb.or([
            eb.and([
              eb('startedAt', 'is not', null),
              eb('startedAt', '<', dbDateTime(working)),
            ]),
            eb('createdAt', '<', dbDateTime(queued)),
          ]),
        )
        .execute()
        .catch(() => ({ updatedCount: 0 }));
      return result.updatedCount ?? 0;
    },

    async running() {
      const rows = await database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('status', '=', 'running')
        .orderBy('createdAt', 'asc')
        .execute<Record<string, unknown>>();
      return rows.map(decodeRun);
    },

    async inbox(deciderId, options = {}) {
      await service.expireStale();
      const since = new Date(
        Date.now() - (options.days ?? 30) * 24 * 60 * 60_000,
      );
      const limit = options.limit ?? 50;
      const open = await database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('deciderId', '=', deciderId)
        // Runs of a work no longer done (离职回收, 授权续费) are not shown.
        .where('agent', 'in', [...AGENTS])
        .where('status', 'in', ['running', 'pending', 'failed'])
        // A failure stays in front of its decider for as long as the
        // record waits on them, and not past the window.
        .where((eb) =>
          eb.or([
            eb('status', '!=', 'failed'),
            eb('createdAt', '>=', dbDateTime(since)),
          ]),
        )
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .execute<Record<string, unknown>>();
      const handled = await database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('deciderId', '=', deciderId)
        // Runs of a work no longer done (离职回收, 授权续费) are not shown.
        .where('agent', 'in', [...AGENTS])
        .where('status', 'in', [...HANDLED])
        .where('updatedAt', '>=', dbDateTime(since))
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .execute<Record<string, unknown>>();
      return { open: open.map(decodeRun), handled: handled.map(decodeRun) };
    },

    async waitingCount(deciderId) {
      await service.expireStale();
      const row = await database
        .query()
        .selectFrom('itamAgentRuns')
        .select((eb) => [eb.fn.countAll().as('count')])
        .where('deciderId', '=', deciderId)
        // Runs of a work no longer done (离职回收, 授权续费) are not shown.
        .where('agent', 'in', [...AGENTS])
        .where('status', '=', 'pending')
        .executeTakeFirst<{ count: unknown }>();
      return Number(row?.count ?? 0);
    },

    async list(agent, options) {
      await service.expireStale();
      let rows = database
        .query()
        .selectFrom('itamAgentRuns')
        .selectAll()
        .where('agent', '=', agent)
        .where('createdAt', '>=', dbDateTime(options.since));
      if (options.statuses?.length)
        rows = rows.where('status', 'in', [...options.statuses]);
      return (
        await rows
          .orderBy('createdAt', 'desc')
          .limit(options.limit ?? 100)
          .execute<Record<string, unknown>>()
      ).map(decodeRun);
    },

    async counts(agent, since) {
      await service.expireStale();
      const rows = await database
        .query()
        .selectFrom('itamAgentRuns')
        .select(['status'])
        .select((eb) => [eb.fn.countAll().as('count')])
        .where('agent', '=', agent)
        .where('createdAt', '>=', dbDateTime(since))
        .groupBy('status')
        .execute<{ status: unknown; count: unknown }>();
      const of = (status: RunStatus) =>
        Number(rows.find((row) => row.status === status)?.count ?? 0);
      return {
        runs: rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
        accepted: of('accepted'),
        dismissed: of('dismissed'),
        waiting: of('pending') + of('running'),
        failed: of('failed'),
      };
    },

    async workingNow() {
      await service.expireStale();
      const rows = await database
        .query()
        .selectFrom('itamAgentRuns')
        .select(['agent'])
        .select((eb) => [eb.fn.countAll().as('count')])
        .where('status', '=', 'running')
        .groupBy('agent')
        .execute<{ agent: unknown; count: unknown }>();
      const working: Partial<Record<AgentName, number>> = {};
      for (const row of rows)
        working[asText(row.agent) as AgentName] = Number(row.count ?? 0);
      return working;
    },
  };
  return service;
}
