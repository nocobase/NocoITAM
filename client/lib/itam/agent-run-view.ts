import type { AgentRun, SuggestedChange } from './agents.js';

/**
 * How a work agent's run reads outside its card (2026-10-17, plan "Work
 * agents", step 2): the page of the record it is about, and the one line
 * the inbox and 智能体工作 list it with.
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

const SUBJECT_ROUTES: Readonly<Record<AgentRun['subjectType'], string>> = {
  purchaseOrders: 'procurement',
  disposals: 'disposals',
  people: 'people',
  entitlements: 'entitlements',
};

/** The page of the record a run is about. */
export function runPath(run: AgentRun): string {
  return `/${SUBJECT_ROUTES[run.subjectType]}/${encodeURIComponent(run.subjectId)}`;
}

/** What the agent is called on a card or a list line. */
export function runAgentLabel(run: AgentRun, t: Translate): string {
  return run.agent === 'approvalReview'
    ? t('review.title')
    : t(`suggestion.agents.${run.agent}`);
}

/** Why a run gave nothing, in words. */
export function runFailure(run: AgentRun, t: Translate): string {
  const group = run.agent === 'approvalReview' ? 'review' : 'suggestion';
  return t(`${group}.failed.${run.failure ?? 'failed'}`, {
    defaultValue: t(`${group}.failed.failed`),
  });
}

/** What a waiting run says, in one line: its verdict and summary. */
export function runVerdict(run: AgentRun, t: Translate): string | null {
  if (!run.result) return null;
  if (run.agent === 'approvalReview')
    return `${t(`review.recommendation.${run.result.recommendation}`)} · ${run.result.summary}`;
  const result = run.result;
  return result.recommendation
    ? `${t(`suggestion.recommendation.${result.recommendation}`)} · ${result.summary}`
    : result.summary;
}

/** One line saying where a run stands. */
export function runLine(run: AgentRun, t: Translate): string {
  if (run.status === 'running')
    return t(
      run.agent === 'approvalReview' ? 'review.working' : 'suggestion.working',
    );
  if (run.status === 'failed') return runFailure(run, t);
  if (run.status === 'accepted')
    return run.agent === 'approvalReview'
      ? t(`review.decided.${run.decision ?? 'approved'}`)
      : t('suggestion.accepted');
  if (run.status === 'dismissed') return t('review.dismissed');
  if (run.status === 'superseded') return t('review.superseded');
  return runVerdict(run, t) ?? '';
}

/** A proposed change as the card lists it: what it does to what. */
export function changeText(change: SuggestedChange, t: Translate): string {
  return t(`suggestion.change.${change.action}`, {
    subject: change.subject,
    target: change.target?.name ?? '',
    status: change.nextStatus
      ? t(`suggestion.nextStatus.${change.nextStatus}`, {
          defaultValue: change.nextStatus,
        })
      : '',
    quantity: change.quantity ?? '',
  });
}
