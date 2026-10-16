import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { type ZodType } from 'zod';

import { WORK_AGENTS, workAgentIds } from '../itam-agents/work-agents.js';
import {
  agentRunServiceToken,
  type AgentName,
  type AgentRun,
  type RunFailure,
} from './agent-runs.js';
import { jsonIn, openSession, shapeOf } from './ai-model.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';
import { planServiceToken, type PlanView } from './plans.js';
import { settingsServiceToken } from './settings.js';

/**
 * What the work agents that only suggest share (2026-10-17, plan "Work
 * agents", step 2: 授权续费). A run's result is a
 * `Suggestion`: a one-line summary, the changes it proposes — each one plan
 * step, with what the card shows of it — and what it cannot change
 * (notes) or worries about (risks). Accepting turns the changes the decider
 * kept into an ordinary plan (`itamPlans`), proposed and carried out at once
 * as the decider, each step checked by the same screens as a plan Noco
 * proposes; the run names the plan, whose steps then say what was done and
 * what was refused. The card's ticks are the confirmation, so the plan is
 * not confirmed a second time.
 */

/** One change a suggestion proposes: a plan step, and how the card names it. */
export interface SuggestedChange {
  /** The plan operation (`PLAN_OPS`) and its parameters, title aside. */
  readonly op: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** What it acts on and what it does, for the card's line. */
  readonly kind: 'seat' | 'entitlement';
  readonly action:
    'reclaim' | 'adjustSeats' | 'stopAutoRenew' | 'startAutoRenew';
  /** The thing's own label (the entitlement, a seat's holder). */
  readonly subject: string;
  /** The seat count it sets. */
  readonly quantity?: number | null;
  readonly reason: string;
}

export interface Suggestion {
  /** The plan's title once accepted, in the deployment's language. */
  readonly title: string;
  readonly summary: string;
  readonly changes: readonly SuggestedChange[];
  /** What it leaves to people: a contract to check, an account to close. */
  readonly notes: readonly string[];
  readonly risks: readonly string[];
  /** What else an agent says (授权续费's recommendation, seats, saving). */
  readonly [key: string]: unknown;
}

/** How long one model turn of a background run may take. */
export const TURN_MS = 8 * 60_000;

/** One ask of a work agent's model: its answer in `shape`, or why there is none. */
export async function askAgent<T>(
  container: ServiceContainer,
  input: {
    readonly work: AgentName;
    readonly prompt: string;
    readonly shape: ZodType<T>;
    readonly signal?: AbortSignal;
  },
): Promise<
  | { readonly ok: true; readonly data: T; readonly model: string }
  | {
      readonly ok: false;
      readonly failure: RunFailure;
      readonly model: string | null;
    }
> {
  const settings = container.resolve(settingsServiceToken);
  const [general, ai] = await Promise.all([
    settings.get('general'),
    settings.get('ai'),
  ]);
  const session = await openSession(container, {
    timeZone: general.timeZone,
    system: ai.businessNotes
      ? `The organisation's notes for the AI:\n${ai.businessNotes}`
      : '',
    work: input.work,
  });
  if (!session) return { ok: false, failure: 'unavailable', model: null };
  const model = `${session.model.modelService}/${session.model.model}`;
  const turn = input.signal
    ? AbortSignal.any([AbortSignal.timeout(TURN_MS), input.signal])
    : AbortSignal.timeout(TURN_MS);
  let parsed = input.shape.safeParse(
    jsonIn(await session.ask(input.prompt, turn)),
  );
  if (!parsed.success)
    parsed = input.shape.safeParse(
      jsonIn(
        await session.ask(
          `The previous reply was not in the required format. Keeping the same conclusion, return only one JSON object and nothing else, matching this JSON Schema:\n${shapeOf(input.shape)}`,
          turn,
        ),
      ),
    );
  return parsed.success
    ? { ok: true, data: parsed.data, model }
    : { ok: false, failure: 'unreadable', model };
}

/** Why a run gave no result, from what was thrown. */
export function failureOf(error: unknown): RunFailure {
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'timedOut';
  if (error instanceof Error && error.name === 'ModelError') {
    const code = (error as Error & { code?: unknown }).code;
    if (code === 'config' || code === 'auth') return 'unavailable';
  }
  return 'failed';
}

export interface SuggestionDecisions {
  /**
   * Carries out the changes the decider kept (`keep`, indexes into the
   * suggestion's changes) as a plan, the run accepted and naming it. A
   * suggestion that changes nothing (renew as it is) is simply agreed to,
   * with no plan.
   */
  accept(
    runId: string,
    actorId: string,
    keep: readonly number[],
  ): Promise<{ readonly run: AgentRun; readonly plan: PlanView | null }>;
  /** The decider sets it aside; nothing changes. */
  dismiss(runId: string, actorId: string): Promise<AgentRun>;
  /** The plan an accepted suggestion became, as its decider sees it. */
  planOf(run: AgentRun, actorId: string): Promise<PlanView | null>;
}

export const suggestionDecisionsToken: ServiceToken<SuggestionDecisions> =
  createServiceToken<SuggestionDecisions>('itam/suggestion-decisions');

/** The agents whose results are suggestions accepted as plans. */
export const SUGGESTING: ReadonlySet<AgentName> = new Set(['renewalReview']);

export function createSuggestionDecisions(
  container: ServiceContainer,
  /** The deployment's language, which the plan's step titles are written in. */
  locale: () => string = () => 'en-US',
): SuggestionDecisions {
  const runs = () => container.resolve(agentRunServiceToken);
  const plans = () => container.resolve(planServiceToken);

  const waiting = async (runId: string, actorId: string) => {
    const run = await runs().get(runId);
    if (!run || !SUGGESTING.has(run.agent))
      throw new RecordNotFoundError('itamAgentRuns', runId);
    if (run.deciderId !== actorId)
      throw new BusinessRuleError(
        'Only the person it was made for decides on it',
        'NOT_DECIDER',
      );
    if (run.status !== 'pending' || !run.result)
      throw new BusinessRuleError(
        'The suggestion is no longer waiting',
        'SUGGESTION_DECIDED',
      );
    return run;
  };

  return {
    async accept(runId, actorId, keep) {
      const run = await waiting(runId, actorId);
      const suggestion = run.result as unknown as Suggestion;
      const kept = [...new Set(keep)]
        .filter((index) => index >= 0 && index < suggestion.changes.length)
        .sort((a, b) => a - b)
        .map((index) => suggestion.changes[index]);
      if (!suggestion.changes.length) {
        if (
          !(await runs().decide(run.id, {
            status: 'accepted',
            decidedById: actorId,
            decision: 'accepted',
          }))
        )
          throw new BusinessRuleError(
            'The suggestion is no longer waiting',
            'SUGGESTION_DECIDED',
          );
        return { run: (await runs().get(run.id)) ?? run, plan: null };
      }
      if (!kept.length)
        throw new BusinessRuleError(
          'Keep at least one change, or dismiss it',
          'NOTHING_KEPT',
        );
      const agentId =
        (await workAgentIds(container.resolve(databaseManagerToken)))[
          run.agent
        ] ?? null;
      // Proposed as the decider, so every step is screened under their
      // grants before anything runs; a step they may not do refuses the
      // whole plan here and the suggestion stays waiting.
      const plan = await plans().create(
        actorId,
        {
          title: suggestion.title,
          summary: suggestion.summary,
          steps: kept.map((change) => ({
            op: change.op,
            params: { title: stepTitle(change, locale()), ...change.params },
          })),
        },
        {
          agentId,
          agentName: WORK_AGENTS[run.agent].name,
          runId: run.id,
          conversationId: null,
        },
      );
      if (
        !(await runs().decide(run.id, {
          status: 'accepted',
          decidedById: actorId,
          decision: 'accepted',
          comment:
            kept.length < suggestion.changes.length
              ? `${kept.length}/${suggestion.changes.length}`
              : null,
        }))
      )
        throw new BusinessRuleError(
          'The suggestion is no longer waiting',
          'SUGGESTION_DECIDED',
        );
      await runs().setPlan(run.id, plan.id);
      // Carried out at once: the card's ticks were the confirmation. A step
      // that fails stops the rest, as for any plan; the plan says which.
      const done = await plans()
        .execute(actorId, plan.id, { revision: plan.revision })
        .catch(() => plans().get(actorId, plan.id));
      return { run: (await runs().get(run.id)) ?? run, plan: done };
    },

    async dismiss(runId, actorId) {
      const run = await waiting(runId, actorId);
      await runs().decide(run.id, {
        status: 'dismissed',
        decidedById: actorId,
      });
      return (await runs().get(run.id)) ?? run;
    },

    async planOf(run, actorId) {
      if (!run.planId || run.deciderId !== actorId) return null;
      return plans()
        .get(actorId, run.planId)
        .catch(() => null);
    },
  };
}

const STEP_WORDS: Readonly<
  Record<'zh' | 'en', Readonly<Record<SuggestedChange['action'], string>>>
> = {
  zh: {
    reclaim: '收回席位',
    adjustSeats: '调整席位数',
    stopAutoRenew: '关闭自动续费',
    startAutoRenew: '打开自动续费',
  },
  en: {
    reclaim: 'Reclaim the seat',
    adjustSeats: 'Set the seat count',
    stopAutoRenew: 'Turn off auto-renewal',
    startAutoRenew: 'Turn on auto-renewal',
  },
};

/**
 * A step's title on the plan, in the deployment's language as everything
 * written into a record is: what it does to what.
 */
function stepTitle(change: SuggestedChange, locale: string): string {
  const word = STEP_WORDS[locale.startsWith('zh') ? 'zh' : 'en'][change.action];
  const quantity =
    change.quantity !== null && change.quantity !== undefined
      ? ` → ${String(change.quantity)}`
      : '';
  return `${word}: ${change.subject}${quantity}`.slice(0, 200);
}
