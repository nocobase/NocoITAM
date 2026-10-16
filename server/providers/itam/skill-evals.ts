import { z } from 'zod';

import type { ModelSession } from './ai-model.js';
import { reviewPrompt, reviewShape } from './approval-review.js';
import { APPROVAL_REVIEW_EVALS } from './evals/approval-review.js';
import { DEVICE_SYNC_EVALS } from './evals/device-sync.js';

/**
 * Eval sets for ITAM's method skills (device sync, step 4, 2026-10-15; the
 * first one): situations with the answer a person who knows the method
 * would give, run against the model Asset Steward answers with before a skill, its
 * instructions or the model change (NocoSolution guideline 1.3 and 3.5).
 *
 * A case asks for decisions, not for a plan: what the skill teaches is the
 * judgement — transfer or keep the register, register or keep off, which
 * candidate — and that is what is scored. The plan's format is checked by
 * `plan create` itself.
 */

/** What may be decided about one item. */
export const EVAL_ACTIONS = [
  // A plan step on the register.
  'transfer',
  'assign',
  'register',
  'link',
  'ignore',
  // The person's own button or finding, not a plan step.
  'restore',
  'keep',
  'verify',
  // Outside the register: the platform's administrator must act.
  'escalate',
] as const;
export type EvalAction = (typeof EVAL_ACTIONS)[number];

export interface EvalDecision {
  /** The id of the item in the case's data the decision is about. */
  readonly subject: string;
  readonly action: EvalAction;
  /** The person or device it goes to, where the action has one. */
  readonly target?: string | null;
}

export interface EvalCase {
  readonly id: string;
  readonly title: string;
  /** What the person asks, as they would. */
  readonly question: string;
  /** What the commands would show, as the model would read it. */
  readonly data: Readonly<Record<string, unknown>>;
  /** The standard answer: one decision per item that needs one. */
  readonly expect: readonly EvalDecision[];
}

export interface EvalCaseResult {
  readonly id: string;
  readonly title: string;
  readonly passed: boolean;
  /** The standard answer: decisions, or the recommendations that pass (审批审阅). */
  readonly expected: readonly EvalDecision[] | readonly string[];
  /** What the model decided; null when it gave no usable answer. */
  readonly got: readonly EvalDecision[] | readonly string[] | null;
  /** The decisions that did not match, by subject. */
  readonly misses: readonly string[];
}

export interface EvalReport {
  readonly skill: string;
  readonly passed: number;
  readonly total: number;
  readonly cases: readonly EvalCaseResult[];
  readonly ranAt: string;
}

export const SKILL_EVALS: Readonly<Record<string, readonly EvalCase[]>> = {
  'device-sync': DEVICE_SYNC_EVALS,
};

/**
 * Every skill with an eval set: the device-sync decisions above, and
 * 审批审阅's recommendations (2026-10-16), scored on the recommendation
 * alone.
 */
export const EVAL_SKILLS: readonly string[] = [
  ...Object.keys(SKILL_EVALS),
  'approval-review',
];

const DECISIONS = z.object({
  decisions: z
    .array(
      z.object({
        subject: z.string(),
        action: z.enum(EVAL_ACTIONS),
        target: z.string().nullable().optional(),
      }),
    )
    .max(50),
});

/**
 * A case passes when every expected decision is there for its subject with
 * the same action and, where the answer names one, the same target. A
 * decision about an item the answer does not mention is not held against
 * it; one about an expected item that differs is.
 */
export function scoreCase(
  item: EvalCase,
  got: readonly EvalDecision[] | null,
): EvalCaseResult {
  const misses = item.expect
    .filter((expected) => {
      const answer = got?.find((entry) => entry.subject === expected.subject);
      if (!answer || answer.action !== expected.action) return true;
      return Boolean(expected.target) && answer.target !== expected.target;
    })
    .map((expected) => expected.subject);
  return {
    id: item.id,
    title: item.title,
    passed: got !== null && misses.length === 0,
    expected: item.expect,
    got,
    misses,
  };
}

/** The question one case puts to the model. */
export function evalPrompt(item: EvalCase): string {
  return [
    `The person asks: ${item.question}`,
    `This is what the itam commands show:\n${JSON.stringify(item.data, null, 2)}`,
    'Following your method, decide for every item that needs one what you would do: ' +
      'transfer (plan: transfer_device to a person), assign (plan: assign_device to a person), ' +
      'register (plan: create_record of the device, and assign it when it has a user), ' +
      'link (plan: link_managed_device to a register device), ignore (plan: ignore_managed_device), ' +
      'restore (the person restores it to stock on the device page), keep (the person keeps the register as it is), ' +
      'verify (ask the person to check before anything changes), escalate (the platform administrator must act; nothing changes on the register). ' +
      '`subject` is the item’s id (`deviceId` for a difference, `id` for a platform record); `target` is the person or device id it goes to, where there is one.',
  ].join('\n\n');
}

/** Runs one skill's eval set with the given model session per case. */
export async function runEval(options: {
  readonly skill: string;
  /** The skill's text, as Asset Steward reads it. */
  readonly instructions: string;
  readonly open: (system: string) => Promise<ModelSession | null>;
  readonly signal?: AbortSignal;
}): Promise<EvalReport> {
  if (options.skill === 'approval-review') return runReviewEval(options);
  const cases = SKILL_EVALS[options.skill] ?? [];
  const results: EvalCaseResult[] = [];
  for (const item of cases) {
    const session = await options.open(options.instructions);
    if (!session) throw new Error('No model to ask');
    let got: readonly EvalDecision[] | null;
    try {
      const answer = await session.askJson(
        evalPrompt(item),
        DECISIONS,
        options.signal,
      );
      got = answer?.decisions ?? null;
    } catch {
      got = null;
    }
    results.push(scoreCase(item, got));
  }
  return {
    skill: options.skill,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    cases: results,
    ranAt: new Date().toISOString(),
  };
}

/**
 * 审批审阅's eval set: each case asked as a real review asks it
 * (`reviewPrompt`, with the skill's text), passing when the
 * recommendation is one the case accepts.
 */
async function runReviewEval(options: {
  readonly instructions: string;
  readonly open: (system: string) => Promise<ModelSession | null>;
  readonly signal?: AbortSignal;
}): Promise<EvalReport> {
  const results: EvalCaseResult[] = [];
  for (const item of APPROVAL_REVIEW_EVALS) {
    const session = await options.open('');
    if (!session) throw new Error('No model to ask');
    let got: string | null;
    try {
      const answer = await session.askJson(
        reviewPrompt({
          skill: options.instructions,
          subject: item.subject,
          material: item.material,
          currency: 'CNY',
          today: '2026-10-16',
          language: 'Chinese',
          revision: null,
        }),
        reviewShape,
        options.signal,
      );
      got = answer?.recommendation ?? null;
    } catch {
      got = null;
    }
    const passed = got !== null && item.expect.includes(got as never);
    results.push({
      id: item.id,
      title: item.title,
      passed,
      expected: item.expect,
      got: got === null ? null : [got],
      misses: passed ? [] : [item.id],
    });
  }
  return {
    skill: 'approval-review',
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    cases: results,
    ranAt: new Date().toISOString(),
  };
}
