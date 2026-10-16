import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SuggestionCard } from '../../client/components/itam/ai/suggestion-card.js';
import type { SuggestionRun } from '../../client/lib/itam/agents.js';

const state = vi.hoisted(() => ({
  accept: vi.fn(),
  dismiss: vi.fn(),
  ask: vi.fn(),
  discuss: vi.fn(),
  plan: null as unknown,
}));
vi.mock('../../client/lib/itam/agents.js', () => ({
  useAcceptSuggestion: () => ({
    mutate: state.accept,
    isPending: false,
    error: null,
  }),
  useDismissReview: () => ({
    mutate: state.dismiss,
    isPending: false,
    error: null,
  }),
  useAskReview: () => ({ mutate: state.ask, isPending: false, error: null }),
  useLatestRun: () => ({ data: null, isLoading: false }),
  useRunPlan: () => ({ data: state.plan }),
}));
vi.mock('../../client/lib/itam/ask.js', () => ({
  useDiscuss: () => state.discuss,
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'mia',
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values && 'count' in values
        ? `${key}:${String(values.count)}`
        : values && 'subject' in values
          ? `${key}:${String(values.subject)}`
          : key,
    i18n: { language: 'en-US' },
  }),
}));

const run = (overrides: Partial<SuggestionRun> = {}): SuggestionRun => ({
  id: 'run-1',
  agent: 'offboarding',
  trigger: 'left',
  startedById: 'mia',
  subjectType: 'people',
  subjectId: 'p-1',
  refId: null,
  deciderId: 'mia',
  status: 'pending',
  result: {
    title: '离职回收：Li Na',
    summary: 'Take back the laptop and the seat',
    changes: [
      {
        op: 'return_devices',
        kind: 'device',
        action: 'return',
        subject: 'DE-000004 / MacBook Pro 14',
        nextStatus: 'inStock',
        reason: 'In good order',
      },
      {
        op: 'reclaim_seats',
        kind: 'seat',
        action: 'reclaim',
        subject: 'Figma · li.na@example.com',
        reason: 'She has left',
      },
    ],
    notes: ['Confirm the mouse was used up'],
    risks: [],
  },
  planId: null,
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
  title: 'Li Na',
  ...overrides,
});

beforeEach(() => {
  for (const mock of [state.accept, state.dismiss, state.ask, state.discuss])
    mock.mockClear();
  state.plan = null;
});

// The decider's card: every change ticked, unticking one leaves it out of
// what is carried out; set aside, discussed or redone a click away.
it('carries out the changes left ticked', () => {
  render(<SuggestionCard run={run()} />);
  expect(
    screen.getByText('suggestion.change.return:DE-000004 / MacBook Pro 14'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'suggestion.execute:2' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('checkbox')[1]!);
  fireEvent.click(screen.getByRole('button', { name: 'suggestion.execute:1' }));
  expect(state.accept).toHaveBeenCalledWith(
    expect.objectContaining({ keep: [0] }),
    expect.anything(),
  );
});

it('cannot carry out nothing; one with no changes is agreed to', () => {
  const { rerender } = render(<SuggestionCard run={run()} />);
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
  expect(
    screen.getByRole('button', { name: 'suggestion.execute:0' }),
  ).toBeDisabled();
  rerender(
    <SuggestionCard
      run={run({
        id: 'run-2',
        agent: 'renewalReview',
        subjectType: 'entitlements',
        result: {
          title: '授权续费：Figma',
          summary: 'Renew as it is',
          changes: [],
          notes: [],
          risks: [],
          recommendation: 'renew',
        },
      })}
    />,
  );
  expect(
    screen.getByText('suggestion.recommendation.renew'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'suggestion.agree' }));
  expect(state.accept).toHaveBeenCalledWith(
    expect.objectContaining({ keep: [] }),
    expect.anything(),
  );
});

it('sets it aside, discusses the leaver, or redoes it in the decider’s words', () => {
  render(<SuggestionCard run={run()} />);
  fireEvent.click(screen.getByRole('button', { name: 'review.dismiss' }));
  expect(state.dismiss).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'review.discuss' }));
  expect(state.discuss).toHaveBeenCalledWith([
    { kind: 'people', id: 'p-1', label: 'Li Na' },
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'review.redo' }));
  fireEvent.change(
    screen.getByPlaceholderText('suggestion.redoPlaceholder.offboarding'),
    { target: { value: 'Send the laptop for repair' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'review.redoSend' }));
  expect(state.ask).toHaveBeenCalledWith(
    {
      agent: 'offboarding',
      subjectType: 'people',
      subjectId: 'p-1',
      revise: { runId: 'run-1', instruction: 'Send the laptop for repair' },
    },
    expect.anything(),
  );
});

it('shows what each step did once accepted', () => {
  state.plan = {
    id: 'plan-1',
    status: 'failed',
    failure: { position: 1, code: 'X', message: 'Seat already free' },
    steps: [
      {
        id: 's1',
        position: 0,
        op: 'return_devices',
        check: { title: 'return: DE-000004', fields: [] },
        status: 'done',
        result: null,
      },
      {
        id: 's2',
        position: 1,
        op: 'reclaim_seats',
        check: { title: 'reclaim: Figma', fields: [] },
        status: 'failed',
        result: null,
      },
    ],
  };
  render(
    <SuggestionCard run={run({ status: 'accepted', planId: 'plan-1' })} />,
  );
  expect(screen.getByText('suggestion.accepted')).toBeInTheDocument();
  expect(screen.getByText('return: DE-000004')).toBeInTheDocument();
  expect(screen.getByText('suggestion.stoppedAt')).toBeInTheDocument();
});
