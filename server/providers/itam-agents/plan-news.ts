import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseManager } from '@nocobase/db';

import type { PlanOutcome } from '../itam/plans.js';

/**
 * How a plan's decision reaches the conversation it came from: a notice the
 * person sees in the conversation, and an input that wakes the agent with
 * what became of its plan, so it can carry on or propose again.
 */
export function deliverPlanOutcome(
  agents: Agents,
  database: () => DatabaseManager,
): (outcome: PlanOutcome) => Promise<void> {
  return async ({ plan, decision }) => {
    const conversationId = plan.conversationId;
    if (!conversationId) return;
    const decider = plan.deciderUserId ?? plan.proposerUserId;
    const user = await database()
      .query()
      .selectFrom('user')
      .select(['name'])
      .where('id', '=', decider)
      .executeTakeFirst<{ name: unknown }>();
    const done = plan.steps.filter((step) => step.status === 'done').length;
    const failure = plan.failure;
    const text =
      decision === 'executed'
        ? `The person confirmed plan "${plan.title}": ${String(done)} of ${String(plan.steps.length)} steps were carried out.`
        : decision === 'voided'
          ? `The person declined plan "${plan.title}"; nothing was changed.`
          : `Plan "${plan.title}" stopped at step ${String(failure?.position)} (${failure?.code ?? 'error'}: ${failure?.message ?? ''}); ${String(done)} step(s) before it were carried out, the rest were not.`;
    await agents.tx.run((tx) =>
      agents.conversations.deliver(tx, conversationId, {
        notice: {
          code: 'news',
          type: 'planDecided',
          title: plan.title,
          params: { planId: plan.id, decision },
        },
        input: {
          type: 'planDecided',
          actor: {
            kind: 'user',
            id: decider,
            name: typeof user?.name === 'string' ? user.name : '',
          },
          text,
          payload: { planId: plan.id, decision, failure },
        },
      }),
    );
  };
}
