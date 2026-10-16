import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ApprovalReviewCard } from '../../client/components/itam/ai/approval-review.js';
import type { AgentRun } from '../../client/lib/itam/agents.js';

const state = vi.hoisted(() => ({
  decide: vi.fn(),
  dismiss: vi.fn(),
  ask: vi.fn(),
}));
vi.mock('../../client/lib/itam/agents.js', () => ({
  useDecideReview: () => ({
    mutate: state.decide,
    isPending: false,
    error: null,
  }),
  useDismissReview: () => ({
    mutate: state.dismiss,
    isPending: false,
    error: null,
  }),
  useAskReview: () => ({ mutate: state.ask, isPending: false, error: null }),
  useLatestReview: () => ({ data: null, isLoading: false }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'ann',
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.text ? `${key}:${String(values.text)}` : key,
    i18n: { language: 'en-US' },
  }),
}));

const run = (overrides: Partial<AgentRun> = {}): AgentRun => ({
  id: 'run-1',
  agent: 'approvalReview',
  trigger: 'submitted',
  startedById: null,
  subjectType: 'purchaseOrders',
  subjectId: 'po-1',
  refId: 'approval-1',
  deciderId: 'ann',
  status: 'pending',
  result: {
    recommendation: 'reject',
    summary: 'Stock covers it',
    asked: '3 × 100 = 300',
    reasons: ['Two in stock'],
    alternatives: 'DE-000012',
    precedents: 'None',
    risks: [],
    missing: [],
    conditions: null,
    comment: 'Use the stock first.',
  },
  failure: null,
  revisesId: null,
  instruction: null,
  decision: null,
  comment: null,
  decidedById: null,
  decidedAt: null,
  model: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  title: 'PO-000031 newHire',
  ...overrides,
});

beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockClear();
});

// The approver's decision card: the recommended decision leads, the comment
// drafted is theirs to edit, and setting it aside or revising it are a
// click away; while it works it says so, and a failure offers to try again.
it('leads with the recommended decision and sends the comment as edited', () => {
  render(<ApprovalReviewCard run={run()} />);
  expect(screen.getByText('review.recommendation.reject')).toBeInTheDocument();
  const buttons = screen
    .getAllByRole('button')
    .map((button) => button.textContent);
  expect(buttons.indexOf('review.reject')).toBeLessThan(
    buttons.indexOf('review.approve'),
  );
  fireEvent.change(screen.getByDisplayValue('Use the stock first.'), {
    target: { value: 'Take DE-000012 instead.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'review.reject' }));
  expect(state.decide).toHaveBeenCalledWith(
    expect.objectContaining({
      decision: 'rejected',
      comment: 'Take DE-000012 instead.',
    }),
    expect.anything(),
  );
});

it('sets the review aside, and offers no conversation about it', () => {
  render(<ApprovalReviewCard run={run()} />);
  fireEvent.click(screen.getByRole('button', { name: 'review.dismiss' }));
  expect(state.dismiss).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'review.discuss' })).toBeNull();
});

it('redoes the review in the approver’s words', () => {
  render(<ApprovalReviewCard run={run()} />);
  fireEvent.click(screen.getByRole('button', { name: 'review.redo' }));
  fireEvent.change(screen.getByPlaceholderText('review.redoPlaceholder'), {
    target: { value: 'Buy all three' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'review.redoSend' }));
  expect(state.ask).toHaveBeenCalledWith(
    {
      subjectType: 'purchaseOrders',
      subjectId: 'po-1',
      revise: { runId: 'run-1', instruction: 'Buy all three' },
    },
    expect.anything(),
  );
});

it('says it is working, and why it failed with a way to try again', () => {
  const { rerender } = render(
    <ApprovalReviewCard run={run({ status: 'running', result: null })} />,
  );
  expect(screen.getByText('review.working')).toBeInTheDocument();
  rerender(
    <ApprovalReviewCard
      run={run({ status: 'failed', result: null, failure: 'timedOut' })}
    />,
  );
  expect(screen.getByText('review.failed.timedOut')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'review.askAgain' }));
  expect(state.ask).toHaveBeenCalledWith({
    subjectType: 'purchaseOrders',
    subjectId: 'po-1',
  });
});
