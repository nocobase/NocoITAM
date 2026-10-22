import { randomUUID } from 'node:crypto';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AiRecordTool } from '../../routes/itam/ai-records.js';
import { scopeFor } from './ai-bridge.js';
import {
  AI_WRITE_TOOLS,
  runWrite,
  screenWrite,
  type AiWriteFailure,
  type AiWriteTool,
} from './ai-writes.js';
import type { Row } from './collection-query.js';
import { dbDateTime } from './dates.js';
import { nameOf, referenceNames, referenceOf } from './reference-names.js';

/**
 * Plans (template 1.0.0-beta.64, after NocoCRM's): the changes the assistant
 * proposes, which the person it works for carries out or declines on a card
 * in the conversation. A run of the Agents plugin changes nothing itself:
 * every write command refuses it with PLAN_REQUIRED, and it writes the whole
 * change as one plan of steps.
 *
 * A step is one of the operations the assistant could propose before
 * (`AI_WRITE_TOOLS`, `AI_RECORD_TOOLS`), named without their `itam_` prefix
 * — `assign_device`, `create_record` — with the same parameters, so a step
 * is checked by the same screen and carried out by the same service as the
 * page that does it, as the person deciding.
 *
 * Where it departs from NocoCRM's: the steps are carried out **one after
 * another**, not in one transaction. The services open their own
 * transactions, and SQLite holds one connection, so a transaction around
 * them would wait for itself (AGENTS.md). A step refused stops the plan
 * there: the steps before it stay done, the card says how far it got, and
 * the outcome tells the assistant the same.
 */

/**
 * The record tools by name: `ai-records.ts` lives with the routes whose
 * schemas it reuses, and imports the services this module is registered
 * beside, so it is loaded when a plan is checked or run rather than here.
 */
const RECORD_TOOLS: readonly AiRecordTool[] = [
  'itam_create_record',
  'itam_stock_in',
  'itam_issue_stock',
  'itam_take_back_stock',
  'itam_receive_purchase_line',
];
const records = () => import('../../routes/itam/ai-records.js');

export const PLAN_OPS = [
  ...AI_WRITE_TOOLS.map((tool) => tool.replace(/^itam_/, '')),
  ...RECORD_TOOLS.map((tool) => tool.replace(/^itam_/, '')),
] as [string, ...string[]];

const toolOf = (op: string): string => `itam_${op}`;
const isRecordTool = (tool: string): tool is AiRecordTool =>
  (RECORD_TOOLS as readonly string[]).includes(tool);

export interface PlanStepInput {
  readonly op: string;
  /** How a later step names the record this one creates; `$<n>` works too. */
  readonly ref?: string;
  readonly params: Row;
}

export interface PlanInput {
  readonly title: string;
  readonly summary?: string;
  readonly steps: readonly PlanStepInput[];
}

/** Who proposed it, and the conversation its outcome goes back to. */
export interface PlanSource {
  readonly agentId: string | null;
  readonly agentName: string | null;
  readonly runId: string | null;
  readonly conversationId: string | null;
}

export const PLAN_STATUSES = [
  'pending',
  'executing',
  'executed',
  'failed',
  'voided',
  'expired',
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** What a step says it does, as the card shows it. */
export interface StepCheck {
  /** The step's own one-line description. */
  readonly title: string;
  /** Each parameter, with the name of the record an id stands for. */
  readonly fields: readonly StepField[];
}

/** One parameter of a step, with the name of the record an id stands for. */
export interface StepField {
  readonly field: string;
  readonly value: unknown;
  readonly name?: string;
  /**
   * A list of entries (a return's `items`), each its own fields with their
   * names (2026-10-22): the card showed the list as raw JSON, ids and all.
   */
  readonly items?: readonly (readonly StepField[])[];
}

export interface PlanStepView {
  readonly id: string;
  readonly position: number;
  readonly op: string;
  readonly ref: string | null;
  readonly params: Row;
  readonly check: StepCheck | null;
  readonly status: 'pending' | 'done' | 'failed' | 'removed';
  readonly result: Row | null;
}

export interface PlanFailure extends AiWriteFailure {
  readonly position: number;
}

export interface PlanView {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly status: PlanStatus;
  readonly revision: number;
  readonly proposerUserId: string;
  readonly agentId: string | null;
  readonly agentName: string | null;
  readonly runId: string | null;
  readonly conversationId: string | null;
  readonly deciderUserId: string | null;
  readonly decidedAt: string | null;
  readonly failure: PlanFailure | null;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly steps: readonly PlanStepView[];
}

/** What a decision sends back to the conversation that proposed the plan. */
export interface PlanOutcome {
  readonly plan: PlanView;
  readonly decision: 'executed' | 'voided' | 'failed';
}

/** A plan refused or not found, as the routes answer it. */
export class PlanError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_INPUT'
      | 'PLAN_STEP_REFUSED'
      | 'PLAN_DECIDED'
      | 'PLAN_EXPIRED'
      | 'CONFLICT',
    message: string,
    readonly field?: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

const DAY = 24 * 60 * 60 * 1000;
export const MAX_STEPS = 30;

export interface PlanService {
  /** Tells the proposing conversation how a decision came out. */
  onDecided?: (outcome: PlanOutcome) => Promise<void>;
  create(
    actorId: string,
    input: PlanInput,
    source: PlanSource,
  ): Promise<PlanView>;
  get(actorId: string, id: string): Promise<PlanView>;
  list(
    actorId: string,
    options: {
      readonly status?: PlanStatus;
      readonly conversationId?: string;
      readonly page: number;
      readonly pageSize: number;
    },
  ): Promise<{ data: PlanView[]; total: number }>;
  execute(
    actorId: string,
    id: string,
    input: { readonly revision: number; readonly skip?: readonly number[] },
  ): Promise<PlanView>;
  void(actorId: string, id: string, revision: number): Promise<PlanView>;
  expireDue(): Promise<number>;
}

export function createPlanService(container: ServiceContainer): PlanService {
  const database = (): DatabaseManager =>
    container.resolve(databaseManagerToken);
  const query = () => database().query();

  /** Each step as its screen sees it, or the first refused. */
  async function rehearse(
    actorId: string,
    title: string,
    steps: readonly PlanStepInput[],
  ): Promise<StepCheck[]> {
    const scope = scopeFor(container, actorId);
    const checks: StepCheck[] = [];
    for (const [index, step] of steps.entries()) {
      const position = index + 1;
      const tool = toolOf(step.op);
      if (!PLAN_OPS.includes(step.op))
        throw new PlanError(
          'PLAN_STEP_REFUSED',
          `Unknown operation "${step.op}"`,
          `steps.${position}`,
          `op: one of ${PLAN_OPS.join(', ')}`,
        );
      const params = withTitle(step.params, title);
      const screened = isRecordTool(tool)
        ? await (await records()).screenRecord(container, scope, tool, params)
        : await screenWrite(container, scope, tool, params);
      if (!screened.ok)
        throw new PlanError(
          'PLAN_STEP_REFUSED',
          screened.message,
          `steps.${position}`,
          `${screened.code}${screened.field ? `: ${screened.field}` : ''}`,
        );
      checks.push(await checkOf(actorId, params));
    }
    return checks;
  }

  /** The step's parameters, each id with the name it stands for. */
  async function checkOf(actorId: string, params: Row): Promise<StepCheck> {
    const scope = scopeFor(container, actorId);
    const flat: Record<string, unknown> = {};
    const input =
      params.input && typeof params.input === 'object'
        ? (params.input as Row)
        : null;
    for (const [field, value] of Object.entries(params)) {
      if (field === 'title') continue;
      // A record step's own fields rather than `collection` and an `input`
      // object read as JSON (2026-10-22); its `assignTo` as whom it goes to.
      if (input && (field === 'collection' || field === 'input')) continue;
      flat[field] = value;
    }
    if (input)
      for (const [field, value] of Object.entries(input)) {
        if (field === 'assignTo' && value && typeof value === 'object') {
          const to = value as Row;
          flat.assigneeType = to.targetType ?? 'person';
          flat.assigneeId = to.targetId;
        } else flat[field] = value;
      }
    // The operations name whom a device goes to as `targetId` (a person
    // unless stated otherwise), which the lookup knows as an assignee.
    const lookupOf = (row: Row): Record<string, unknown> => {
      const lookup: Record<string, unknown> = { ...row };
      if ('targetId' in row) {
        lookup.assigneeId = row.targetId;
        lookup.assigneeType = row.targetType ?? 'person';
      }
      if ('reservedForId' in row)
        lookup.reservedForType = row.reservedForType ?? 'person';
      if ('holderId' in row) lookup.holderType = row.holderType ?? 'person';
      return lookup;
    };
    // A list of entries, each an object: its ids are named as the step's own.
    const entriesOf = (value: unknown): Row[] | undefined =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => entry && typeof entry === 'object')
        ? (value as Row[])
        : undefined;
    const lookups = [
      lookupOf(flat),
      ...Object.values(flat).flatMap((value) =>
        (entriesOf(value) ?? []).map(lookupOf),
      ),
    ];
    const names = await referenceNames(database(), lookups, {
      readable: async (collection) =>
        collection === 'user' || Boolean(await scope.may(collection, 'read')),
    }).catch(() => undefined);
    const fieldsOf = (row: Row): StepField[] => {
      const lookup = lookupOf(row);
      return Object.entries(row).map(([field, value]) => {
        const key = field === 'targetId' ? 'assigneeId' : field;
        const name =
          names && referenceOf(lookup, key)
            ? nameOf(names, lookup, key)
            : undefined;
        const entries = entriesOf(value);
        return {
          field,
          value,
          ...(typeof name === 'string' && name && name !== value
            ? { name }
            : {}),
          ...(entries ? { items: entries.map(fieldsOf) } : {}),
        };
      });
    };
    return {
      title: typeof params.title === 'string' ? params.title : '',
      fields: fieldsOf(flat),
    };
  }

  async function load(id: string): Promise<PlanView> {
    const plan = await query()
      .selectFrom('itamPlans')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    if (!plan) throw new PlanError('NOT_FOUND', 'No such plan');
    const rows = await query()
      .selectFrom('itamPlanSteps')
      .selectAll()
      .where('planId', '=', id)
      .orderBy('position', 'asc')
      .execute<Row>();
    return {
      id: String(plan.id),
      title: String(plan.title),
      summary: text(plan.summary),
      status: String(plan.status) as PlanStatus,
      revision: Number(plan.revision),
      proposerUserId: String(plan.proposerUserId),
      agentId: text(plan.agentId),
      agentName: text(plan.agentName),
      runId: text(plan.runId),
      conversationId: text(plan.conversationId),
      deciderUserId: text(plan.deciderUserId),
      decidedAt: iso(plan.decidedAt),
      failure: json(plan.failure) as PlanFailure | null,
      expiresAt: iso(plan.expiresAt) ?? '',
      createdAt: iso(plan.createdAt) ?? '',
      steps: rows.map((row) => ({
        id: String(row.id),
        position: Number(row.position),
        op: String(row.op),
        ref: text(row.ref),
        params: json(row.params) ?? {},
        check: json(row.check) as StepCheck | null,
        status: String(row.status) as PlanStepView['status'],
        result: json(row.result),
      })),
    };
  }

  async function get(actorId: string, id: string): Promise<PlanView> {
    const plan = await load(id);
    // A plan is its proposer's: the person the assistant works for.
    if (plan.proposerUserId !== actorId)
      throw new PlanError('NOT_FOUND', 'No such plan');
    return plan;
  }

  async function expireDue(): Promise<number> {
    const now = new Date();
    const result = await query()
      .updateTable('itamPlans')
      .set({ status: 'expired', updatedAt: now })
      .where('status', '=', 'pending')
      .where('expiresAt', '<', dbDateTime(now))
      .execute();
    return Number(
      (result as { updatedCount?: unknown } | undefined)?.updatedCount ?? 0,
    );
  }

  async function decidable(
    actorId: string,
    id: string,
    revision: number,
  ): Promise<PlanView> {
    await expireDue();
    const plan = await get(actorId, id);
    if (plan.status !== 'pending')
      throw new PlanError(
        plan.status === 'expired' ? 'PLAN_EXPIRED' : 'PLAN_DECIDED',
        `The plan is ${plan.status}`,
      );
    if (plan.revision !== revision)
      throw new PlanError('CONFLICT', 'The plan changed');
    return plan;
  }

  const service: PlanService = {
    async create(actorId, input, source) {
      if (!input.steps.length || input.steps.length > MAX_STEPS)
        throw new PlanError(
          'INVALID_INPUT',
          'A plan has 1 to 30 steps',
          'steps',
        );
      const title = input.title.trim().slice(0, 255);
      const checks = await rehearse(actorId, title, input.steps);
      const now = new Date();
      const id = randomUUID();
      await database().transaction(async (connection) => {
        await connection.query
          .insertInto('itamPlans')
          .values({
            id,
            title,
            summary: input.summary?.trim() || null,
            status: 'pending',
            revision: 1,
            proposerUserId: actorId,
            agentId: source.agentId,
            agentName: source.agentName,
            runId: source.runId,
            conversationId: source.conversationId,
            deciderUserId: null,
            decidedAt: null,
            failure: null,
            expiresAt: new Date(now.getTime() + DAY),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        for (const [index, step] of input.steps.entries())
          await connection.query
            .insertInto('itamPlanSteps')
            .values({
              id: randomUUID(),
              planId: id,
              position: index + 1,
              op: step.op,
              ref: step.ref ?? null,
              params: withTitle(step.params, title),
              check: checks[index],
              status: 'pending',
              result: null,
            })
            .execute();
      });
      return get(actorId, id);
    },

    get,

    async list(actorId, options) {
      await expireDue();
      let select = query()
        .selectFrom('itamPlans')
        .select(['id'])
        .where('proposerUserId', '=', actorId);
      if (options.status) select = select.where('status', '=', options.status);
      if (options.conversationId)
        select = select.where('conversationId', '=', options.conversationId);
      const ids = (
        await select.orderBy('createdAt', 'desc').execute<{ id: unknown }>()
      ).map((row) => String(row.id));
      const plans = await Promise.all(ids.map((id) => load(id)));
      // Waiting ones first, then the newest.
      plans.sort(
        (a, b) =>
          Number(b.status === 'pending') - Number(a.status === 'pending') ||
          b.createdAt.localeCompare(a.createdAt),
      );
      const start = (options.page - 1) * options.pageSize;
      return {
        data: plans.slice(start, start + options.pageSize),
        total: plans.length,
      };
    },

    async execute(actorId, id, input) {
      const plan = await decidable(actorId, id, input.revision);
      const skipped = new Set(input.skip ?? []);
      if (plan.steps.every((step) => skipped.has(step.position)))
        throw new PlanError('INVALID_INPUT', 'Nothing left to do', 'skip');
      const claimed = await query()
        .updateTable('itamPlans')
        .set({ status: 'executing', updatedAt: new Date() })
        .where('id', '=', id)
        .where('status', '=', 'pending')
        .where('revision', '=', plan.revision)
        .execute();
      if (
        Number(
          (claimed as { updatedCount?: unknown } | undefined)?.updatedCount ??
            0,
        ) !== 1
      )
        throw new PlanError('CONFLICT', 'The plan changed');
      const scope = scopeFor(container, actorId);
      const refs = new Map<string, string>();
      let failure: PlanFailure | null = null;
      for (const step of plan.steps) {
        if (skipped.has(step.position)) {
          await setStep(step.id, { status: 'removed' });
          continue;
        }
        const tool = toolOf(step.op);
        const params = resolveRefs(step.params, refs);
        try {
          const result = isRecordTool(tool)
            ? await (
                await records()
              ).runRecordTool(container, scope, tool, params)
            : await runWrite(container, scope, tool as AiWriteTool, params);
          const createdId =
            typeof result.id === 'string' ? result.id : undefined;
          if (createdId) {
            refs.set(`$${step.position}`, createdId);
            if (step.ref)
              refs.set(
                step.ref.startsWith('$') ? step.ref : `$${step.ref}`,
                createdId,
              );
          }
          await setStep(step.id, { status: 'done', result });
        } catch (error) {
          failure = { position: step.position, ...failureOf(error) };
          await setStep(step.id, { status: 'failed', result: failure });
          break;
        }
      }
      const now = new Date();
      await query()
        .updateTable('itamPlans')
        .set({
          status: failure ? 'failed' : 'executed',
          deciderUserId: actorId,
          decidedAt: now,
          failure,
          updatedAt: now,
        })
        .where('id', '=', id)
        .execute();
      const done = await load(id);
      await tell({ plan: done, decision: failure ? 'failed' : 'executed' });
      return done;
    },

    async void(actorId, id, revision) {
      const plan = await decidable(actorId, id, revision);
      const now = new Date();
      await query()
        .updateTable('itamPlans')
        .set({
          status: 'voided',
          deciderUserId: actorId,
          decidedAt: now,
          updatedAt: now,
        })
        .where('id', '=', plan.id)
        .execute();
      const voided = await load(plan.id);
      await tell({ plan: voided, decision: 'voided' });
      return voided;
    },

    expireDue,
  };

  async function setStep(
    id: string,
    values: { status: PlanStepView['status']; result?: unknown },
  ): Promise<void> {
    await query()
      .updateTable('itamPlanSteps')
      .set({ status: values.status, result: values.result ?? null })
      .where('id', '=', id)
      .execute();
  }

  async function tell(outcome: PlanOutcome): Promise<void> {
    await service.onDecided?.(outcome).catch(() => undefined);
  }

  return service;
}

/** Each step carries a line of its own; the plan's title when it gave none. */
function withTitle(params: Row, title: string): Row {
  return typeof params.title === 'string' && params.title.trim()
    ? params
    : { ...params, title };
}

/** A later step names a record an earlier one created by `$n` or its ref. */
function resolveRefs(value: Row, refs: Map<string, string>): Row {
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string' && refs.has(item)) return refs.get(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([key, inner]) => [key, walk(inner)]),
      );
    return item;
  };
  return walk(value) as Row;
}

/** `runWrite` throws the failure as JSON in the message (`refuse`). */
function failureOf(error: unknown): AiWriteFailure {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message) as Partial<AiWriteFailure>;
    if (typeof parsed.code === 'string')
      return {
        code: parsed.code,
        message: String(parsed.message ?? ''),
        ...(parsed.field ? { field: parsed.field } : {}),
      };
  } catch {
    // Not one of ours: the message as it is.
  }
  return { code: 'SERVER_ERROR', message };
}

/** A column read back as text: a string, or a number or bigint id. */
const text = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? value.toString()
      : null;

const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  const raw = text(value);
  if (raw === null) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

/** A JSON column read back: decoded by the query layer, a string before. */
const json = (value: unknown): Row | null => {
  let parsed = value;
  if (typeof value === 'string')
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  return parsed && typeof parsed === 'object' ? (parsed as Row) : null;
};

export const planServiceToken: ServiceToken<PlanService> =
  createServiceToken<PlanService>('itam/plans');
