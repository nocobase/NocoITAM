import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  DeviceSyncFollowUpBlock,
  DeviceSyncRunCard,
} from '../../client/components/itam/ai/device-sync-run.js';
import { FollowUpFocusContext } from '../../client/lib/itam/device-sync-followup.js';
import type { DeviceSyncRun } from '../../client/lib/itam/agents.js';

const state = vi.hoisted(() => ({
  dismiss: vi.fn(),
  plan: null as unknown,
  inbox: { open: [] as unknown[], handled: [] as unknown[] },
  others: [] as unknown[],
}));
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
  useInbox: () => ({ data: state.inbox }),
  useOtherFollowUps: () => ({ data: state.others }),
  useDismissReview: () => ({
    mutate: state.dismiss,
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({ useApi: () => ({}) }));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ users: new Map([['wujing', 'Wu Jing']]) }),
}));
// The plan's own card is tested with the chat; here, that it is shown.
vi.mock('../../client/components/itam/ai/plan-card.js', () => ({
  PlanCard: ({ plan }: { plan: { title: string } }) => <p>plan:{plan.title}</p>,
  PlanDecision: () => <button type='button'>decide</button>,
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
  state.inbox = { open: [], handled: [] };
  state.others = [];
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

// On MDM 核对 itself (2026-10-17): no way to the page it is on.
it('leaves out the way to MDM 核对 when shown there', () => {
  show(run());
  expect(screen.getByText('deviceSyncRun.openReview')).toBeInTheDocument();
  render(
    <MemoryRouter>
      <DeviceSyncRunCard run={run({ id: 'run-2' })} onReview />
    </MemoryRouter>,
  );
  expect(screen.getAllByText('deviceSyncRun.openReview')).toHaveLength(1);
});

it('lists the reader’s open follow-ups under 等你决定, and nothing else', () => {
  state.inbox = {
    open: [
      run({ id: 'mine', status: 'running', result: null }),
      { ...run({ id: 'review' }), agent: 'approvalReview' },
    ],
    handled: [
      run({ id: 'old', status: 'accepted' }),
      run({ id: 'replaced', status: 'superseded' }),
    ],
  };
  const { unmount } = render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.getByText('review.waiting')).toBeInTheDocument();
  expect(screen.getAllByText('deviceSyncRun.working')).toHaveLength(1);
  expect(screen.queryByText('deviceSyncRun.accepted')).not.toBeInTheDocument();
  expect(screen.queryByText('review.superseded')).not.toBeInTheDocument();
  unmount();
  state.inbox = { open: [], handled: [run({ status: 'accepted' })] };
  render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.queryByText('review.waiting')).not.toBeInTheDocument();
});

// Folded to a line on MDM 核对 (2026-10-21): the plan's decision in it,
// declining standing for 忽略; the steps when opened.
it('folds a waiting plan to its header line, with the plan’s decision', () => {
  state.plan = {
    id: 'plan-1',
    title: 'MDM follow-up: 2 differences',
    status: 'pending',
    steps: [{ position: 0 }, { position: 1 }],
  };
  state.inbox = { open: [run()], handled: [] };
  render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.getByText(/deviceSyncRun\.stepsWaiting/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'decide' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'review.dismiss' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText('plan:MDM follow-up: 2 differences'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('deviceSyncRun.ownDifferences'));
  expect(
    screen.getByText('plan:MDM follow-up: 2 differences'),
  ).toBeInTheDocument();
});

// Beside a run in 收件箱, that run alone (2026-10-17).
it('shows the run picked in 收件箱 alone', () => {
  state.inbox = {
    open: [run({ id: 'a' }), run({ id: 'b', subjectId: 'shared:mia' })],
    handled: [],
  };
  render(
    <MemoryRouter>
      <FollowUpFocusContext.Provider value='b'>
        <DeviceSyncFollowUpBlock />
      </FollowUpFocusContext.Provider>
    </MemoryRouter>,
  );
  expect(
    screen.getByText('deviceSyncRun.sharedDifferences'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('deviceSyncRun.ownDifferences'),
  ).not.toBeInTheDocument();
});

// For an asset manager (2026-10-17): the others' follow-ups, to read.
it('lists the other owners’ follow-ups to read, with nothing to act on', () => {
  state.others = [
    {
      id: 'o1',
      deciderId: 'wujing',
      status: 'pending',
      failure: null,
      createdAt: '2026-10-17T08:00:00.000Z',
      items: [{ key: 'k', kind: 'stale', subject: 'd', label: 'DE-1' }],
      summary: '1 difference',
      notes: ['DE-1: ask its user'],
      steps: ['Transfer DE-2 to Liu Yang'],
    },
  ];
  render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: /^deviceSyncRun\.others/ }),
  );
  expect(screen.getByText('deviceSyncRun.otherTitle')).toBeInTheDocument();
  expect(screen.getByText('Transfer DE-2 to Liu Yang')).toBeInTheDocument();
  expect(screen.getByText('DE-1: ask its user')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'review.dismiss' }),
  ).not.toBeInTheDocument();
});
