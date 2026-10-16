import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { DeviceSyncRunCard } from '../../client/components/itam/ai/device-sync-run.js';
import type { DeviceSyncRun } from '../../client/lib/itam/agents.js';

const state = vi.hoisted(() => ({ dismiss: vi.fn(), plan: null as unknown }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled?: boolean }) => ({
    data: options.enabled ? state.plan : undefined,
  }),
}));
vi.mock('../../client/lib/itam/agents.js', () => ({
  useDismissReview: () => ({
    mutate: state.dismiss,
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({ useApi: () => ({}) }));
// The plan's own card is tested with the chat; here, that it is shown.
vi.mock('../../client/components/itam/ai/plan-card.js', () => ({
  PlanCard: ({ plan }: { plan: { title: string } }) => <p>plan:{plan.title}</p>,
}));

const run = (overrides: Partial<DeviceSyncRun> = {}): DeviceSyncRun => ({
  id: 'run-1',
  agent: 'deviceSync',
  trigger: 'synced',
  startedById: null,
  subjectType: 'deviceSync',
  subjectId: 'owner:mia',
  refId: null,
  deciderId: 'mia',
  status: 'pending',
  result: {
    items: [
      {
        key: 'd1|userMismatch|p2',
        kind: 'userMismatch',
        subject: 'd1',
        label: 'DE-000001 / ThinkPad',
      },
    ],
    planId: 'plan-1',
    notes: ['PC-x: register it as a new device'],
    summary: '2 new differences: 1 can be carried out, 1 need a look.',
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
  title: null,
  ...overrides,
});

const show = (value: DeviceSyncRun) =>
  render(
    <MemoryRouter>
      <DeviceSyncRunCard run={value} />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.dismiss.mockClear();
  state.plan = { id: 'plan-1', title: 'MDM follow-up: 2 differences' };
});

// What a sync left: the plan to carry out, the rest for the reader, and
// the way to MDM 核对; 忽略 sets it aside.
it('shows the plan, what is left to the reader, and sets it aside', () => {
  show(run());
  expect(
    screen.getByText('plan:MDM follow-up: 2 differences'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('PC-x: register it as a new device'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('deviceSyncRun.openReview').closest('a'),
  ).toHaveAttribute('href', '/device-sync');
  fireEvent.click(screen.getByRole('button', { name: 'review.dismiss' }));
  expect(state.dismiss).toHaveBeenCalled();
});

it('says it is working, and why it has nothing when it failed', () => {
  const { rerender } = show(run({ status: 'running', result: null }));
  expect(screen.getByText('deviceSyncRun.working')).toBeInTheDocument();
  rerender(
    <MemoryRouter>
      <DeviceSyncRunCard
        run={run({ status: 'failed', result: null, failure: 'unavailable' })}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('review.failed.unavailable')).toBeInTheDocument();
});

it('offers nothing to set aside once it is carried out', () => {
  show(run({ status: 'accepted' }));
  expect(screen.getByText('deviceSyncRun.accepted')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'review.dismiss' }),
  ).not.toBeInTheDocument();
});
