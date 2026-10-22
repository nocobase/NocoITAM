import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { JobInterruptedError } from '@nocobase/jobs';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { deviceSyncReview, readerFor } from '../itam-agents/reads.js';
import { WORK_AGENTS } from '../itam-agents/work-agents.js';
import {
  agentRunServiceToken,
  type AgentRun,
  type RunFailure,
} from './agent-runs.js';
import { agentOn } from './agent-switches.js';
import { openSession, readSkill } from './ai-model.js';
import { z } from 'zod';
import { asText, type Row } from './collection-query.js';
import { deviceReviewServiceToken } from './device-review.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';
import { PlanError, planServiceToken, type PlanOutcome } from './plans.js';
import { shapeOf } from './ai-model.js';
import { settingsServiceToken } from './settings.js';

/**
 * MDM 跟进 (2026-10-17): after each pull from a device platform, every
 * item MDM 核对 lists — 失联, 使用人不一致, 状态不符 on a register device,
 * 只在台账 (a device on no platform), 只在 MDM (a platform record the
 * register lacks) — is worked out by Asset Steward with its `device-sync`
 * method and left as a plan waiting in 收件箱, for the person who would
 * settle it on MDM 核对: a device's items go to its 负责人; a platform record,
 * which has no 负责人, and a device nobody answers for go to each holder of
 * the asset manager permission set, the first to decide settling them for
 * all. What a plan can do is a step — register, link, keep off, transfer,
 * correct the status, ignore the difference, mark as needing no platform —
 * each with its reason; what it cannot (find a device that went silent,
 * enrol one in the platform, ask the platform's administrator) is a note.
 * It never marks a device lost.
 *
 * Only what is new is looked at: a difference in a suggestion its person
 * carried out or set aside is not raised again; one left waiting comes
 * back with the next pull, whose run replaces the person's waiting one (a
 * plan lasts a day). Nothing changes until the person carries out the plan
 * — the card is the plan's own, with its ticks.
 */

const AGENT = 'deviceSync' as const;
const SUBJECT = 'deviceSync';
/** The asset manager set: who settles a platform record nobody owns. */
const ASSET_MANAGER_SET = 'itam-asset-manager';
/** How far back a decided suggestion still counts as handled. */
const HANDLED_DAYS = 90;
const TURN_MS = 8 * 60_000;

export type FollowUpKind =
  'stale' | 'userMismatch' | 'statusMismatch' | 'unmanaged' | 'unregistered';

export interface FollowUpItem {
  /** The difference: device, kind and the value seen, or a platform record. */
  readonly key: string;
  readonly kind: FollowUpKind;
  /** The device, or the platform record (只在 MDM). */
  readonly subject: string;
  readonly label: string;
}

/** What the model may decide for an item, and what each becomes. */
const ACTIONS = [
  'register',
  'link',
  'ignore',
  'transfer',
  'assign',
  'correct',
  'keep',
  'exempt',
  'verify',
  'escalate',
] as const;

const ALLOWED: Readonly<Record<FollowUpKind, readonly string[]>> = {
  stale: ['correct', 'keep', 'verify', 'escalate'],
  userMismatch: ['transfer', 'assign', 'keep', 'verify', 'escalate'],
  statusMismatch: ['correct', 'keep', 'verify', 'escalate'],
  unmanaged: ['exempt', 'verify', 'escalate'],
  unregistered: ['register', 'link', 'ignore', 'verify'],
};

/** A status a plan may correct a device to: never lost, which a person finds out. */
const CORRECT_TO = [
  'inStock',
  'inUse',
  'onLoan',
  'inRepair',
  'retired',
] as const;

const DECIDED = z.object({
  decisions: z
    .array(
      z.object({
        item: z.string(),
        action: z.enum(ACTIONS),
        target: z.string().nullable().optional(),
        modelId: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        reason: z.string().max(300).nullable().optional(),
      }),
    )
    .max(60),
});
export type FollowUpDecision = z.infer<typeof DECIDED>['decisions'][number];
type Decision = FollowUpDecision;

/**
 * Who decides the items instead of the model: the demo, whose follow-up is
 * written with it (2026-10-16). Given each item as the model would read it
 * — its `ref`, `kind` and what MDM 核对 shows — it answers for the item by
 * that ref, or not at all (a note to look first).
 */
/** Who answers for a run's items: the model, or an answerer. */
type Ask = (
  material: readonly Record<string, unknown>[],
  signal?: AbortSignal,
) => Promise<
  | { readonly decisions: readonly Decision[]; readonly model: string | null }
  | { readonly failure: RunFailure; readonly model: string | null }
>;

export type FollowUpAnswerer = (
  material: readonly Readonly<Record<string, unknown>>[],
) => readonly FollowUpDecision[];

/**
 * What was suggested for one item (2026-10-21), for MDM 核对 to show on
 * its row: the action, why, the person or device it names, and whether the
 * plan carries it out or it is left to the reader.
 */
export interface FollowUpAdvice {
  readonly subject: string;
  readonly kind: FollowUpKind;
  readonly action: (typeof ACTIONS)[number];
  readonly reason: string | null;
  readonly target: string | null;
  readonly planned: boolean;
  /** Its steps' positions in the plan, so MDM 核对 can untick them. */
  readonly steps?: readonly number[];
}

export interface FollowUpResult {
  readonly items: readonly FollowUpItem[];
  readonly planId: string | null;
  /** What is not a plan step: register it, verify first, ask the admin. */
  readonly notes: readonly string[];
  readonly summary: string;
  readonly advice?: readonly FollowUpAdvice[];
}

/** Another person's open suggestion, as an asset manager reads it. */
export interface OtherFollowUp {
  readonly id: string;
  readonly deciderId: string;
  readonly status: string;
  readonly failure: string | null;
  readonly createdAt: string;
  readonly items: readonly FollowUpItem[];
  readonly summary: string;
  readonly notes: readonly string[];
  /** What its plan would do, while the plan waits. */
  readonly steps: readonly string[];
}

export interface DeviceSyncFollowUp {
  useJobs(dispatch: (runId: string) => Promise<void>): void;
  /**
   * After a pull: a run per person with something new to judge. Given the
   * answers (the demo), the runs are worked out here and now, without a
   * model, and written in the answers' language.
   */
  afterSync(
    by: string | null,
    answers?: {
      readonly answerer: FollowUpAnswerer;
      readonly locale: string;
    },
  ): Promise<readonly AgentRun[]>;
  /**
   * A person asks on MDM 核对 (2026-10-17): a run for their own items only
   * — the devices they answer for, and the platform records nobody owns
   * when they hold the asset manager set — without waiting for a pull.
   * Their waiting suggestion is replaced; nobody else's devices' are
   * touched, but the shared part is worked out again for every asset
   * manager (2026-10-22), being theirs together. Answers the reader's
   * runs. Asked by hand, it is never switched off.
   */
  ask(by: string): Promise<readonly AgentRun[]>;
  /**
   * For a holder of the asset manager set (2026-10-17): the suggestions
   * still open on the devices other people answer for, to read on MDM 核对
   * — the suggestion and what its plan would do, never the plan to carry
   * out, which stays its person's. None for anybody else. The platform
   * records' suggestions are left out: an asset manager has their own.
   */
  others(reader: string): Promise<readonly OtherFollowUp[]>;
  runEntry(runId: string, signal?: AbortSignal): Promise<void>;
  /** A plan decided on its card: the run that proposed it goes with it. */
  planDecided(outcome: PlanOutcome): Promise<void>;
  /** Its person sets it aside (nothing to carry out, or not now). */
  dismiss(
    runId: string,
    actorId: string,
    options?: {
      /**
       * Every step was settled on MDM 核对's rows (2026-10-21): it ends as
       * handled (accepted, decision `settled`), not as set aside.
       */
      readonly settled?: boolean;
    },
  ): Promise<AgentRun>;
}

export const deviceSyncFollowUpToken: ServiceToken<DeviceSyncFollowUp> =
  createServiceToken<DeviceSyncFollowUp>('itam/device-sync-followup');

const checkKey = (deviceId: string, kind: string, value: unknown) =>
  `${deviceId}|${kind}|${asText(value) ?? ''}`;
const recordKey = (id: string, state: unknown) =>
  `${id}|unregistered|${asText(state) ?? ''}`;

export function createDeviceSyncFollowUp(dependencies: {
  readonly container: ServiceContainer;
  readonly locale: () => string;
  readonly warn?: (detail: Record<string, unknown>, message: string) => void;
}): DeviceSyncFollowUp {
  const { container } = dependencies;
  const runs = () => container.resolve(agentRunServiceToken);
  const database = () => container.resolve(databaseManagerToken);
  const review = () => container.resolve(deviceReviewServiceToken);
  // The language a run is written in: the deployment's, or while the demo's
  // runs are worked out, the demo's.
  let answering: string | undefined;
  const zh = () => (answering ?? dependencies.locale()).startsWith('zh');
  let dispatch: ((runId: string) => Promise<void>) | undefined;
  let local: Promise<void> = Promise.resolve();

  const enqueue = async (runId: string): Promise<void> => {
    if (dispatch)
      try {
        await dispatch(runId);
        return;
      } catch {
        // The jobs service is not taking work: run it here instead.
      }
    local = local.then(() => service.runEntry(runId).catch(() => undefined));
  };

  /**
   * What a person carried out lately: not raised again. Set aside (拒绝,
   * 忽略) counts no more (2026-10-22): declining a suggestion leaves the
   * difference, so the next follow-up — a pull's or one asked for — works
   * it out again. A difference the register is right about is settled by
   * 忽略 on its row, which takes it off the list.
   */
  const handled = async (): Promise<ReadonlySet<string>> => {
    const decided = await runs().list(AGENT, {
      since: new Date(Date.now() - HANDLED_DAYS * 86_400_000),
      statuses: ['accepted'],
      limit: 500,
    });
    const keys = new Set<string>();
    for (const run of decided) {
      const left = await leftOut(run);
      for (const item of (run.result?.items ?? []) as FollowUpItem[])
        if (
          item &&
          typeof item.key === 'string' &&
          !left.has(`${item.subject}|${item.kind}`)
        )
          keys.add(item.key);
    }
    return keys;
  };

  /**
   * The items of a follow-up carried out that nothing was done about
   * (2026-10-22): every plan step left out, or no step at all — a note to
   * look at, or no suggestion. The next follow-up raises them again rather
   * than letting them go quietly. One set aside (拒绝, 忽略) keeps all its
   * items handled; so does one written before suggestions were kept per
   * item.
   */
  const leftOut = async (run: AgentRun): Promise<ReadonlySet<string>> => {
    const advice = run.result?.advice as FollowUpAdvice[] | undefined;
    if (run.status !== 'accepted' || !advice) return new Set();
    const planId = asText(run.result?.planId);
    const plan =
      planId && run.deciderId
        ? await container
            .resolve(planServiceToken)
            .get(run.deciderId, planId)
            .catch(() => null)
        : null;
    const done = new Set(
      (plan?.steps ?? [])
        .filter((step) => step.status === 'done')
        .map((step) => step.position),
    );
    const acted = new Set(
      advice
        .filter((entry) => (entry.steps ?? []).some((at) => done.has(at)))
        .map((entry) => `${entry.subject}|${entry.kind}`),
    );
    return new Set(
      ((run.result?.items ?? []) as FollowUpItem[])
        .map((item) => `${item.subject}|${item.kind}`)
        .filter((key) => !acted.has(key)),
    );
  };

  /** Everyone holding the asset manager set who has not left. */
  const assetManagers = async (): Promise<string[]> => {
    const sets = container.resolve(authorizationToken).permissionSets;
    const ids = (await sets.listAssignments(ASSET_MANAGER_SET))
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => String(assignment.subject.id));
    if (!ids.length) return [];
    const left = await database()
      .query()
      .selectFrom('people')
      .select(['userId'])
      .where('userId', 'in', ids)
      .where('employmentStatus', '=', 'left')
      .execute<{ userId: unknown }>();
    const gone = new Set(left.map((row) => String(row.userId)));
    return [...new Set(ids)].filter((id) => !gone.has(id));
  };

  /** The new items to judge, by who judges them. */
  const pending = async (): Promise<{
    readonly byOwner: Map<string, FollowUpItem[]>;
    readonly shared: FollowUpItem[];
  }> => {
    const done = await handled();
    const byOwner = new Map<string, FollowUpItem[]>();
    const shared: FollowUpItem[] = [];
    // A device nobody answers for is the asset managers', as a record the
    // register lacks is.
    const add = (owner: string | undefined, item: FollowUpItem) => {
      if (done.has(item.key)) return;
      if (owner) byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
      else shared.push(item);
    };
    for (const check of await review().checks())
      add(asText(check.ownerId), {
        key: checkKey(check.deviceId, check.kind, check.value),
        kind: check.kind,
        subject: check.deviceId,
        label: [check.deviceNo, check.deviceName].filter(Boolean).join(' / '),
      });
    for (const device of await review().unmanaged())
      add(asText(device.ownerId), {
        key: `${device.id}|unmanaged`,
        kind: 'unmanaged',
        subject: device.id,
        label: [device.deviceNo, device.name].filter(Boolean).join(' / '),
      });
    for (const record of await review().unregistered())
      add(undefined, {
        key: recordKey(record.id, record.matchState),
        kind: 'unregistered',
        subject: record.id,
        label:
          [record.deviceName, record.serialNo].filter(Boolean).join(' / ') ||
          record.id,
      });
    return { byOwner, shared };
  };

  /** The items a run is for, worked out again when it runs. */
  const itemsOf = async (run: AgentRun): Promise<FollowUpItem[]> => {
    const { byOwner, shared } = await pending();
    if (run.subjectId.startsWith('owner:'))
      return byOwner.get(run.subjectId.slice('owner:'.length)) ?? [];
    return shared;
  };

  /** Siblings of a shared suggestion go once one of them is decided. */
  const settleShared = async (run: AgentRun) => {
    if (!run.subjectId.startsWith('shared:')) return;
    const open = await runs().list(AGENT, {
      since: new Date(Date.now() - 7 * 86_400_000),
      statuses: ['running', 'pending', 'failed'],
      limit: 200,
    });
    for (const other of open)
      if (other.id !== run.id && other.subjectId.startsWith('shared:'))
        await runs().supersede(AGENT, other.subjectType, other.subjectId);
  };

  const words = (zhText: string, enText: string) => (zh() ? zhText : enText);

  /**
   * A run for one person, replacing their suggestion still waiting; worked
   * out by the model on the queue, or here and now from given answers.
   */
  const begin = async (
    trigger: 'synced' | 'asked',
    by: string | null,
    subjectId: string,
    deciderId: string,
    answers?: { readonly answerer: FollowUpAnswerer; readonly locale: string },
  ): Promise<AgentRun> => {
    const run = await runs().start({
      agent: AGENT,
      trigger,
      startedById: by,
      subjectType: SUBJECT,
      subjectId,
      deciderId,
    });
    if (!answers) {
      await enqueue(run.id);
      return run;
    }
    answering = answers.locale;
    try {
      await work(run.id, async (material) => ({
        decisions: answers.answerer(material),
        model: null,
      }));
    } finally {
      answering = undefined;
    }
    return run;
  };

  const service: DeviceSyncFollowUp = {
    useJobs(next) {
      dispatch = next;
    },

    async afterSync(by, answers) {
      if (!(await agentOn(database(), AGENT, 'synced'))) return [];
      if (!(await review().active())) return [];
      const { byOwner, shared } = await pending();
      const started: AgentRun[] = [];
      const start = async (subjectId: string, deciderId: string) => {
        started.push(await begin('synced', by, subjectId, deciderId, answers));
      };
      for (const [owner, items] of byOwner)
        if (items.length) await start(`owner:${owner}`, owner);
      if (shared.length)
        for (const manager of await assetManagers())
          await start(`shared:${manager}`, manager);
      return started;
    },

    async ask(by) {
      if (!(await review().active())) return [];
      const { byOwner, shared } = await pending();
      const started: AgentRun[] = [];
      if (byOwner.get(by)?.length)
        started.push(await begin('asked', by, `owner:${by}`, by));
      // The shared part is every asset manager's (2026-10-22): asked by one,
      // it is worked out again for them all, as after a pull, so nobody
      // keeps a copy the asker's replaced or one closed with no successor.
      const managers = await assetManagers();
      if (shared.length && managers.includes(by))
        for (const manager of managers) {
          const run = await begin('asked', by, `shared:${manager}`, manager);
          if (manager === by) started.push(run);
        }
      return started;
    },

    async others(reader) {
      if (!(await assetManagers()).includes(reader)) return [];
      const open = (
        await runs().list(AGENT, {
          since: new Date(Date.now() - HANDLED_DAYS * 86_400_000),
          statuses: ['running', 'pending', 'failed'],
          limit: 200,
        })
      ).filter(
        (run) =>
          run.subjectId.startsWith('owner:') &&
          run.deciderId !== null &&
          run.deciderId !== reader,
      );
      const result: OtherFollowUp[] = [];
      for (const run of open) {
        const planId = asText(run.result?.planId);
        const plan = planId
          ? await database()
              .query()
              .selectFrom('itamPlans')
              .select(['status'])
              .where('id', '=', planId)
              .executeTakeFirst<{ status: unknown }>()
          : undefined;
        const steps =
          planId && plan?.status === 'pending'
            ? await database()
                .query()
                .selectFrom('itamPlanSteps')
                .select(['params'])
                .where('planId', '=', planId)
                .orderBy('position', 'asc')
                .execute<{ params: unknown }>()
            : [];
        result.push({
          id: run.id,
          deciderId: String(run.deciderId),
          status: run.status,
          failure: run.failure,
          createdAt: run.createdAt,
          items: (run.result?.items ?? []) as FollowUpItem[],
          summary: asText(run.result?.summary) ?? '',
          notes: (run.result?.notes ?? []) as string[],
          steps: steps.flatMap((step) => {
            const params = (
              typeof step.params === 'string'
                ? JSON.parse(step.params)
                : step.params
            ) as { title?: unknown } | null;
            const title = asText(params?.title);
            return title ? [title] : [];
          }),
        });
      }
      return result;
    },

    runEntry: (runId, signal) => work(runId, askModel, signal),

    async planDecided({ plan, decision }) {
      if (!plan.runId) return;
      const run = await runs().get(plan.runId);
      if (!run || run.agent !== AGENT || run.status !== 'pending') return;
      await runs().decide(run.id, {
        status: decision === 'voided' ? 'dismissed' : 'accepted',
        decidedById: plan.proposerUserId,
        decision,
      });
      await settleShared(run);
    },

    async dismiss(runId, actorId, options = {}) {
      const run = await runs().get(runId);
      if (!run || run.agent !== AGENT)
        throw new RecordNotFoundError('itamAgentRuns', runId);
      if (run.deciderId !== actorId)
        throw new BusinessRuleError(
          'Only the person it was made for decides on it',
          'NOT_DECIDER',
        );
      // Settled only when MDM 核对 no longer lists anything its plan was
      // to do (2026-10-22): a page with stale lists closed a new import's
      // follow-up the moment it appeared.
      if (options.settled) {
        const listed = new Set([
          ...(await review().checks()).map(
            (check) => `${check.deviceId}|${check.kind}`,
          ),
          ...(await review().unregistered()).map(
            (record) => `${record.id}|unregistered`,
          ),
          ...(await review().unmanaged()).map(
            (device) => `${device.id}|unmanaged`,
          ),
        ]);
        const advice = (run.result?.advice ?? []) as FollowUpAdvice[];
        if (
          advice.some(
            (entry) =>
              (entry.steps?.length ?? 0) > 0 &&
              listed.has(`${entry.subject}|${entry.kind}`),
          )
        )
          throw new BusinessRuleError(
            'Some of what it suggests is still to be settled',
            'SUGGESTION_NOT_SETTLED',
          );
      }
      if (
        !(await runs().decide(run.id, {
          status: options.settled ? 'accepted' : 'dismissed',
          decidedById: actorId,
          ...(options.settled ? { decision: 'settled' } : {}),
        }))
      )
        throw new BusinessRuleError(
          'The suggestion is no longer waiting',
          'SUGGESTION_DECIDED',
        );
      // Its plan goes with it, so it is not carried out from elsewhere.
      const planId = asText(run.result?.planId);
      if (planId) {
        const plans = container.resolve(planServiceToken);
        const plan = await plans.get(actorId, planId).catch(() => null);
        if (plan?.status === 'pending')
          await plans
            .void(actorId, planId, plan.revision)
            .catch(() => undefined);
      }
      await settleShared(run);
      return (await runs().get(run.id)) ?? run;
    },
  };

  /** A run's work, with whoever answers for its items. */
  const work = async (
    runId: string,
    ask: Ask,
    signal?: AbortSignal,
  ): Promise<void> => {
    const run = await runs().get(runId);
    if (!run || run.status !== 'running' || run.agent !== AGENT) return;
    const fail = (failure: RunFailure, model?: string | null) =>
      runs().finish(runId, { status: 'failed', failure }, model);
    if (!run.deciderId) {
      await fail('notFound');
      return;
    }
    await runs().markStarted(runId, true);
    let model: string | null = null;
    try {
      const items = (await itemsOf(run)).slice(0, 40);
      if (!items.length) {
        await runs().finish(runId, {
          status: 'pending',
          result: {
            items: [],
            planId: null,
            notes: [],
            summary: words('没有新的差异要处理。', 'Nothing new to settle.'),
          },
        });
        return;
      }
      // What Asset Steward's commands would show the person, one entry
      // per item under a short ref the answer names it by.
      const reader = readerFor(container, run.deciderId);
      const refs = new Map(
        items.map((item, at) => [`i${String(at + 1)}`, item]),
      );
      const listed = async (view: 'unmanaged' | 'unregistered') => {
        const wanted = new Set(
          items
            .filter((item) => item.kind === view)
            .map((item) => item.subject),
        );
        if (!wanted.size) return new Map<string, Row>();
        const rows = (await deviceSyncReview(reader, { view })).rows as Row[];
        return new Map(
          rows
            .filter((row) => wanted.has(String(row.id)))
            .map((row) => [String(row.id), row]),
        );
      };
      const [unmanaged, unregistered] = await Promise.all([
        listed('unmanaged'),
        listed('unregistered'),
      ]);
      const material: Record<string, unknown>[] = [];
      for (const [ref, item] of refs) {
        if (item.kind === 'unmanaged' || item.kind === 'unregistered') {
          const row = (
            item.kind === 'unmanaged' ? unmanaged : unregistered
          ).get(item.subject);
          if (row) material.push({ ref, kind: item.kind, ...row });
          continue;
        }
        const found = await deviceSyncReview(reader, {
          view: 'checks',
          deviceId: item.subject,
        }).catch(() => null);
        if (!found) continue;
        material.push({
          ref,
          kind: item.kind,
          device: found.device,
          platformRecords: found.platformRecords,
          difference: ((found.differences ?? []) as Row[]).find(
            (difference) => difference.kind === item.kind,
          ),
        });
      }
      const records = [...unregistered.values()];
      const answer = await ask(material, signal);
      model = answer.model;
      if ('failure' in answer) {
        await fail(answer.failure, model);
        return;
      }
      const result = await proposal(run, refs, records, answer.decisions);
      await runs().finish(
        runId,
        { status: 'pending', result: { ...result } },
        model,
      );
    } catch (error) {
      if (signal?.aborted) {
        await runs().markStarted(runId, false);
        throw new JobInterruptedError();
      }
      dependencies.warn?.({ err: error }, 'MDM follow-up failed');
      await fail(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timedOut'
          : 'failed',
        model,
      );
    }
  };

  /** Asset Steward decides, with its `device-sync` method. */
  const askModel: Ask = async (material, signal) => {
    const prompt = [
      `The pull from the device platforms left these items on MDM 核对. Following your method, decide each one by its \`ref\` (\`item\`), or say why a person must look first. Allowed per kind — stale: correct, keep, verify, escalate; userMismatch: transfer, assign, keep, verify, escalate; statusMismatch: correct, keep, verify, escalate; unmanaged: exempt, verify, escalate; unregistered: register, link, ignore, verify.`,
      "What each does: register — put the platform record on the register (modelId: the register model it is, from suggestedModelId or the candidates; the device goes to its platform user when it has one); link — it is the register device `target` (a candidate id, or one of its sameNameDevices: a register device of the same name under another serial is most likely this one with a new board or a mistyped serial — link it, never register a duplicate); ignore — keep the record off the register (not a company asset); transfer / assign — the device goes to the person `target` (the platform user's personId); correct — set the device's register status to `status` (inStock, inUse, onLoan, inRepair or retired — never lost: a person finds that out); keep — the register is right, ignore this difference; exempt — the device rightly is on no platform; verify — a person must check first (say what); escalate — the platform's administrator must act (say what).",
      `Every decision has a \`reason\`: one short sentence in ${zh() ? 'Chinese' : 'English'} with the fact it rests on (the platform user, the serial, the last sync, a matching device), never an id. Propose a change only where the evidence is clear; otherwise verify.`,
      `<items>\n${JSON.stringify(material)}\n</items>`,
      `Return only one JSON object matching this JSON Schema:\n${shapeOf(DECIDED)}`,
    ].join('\n\n');
    const settings = container.resolve(settingsServiceToken);
    const [general, ai] = await Promise.all([
      settings.get('general'),
      settings.get('ai'),
    ]);
    const skill = await readSkill(container, 'device-sync');
    const session = await openSession(container, {
      timeZone: general.timeZone,
      system: [
        skill ? `# Method\n\n${skill}` : '',
        ai.businessNotes
          ? `The organisation's notes for the AI:\n${ai.businessNotes}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      work: AGENT,
    });
    if (!session) return { failure: 'unavailable', model: null };
    const model = `${session.model.modelService}/${session.model.model}`;
    const turn = signal
      ? AbortSignal.any([AbortSignal.timeout(TURN_MS), signal])
      : AbortSignal.timeout(TURN_MS);
    const answer = await session.askJson(prompt, DECIDED, turn);
    if (!answer) return { failure: 'unreadable', model };
    return { decisions: answer.decisions, model };
  };

  /** Where a registered device is kept: where its user sits, or nowhere. */
  const locationFor = async (
    personId: string | undefined,
  ): Promise<{ id: string; name: string } | undefined> => {
    if (!personId) return undefined;
    const row = await database()
      .query()
      .selectFrom('people')
      .innerJoin('locations', 'locations.id', 'people.locationId')
      .select(['locations.id as id', 'locations.path as path'])
      .where('people.id', '=', personId)
      .executeTakeFirst<{ id: unknown; path: unknown }>();
    // Where the primary user sits, and nowhere else (2026-10-22): the place
    // most devices are kept was a guess the plan did not show.
    const id = asText(row?.id);
    if (!id) return undefined;
    // Named by its whole path, 上海总部 › 3 楼, as the pickers show it.
    const ids = (asText(row?.path) ?? `/${id}/`).split('/').filter(Boolean);
    const names = new Map(
      (
        await database()
          .query()
          .selectFrom('locations')
          .select(['id', 'name'])
          .where('id', 'in', ids)
          .execute<{ id: unknown; name: unknown }>()
      ).map((entry) => [String(entry.id), asText(entry.name) ?? '']),
    );
    return {
      id,
      name: ids.map((part) => names.get(part) ?? part).join(' › '),
    };
  };

  /** The decisions as a plan the person carries out, the rest as notes. */
  const proposal = async (
    run: AgentRun,
    refs: ReadonlyMap<string, FollowUpItem>,
    records: readonly Row[],
    decisions: readonly Decision[],
  ): Promise<FollowUpResult> => {
    const items = [...refs.values()];
    const notes: string[] = [];
    type Step = {
      op: string;
      ref?: string;
      params: Record<string, unknown>;
      item: FollowUpItem;
    };
    let steps: Step[] = [];
    const decided = new Set<string>();
    const advised: Omit<FollowUpAdvice, 'planned'>[] = [];
    for (const decision of decisions) {
      const item = refs.get(decision.item);
      if (!item || decided.has(item.key)) continue;
      decided.add(item.key);
      const target = asText(decision.target);
      const why = asText(decision.reason)?.trim().slice(0, 200);
      advised.push({
        subject: item.subject,
        kind: item.kind,
        action: decision.action,
        reason: why || null,
        target: target || null,
      });
      // The step's line says what it does to what, and why.
      const label = why
        ? zh()
          ? `${item.label}（${why}）`
          : `${item.label} (${why})`
        : item.label;
      const note = (zhText: string, enText: string) =>
        notes.push(words(`${label}：${zhText}`, `${label}: ${enText}`));
      if (!ALLOWED[item.kind].includes(decision.action)) {
        note('请先核实再处理', 'check before anything changes');
        continue;
      }
      const step = (
        op: string,
        params: Record<string, unknown>,
        ref?: string,
      ) => steps.push({ op, params, item, ...(ref ? { ref } : {}) });
      switch (decision.action) {
        case 'transfer':
        case 'assign':
          if (!target) {
            note('请先核实再处理', 'check before anything changes');
            break;
          }
          step(
            decision.action === 'transfer'
              ? 'transfer_device'
              : 'assign_device',
            {
              title: words(
                `把 ${label} 交给 MDM 上的使用人`,
                `Hand ${label} to its platform user`,
              ),
              deviceId: item.subject,
              targetType: 'person',
              targetId: target,
            },
          );
          break;
        case 'link':
          if (!target) {
            note('请先核实再处理', 'check before anything changes');
            break;
          }
          step('link_managed_device', {
            title: words(
              `把 MDM 记录 ${label} 关联到台账设备`,
              `Link the platform record ${label} to its register device`,
            ),
            managedDeviceId: item.subject,
            deviceId: target,
          });
          break;
        case 'ignore':
          step('ignore_managed_device', {
            title: words(
              `不纳入台账：${label}`,
              `Keep ${label} off the register`,
            ),
            managedDeviceId: item.subject,
            reason:
              why ??
              words(
                'MDM 差异跟进建议不纳入台账',
                'MDM difference follow-up: not an asset to register',
              ),
          });
          break;
        case 'register': {
          const record = records.find((row) => String(row.id) === item.subject);
          const modelId =
            asText(decision.modelId) ?? asText(record?.suggestedModelId);
          const personId = asText(record?.personId);
          const place = await locationFor(personId);
          if (!record || !modelId) {
            note(
              '需要登记为新设备，但型号对不上，请在 MDM 核对页补登记',
              'register it as a new device on MDM 核对: its model could not be matched',
            );
            break;
          }
          // No guessed place (2026-10-22): the person picks it there.
          if (!place) {
            note(
              '需要登记为新设备，但主用户没有登记位置，请在 MDM 核对页补登记并选择存放位置',
              'register it as a new device on MDM 核对 and choose where it is kept: its primary user has no location',
            );
            break;
          }
          // Registered and handed to its platform user in one step, as
          // the create dialog's 使用中 does (2026-10-21).
          const user = asText(record.userName);
          step('create_record', {
            // Where it will be kept, said outright (2026-10-22).
            title: words(
              `登记新设备并分配给${user ?? 'MDM 上的使用人'}，存放在 ${place.name}：${label}`,
              `Register ${label}, kept at ${place.name}, and assign it to ${user ?? 'its platform user'}`,
            ),
            collection: 'devices',
            input: {
              modelId,
              serialNo: asText(record.serialNo) ?? null,
              name: asText(record.deviceName) ?? null,
              locationId: place.id,
              ownership: 'owned',
              ...(asText(record.suggestedDepartmentId)
                ? { departmentId: asText(record.suggestedDepartmentId) }
                : {}),
              ...(personId
                ? { assignTo: { targetType: 'person', targetId: personId } }
                : {}),
            },
          });
          break;
        }
        case 'correct': {
          const status = CORRECT_TO.find((value) => value === decision.status);
          if (!status) {
            note('请先核实再处理', 'check before anything changes');
            break;
          }
          step('correct_device_status', {
            title: words(
              `更正 ${label} 的状态`,
              `Correct the status of ${label}`,
            ),
            deviceId: item.subject,
            status,
            reason:
              why ??
              words(
                'MDM 差异跟进建议更正状态',
                'MDM difference follow-up: correct the status',
              ),
          });
          break;
        }
        case 'keep':
          if (item.kind === 'unmanaged' || item.kind === 'unregistered') {
            note('请先核实再处理', 'check before anything changes');
            break;
          }
          step('dismiss_device_difference', {
            title: words(
              `以台账为准，忽略这处差异：${label}`,
              `The register is right; ignore the difference: ${label}`,
            ),
            deviceId: item.subject,
            kind: item.kind,
          });
          break;
        case 'exempt':
          step('exempt_device', {
            title: words(`不需要纳管：${label}`, `Needs no platform: ${label}`),
            deviceId: item.subject,
            reason:
              why ??
              words(
                'MDM 差异跟进建议不需要纳管',
                'MDM difference follow-up: needs no platform',
              ),
          });
          break;
        case 'escalate':
          note(
            '需要平台管理员在 MDM 里处理',
            "the platform's administrator must act",
          );
          break;
        default:
          note(
            item.kind === 'unmanaged'
              ? '需要在 MDM 平台里注册这台设备'
              : '请先核实再处理',
            item.kind === 'unmanaged'
              ? 'enrol it on the device platform'
              : 'check before anything changes',
          );
      }
    }
    for (const item of items)
      if (!decided.has(item.key))
        notes.push(
          words(
            `${item.label}：资产管家没有给出处理，请到 MDM 核对页查看`,
            `${item.label}: no suggestion; see MDM 核对`,
          ),
        );
    steps = steps.slice(0, 30);
    let planId: string | null = null;
    // A step the person may not take, or that no longer applies, is
    // refused when proposed: its item becomes a note (with any step that
    // follows from it) and the rest are proposed.
    while (steps.length && run.deciderId) {
      try {
        const plan = await container.resolve(planServiceToken).create(
          run.deciderId,
          {
            title: words(
              `MDM 差异跟进：${String(items.length)} 处差异`,
              `MDM difference follow-up: ${String(items.length)} differences`,
            ),
            steps: steps.map((entry) => ({
              op: entry.op,
              ...(entry.ref ? { ref: entry.ref } : {}),
              params: entry.params,
            })),
          },
          {
            // No agent of the plugin's does the work (Agents plugin 1.0).
            agentId: null,
            agentName: WORK_AGENTS[AGENT].name,
            runId: run.id,
            conversationId: null,
          },
        );
        planId = plan.id;
        break;
      } catch (error) {
        const at =
          error instanceof PlanError
            ? Number(/^steps\.(\d+)/.exec(error.field ?? '')?.[1])
            : NaN;
        if (!Number.isInteger(at) || at < 1 || at > steps.length) throw error;
        const dropped = steps[at - 1].item;
        steps = steps.filter((entry) => entry.item.key !== dropped.key);
        notes.push(
          words(
            `${dropped.label}：建议的操作现在做不了，请到 MDM 核对页查看`,
            `${dropped.label}: the suggested step cannot be taken now; see MDM 核对`,
          ),
        );
      }
    }
    const plannedKeys = new Set(steps.map((entry) => entry.item.key));
    const planned = plannedKeys.size;
    // A step's position is its place in the plan, from 1.
    const positionsOf = (subject: string, kind: FollowUpKind) =>
      planId
        ? steps.flatMap((entry, index) =>
            entry.item.subject === subject && entry.item.kind === kind
              ? [index + 1]
              : [],
          )
        : [];
    return {
      items,
      planId,
      notes: notes.slice(0, 60),
      advice: advised.map((entry) => {
        const positions = positionsOf(entry.subject, entry.kind);
        return { ...entry, planned: positions.length > 0, steps: positions };
      }),
      summary: words(
        `${String(items.length)} 处差异：${String(planned)} 项可直接执行，${String(items.length - planned)} 项需要你看一下。`,
        `${String(items.length)} differences: ${String(planned)} can be carried out, ${String(items.length - planned)} need a look.`,
      ),
    };
  };

  return service;
}
