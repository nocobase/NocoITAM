import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { JobInterruptedError } from '@nocobase/jobs';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { deviceSyncReview, readerFor } from '../itam-agents/reads.js';
import { WORK_AGENTS, workAgentIds } from '../itam-agents/work-agents.js';
import {
  agentRunServiceToken,
  type AgentRun,
  type RunFailure,
} from './agent-runs.js';
import { agentOn } from './agent-switches.js';
import { openSession, readSkill } from './ai-model.js';
import { asText, type Row } from './collection-query.js';
import { deviceReviewServiceToken } from './device-review.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';
import { PlanError, planServiceToken, type PlanOutcome } from './plans.js';
import { settingsServiceToken } from './settings.js';
import { DECISIONS, evalPrompt, type EvalDecision } from './skill-evals.js';

/**
 * MDM 跟进 (2026-10-17): after each pull from a device platform, the
 * differences a person has to judge — a device whose platform user is not
 * its holder (使用人不一致), a platform record the register lacks (只在
 * MDM) — are worked out by Asset Steward with its `device-sync` method and
 * left as a plan waiting in 收件箱, for the person who would settle them on
 * MDM 核对. A 使用人不一致 goes to its device's 负责人; 只在 MDM, which has no
 * 负责人, to each holder of the asset manager permission set, the first to
 * decide settling it for all. The rest of MDM 核对 — 失联, 状态不符, 只在台账
 * — is a rule's to show and stays on 待办.
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

export interface FollowUpItem {
  /** The difference: device, kind and the value seen, or a platform record. */
  readonly key: string;
  readonly kind: 'userMismatch' | 'unregistered';
  /** The device (使用人不一致) or the platform record (只在 MDM). */
  readonly subject: string;
  readonly label: string;
}

export interface FollowUpResult {
  readonly items: readonly FollowUpItem[];
  readonly planId: string | null;
  /** What is not a plan step: register it, verify first, ask the admin. */
  readonly notes: readonly string[];
  readonly summary: string;
}

export interface DeviceSyncFollowUp {
  useJobs(dispatch: (runId: string) => Promise<void>): void;
  /** After a pull: a run per person with something new to judge. */
  afterSync(by: string | null): Promise<readonly AgentRun[]>;
  runEntry(runId: string, signal?: AbortSignal): Promise<void>;
  /** A plan decided on its card: the run that proposed it goes with it. */
  planDecided(outcome: PlanOutcome): Promise<void>;
  /** Its person sets it aside (nothing to carry out, or not now). */
  dismiss(runId: string, actorId: string): Promise<AgentRun>;
}

export const deviceSyncFollowUpToken: ServiceToken<DeviceSyncFollowUp> =
  createServiceToken<DeviceSyncFollowUp>('itam/device-sync-followup');

const userKey = (deviceId: string, value: unknown) =>
  `${deviceId}|userMismatch|${asText(value) ?? ''}`;
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
  const zh = () => dependencies.locale().startsWith('zh');
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

  /** What a person carried out or set aside lately: not raised again. */
  const handled = async (): Promise<ReadonlySet<string>> => {
    const decided = await runs().list(AGENT, {
      since: new Date(Date.now() - HANDLED_DAYS * 86_400_000),
      statuses: ['accepted', 'dismissed'],
      limit: 500,
    });
    const keys = new Set<string>();
    for (const run of decided)
      for (const item of (run.result?.items ?? []) as FollowUpItem[])
        if (item && typeof item.key === 'string') keys.add(item.key);
    return keys;
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
    for (const check of await review().checks()) {
      if (check.kind !== 'userMismatch') continue;
      const key = userKey(check.deviceId, check.value);
      if (done.has(key)) continue;
      const item: FollowUpItem = {
        key,
        kind: 'userMismatch',
        subject: check.deviceId,
        label: [check.deviceNo, check.deviceName].filter(Boolean).join(' / '),
      };
      const owner = asText(check.ownerId);
      // A device nobody answers for is the asset managers', as a record
      // the register lacks is.
      if (owner) byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
      else shared.push(item);
    }
    for (const record of await review().unregistered()) {
      const key = recordKey(record.id, record.matchState);
      if (done.has(key)) continue;
      shared.push({
        key,
        kind: 'unregistered',
        subject: record.id,
        label:
          [record.deviceName, record.serialNo].filter(Boolean).join(' / ') ||
          record.id,
      });
    }
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

  const service: DeviceSyncFollowUp = {
    useJobs(next) {
      dispatch = next;
    },

    async afterSync(by) {
      if (!(await agentOn(database(), AGENT, 'synced'))) return [];
      if (!(await review().active())) return [];
      const { byOwner, shared } = await pending();
      const started: AgentRun[] = [];
      const start = async (subjectId: string, deciderId: string) => {
        // Replaces the person's suggestion still waiting from the last pull.
        const run = await runs().start({
          agent: AGENT,
          trigger: 'synced',
          startedById: by,
          subjectType: SUBJECT,
          subjectId,
          deciderId,
        });
        started.push(run);
        await enqueue(run.id);
      };
      for (const [owner, items] of byOwner)
        if (items.length) await start(`owner:${owner}`, owner);
      if (shared.length)
        for (const manager of await assetManagers())
          await start(`shared:${manager}`, manager);
      return started;
    },

    async runEntry(runId, signal) {
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
        // What Asset Steward's commands would show the person.
        const reader = readerFor(container, run.deciderId);
        const differences: unknown[] = [];
        for (const item of items.filter((i) => i.kind === 'userMismatch'))
          differences.push(
            await deviceSyncReview(reader, {
              view: 'checks',
              deviceId: item.subject,
            }).catch(() => null),
          );
        const wanted = new Set(
          items.filter((i) => i.kind === 'unregistered').map((i) => i.subject),
        );
        const unregistered = wanted.size
          ? (
              (await deviceSyncReview(reader, { view: 'unregistered' }))
                .rows as Row[]
            ).filter((row) => wanted.has(String(row.id)))
          : [];
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
        if (!session) {
          await fail('unavailable');
          return;
        }
        model = `${session.model.modelService}/${session.model.model}`;
        const turn = signal
          ? AbortSignal.any([AbortSignal.timeout(TURN_MS), signal])
          : AbortSignal.timeout(TURN_MS);
        const answer = await session.askJson(
          evalPrompt({
            id: run.id,
            title: 'MDM follow-up',
            question: `The nightly pull from the device platforms left these. Following your method, settle each one, or say why a person must look first. Give every decision a \`reason\`: one short sentence in ${zh() ? 'Chinese' : 'English'} with the fact it rests on (the platform user, the serial, the last sync, a matching device), never an id.`,
            data: {
              ...(differences.length
                ? { differences: differences.filter(Boolean) }
                : {}),
              ...(unregistered.length ? { unregistered } : {}),
            },
            expect: [],
          }),
          DECISIONS,
          turn,
        );
        if (!answer) {
          await fail('unreadable', model);
          return;
        }
        const result = await proposal(run, items, answer.decisions);
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
    },

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

    async dismiss(runId, actorId) {
      const run = await runs().get(runId);
      if (!run || run.agent !== AGENT)
        throw new RecordNotFoundError('itamAgentRuns', runId);
      if (run.deciderId !== actorId)
        throw new BusinessRuleError(
          'Only the person it was made for decides on it',
          'NOT_DECIDER',
        );
      if (
        !(await runs().decide(run.id, {
          status: 'dismissed',
          decidedById: actorId,
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

  /** The decisions as a plan the person carries out, the rest as notes. */
  const proposal = async (
    run: AgentRun,
    items: readonly FollowUpItem[],
    decisions: readonly EvalDecision[],
  ): Promise<FollowUpResult> => {
    const bySubject = new Map(items.map((item) => [item.subject, item]));
    const notes: string[] = [];
    let steps: {
      op: string;
      params: Record<string, unknown>;
      item: FollowUpItem;
    }[] = [];
    for (const decision of decisions) {
      const item = bySubject.get(decision.subject);
      if (!item) continue;
      const target = asText(decision.target);
      const why = asText(decision.reason)?.trim().slice(0, 200);
      // The step's line says what it does to what, and why.
      const label = why
        ? zh()
          ? `${item.label}（${why}）`
          : `${item.label} (${why})`
        : item.label;
      switch (decision.action) {
        case 'transfer':
        case 'assign':
          if (item.kind === 'userMismatch' && target)
            steps.push({
              op:
                decision.action === 'transfer'
                  ? 'transfer_device'
                  : 'assign_device',
              params: {
                title: words(
                  `把 ${label} 调拨给 MDM 上的使用人`,
                  `Hand ${label} to its platform user`,
                ),
                deviceId: item.subject,
                targetType: 'person',
                targetId: target,
              },
              item,
            });
          break;
        case 'link':
          if (item.kind === 'unregistered' && target)
            steps.push({
              op: 'link_managed_device',
              params: {
                title: words(
                  `把 MDM 记录 ${label} 关联到台账设备`,
                  `Link the platform record ${label} to its register device`,
                ),
                managedDeviceId: item.subject,
                deviceId: target,
              },
              item,
            });
          break;
        case 'ignore':
          if (item.kind === 'unregistered')
            steps.push({
              op: 'ignore_managed_device',
              params: {
                title: words(
                  `不纳入台账：${label}`,
                  `Keep ${label} off the register`,
                ),
                managedDeviceId: item.subject,
                reason: words(
                  'MDM 跟进建议不纳入台账',
                  'MDM follow-up: not an asset to register',
                ),
              },
              item,
            });
          break;
        case 'register':
          notes.push(
            words(
              `${label}：需要登记为新设备（在 MDM 核对页补登记）`,
              `${label}: register it as a new device (on MDM 核对)`,
            ),
          );
          break;
        case 'keep':
          notes.push(
            words(
              `${label}：以台账为准，可在 MDM 核对页忽略这处差异`,
              `${label}: the register is right; ignore the difference on MDM 核对`,
            ),
          );
          break;
        case 'restore':
          notes.push(
            words(
              `${label}：在设备页恢复状态`,
              `${label}: restore its status on the device page`,
            ),
          );
          break;
        case 'escalate':
          notes.push(
            words(
              `${label}：需要平台管理员在 MDM 里处理`,
              `${label}: the platform's administrator must act`,
            ),
          );
          break;
        default:
          notes.push(
            words(
              `${label}：请先核实再处理`,
              `${label}: check before anything changes`,
            ),
          );
      }
    }
    for (const item of items)
      if (!decisions.some((decision) => decision.subject === item.subject))
        notes.push(
          words(
            `${item.label}：资产管家没有给出处理，请到 MDM 核对页查看`,
            `${item.label}: no suggestion; see MDM 核对`,
          ),
        );
    steps = steps.slice(0, 30);
    let planId: string | null = null;
    const agentId = (await workAgentIds(database()))[AGENT] ?? null;
    // A step the person may not take, or that no longer applies, is
    // refused when proposed: it becomes a note and the rest are proposed.
    while (steps.length && run.deciderId) {
      try {
        const plan = await container.resolve(planServiceToken).create(
          run.deciderId,
          {
            title: words(
              `MDM 跟进：${String(items.length)} 处差异`,
              `MDM follow-up: ${String(items.length)} differences`,
            ),
            steps: steps.map((step) => ({ op: step.op, params: step.params })),
          },
          {
            agentId,
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
        const [dropped] = steps.splice(at - 1, 1);
        if (dropped)
          notes.push(
            words(
              `${dropped.item.label}：建议的操作现在做不了，请到 MDM 核对页查看`,
              `${dropped.item.label}: the suggested step cannot be taken now; see MDM 核对`,
            ),
          );
      }
    }
    const planned = steps.length;
    return {
      items,
      planId,
      notes: notes.slice(0, 40),
      summary: words(
        `${String(items.length)} 处新差异：${String(planned)} 项可直接执行，${String(items.length - planned)} 项需要你看一下。`,
        `${String(items.length)} new differences: ${String(planned)} can be carried out, ${String(items.length - planned)} need a look.`,
      ),
    };
  };

  return service;
}
