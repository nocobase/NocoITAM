import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  DeviceSyncFollowUpBlock,
  DeviceSyncRunCard,
} from '../../client/components/itam/ai/device-sync-run.js';
import {
  FollowUpFocusContext,
  followUpTitle,
} from '../../client/lib/itam/device-sync-followup.js';
import type { DeviceSyncRun } from '../../client/lib/itam/agents.js';

const state = vi.hoisted(() => ({
  dismiss: vi.fn(),
  settle: vi.fn(),
  decide: vi.fn(),
  ask: vi.fn(),
  plan: null as unknown,
  inbox: { open: [] as unknown[], handled: [] as unknown[] },
  others: [] as unknown[],
  // What MDM 核对 lists now, by view; undefined while loading.
  review: undefined as Record<string, unknown[]> | undefined,
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
  useQueries: ({ queries }: { queries: { enabled?: boolean }[] }) =>
    queries.map((query) => ({
      data: query.enabled ? state.plan : undefined,
    })),
  useMutation: () => ({ mutate: state.decide, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@nocobase/app-client', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('../../client/lib/itam/agents.js', () => ({
  useInbox: () => ({ data: state.inbox }),
  useOtherFollowUps: () => ({ data: state.others }),
  useDismissReview: () => ({
    mutate: state.dismiss,
    isPending: false,
    error: null,
  }),
  useSettleFollowUp: () => ({ mutate: state.settle, isPending: false }),
  useAskFollowUp: () => ({ mutate: state.ask, isPending: false }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({ useApi: () => ({}) }));
vi.mock('../../client/lib/itam/device-sync.js', () => ({
  useDeviceReview: (view: string) => ({ data: state.review?.[view] }),
}));
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
  state.settle.mockClear();
  state.inbox = { open: [], handled: [] };
  state.others = [];
  state.review = undefined;
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
  fireEvent.click(
    screen.getByRole('button', { name: 'deviceSyncRun.setAside' }),
  );
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
  expect(screen.getByText('deviceSyncRun.failedHint')).toBeInTheDocument();
  // On MDM 核对 itself, the way to try again is on the page (2026-10-21).
  rerender(
    <MemoryRouter>
      <DeviceSyncRunCard
        run={run({ status: 'failed', result: null, failure: 'unavailable' })}
        onReview
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('deviceSyncRun.failedHintHere')).toBeInTheDocument();
});

it('offers nothing to set aside once it is carried out', () => {
  show(run({ status: 'accepted' }));
  expect(screen.getByText('deviceSyncRun.accepted')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'deviceSyncRun.setAside' }),
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

// On MDM 核对 (2026-10-21): the plan's decision in the header line,
// declining standing for 忽略; the steps open while it waits.
it('heads a waiting plan with its decision, its steps open beneath', () => {
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
  expect(screen.getByRole('button', { name: 'decide' })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'deviceSyncRun.setAside' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('plan:MDM follow-up: 2 differences'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText('deviceSyncRun.ownDevices'));
  expect(
    screen.queryByText('plan:MDM follow-up: 2 differences'),
  ).not.toBeInTheDocument();
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
  expect(screen.getByText('deviceSyncRun.sharedDevices')).toBeInTheDocument();
  expect(
    screen.queryByText('deviceSyncRun.ownDevices'),
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
      notes: ['DE-1: ask its user\nNo sync for 40 days'],
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
  expect(screen.getByText('deviceSyncRun.otherDevices')).toBeInTheDocument();
  expect(screen.getByText('Transfer DE-2 to Liu Yang')).toBeInTheDocument();
  expect(screen.getByText('DE-1: ask its user')).toBeInTheDocument();
  // The reason sits beneath, on its own line.
  expect(screen.getByText('No sync for 40 days')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'deviceSyncRun.setAside' }),
  ).not.toBeInTheDocument();
});

// The asset managers' follow-up says what it holds, in devices (2026-10-21).
it('titles the asset managers’ follow-up by kind, in devices', () => {
  const t = (key: string, options?: Record<string, unknown>) =>
    key.endsWith('separator')
      ? ', '
      : `${key.split('.').at(-1) ?? key}(${Object.values(options ?? {}).join()})`;
  const item = (kind: string, subject: string) => ({
    key: `${subject}|${kind}`,
    kind,
    subject,
    label: subject,
  });
  const shared = (items: ReturnType<typeof item>[]) =>
    run({
      subjectId: 'shared:mia',
      result: { items, planId: null, notes: [], summary: '' },
    });
  expect(
    followUpTitle(
      shared([item('unregistered', 'r1'), item('unregistered', 'r2')]),
      t,
    ),
  ).toBe('sharedDevices(onlyInMdm(2))');
  expect(
    followUpTitle(
      shared([
        item('unregistered', 'r1'),
        item('stale', 'd1'),
        item('userMismatch', 'd1'),
      ]),
      t,
    ),
  ).toBe('sharedDevices(onlyInMdm(1), unowned(1))');
  // A person's, by MDM 核对's tabs.
  expect(
    followUpTitle(
      run({
        result: {
          items: [
            item('stale', 'd1'),
            item('userMismatch', 'd1'),
            item('statusMismatch', 'd2'),
            item('unmanaged', 'd3'),
          ],
          planId: null,
          notes: [],
          summary: '',
        },
      }),
      t,
    ),
  ).toBe('ownDevices(onlyOnRegister(1), mismatch(2))');
});

// Settled on its row below (2026-10-21): its steps are left out, and once
// every one is, the follow-up closes by itself, as handled.
it('leaves out the steps settled on their rows, and closes once all are', () => {
  state.plan = {
    id: 'plan-1',
    title: 'MDM follow-up',
    status: 'pending',
    steps: [{ position: 1 }, { position: 2 }],
  };
  const advised = () =>
    run({
      result: {
        items: [],
        planId: 'plan-1',
        notes: [],
        summary: '',
        advice: ['r1', 'r2'].map((subject, index) => ({
          subject,
          kind: 'unregistered' as const,
          action: 'ignore' as const,
          reason: null,
          target: null,
          planned: true,
          steps: [index + 1],
        })),
      },
    });
  // r1 is gone from 只在 MDM: settled below.
  state.review = { checks: [], unregistered: [{ id: 'r2' }], unmanaged: [] };
  state.inbox = { open: [advised()], handled: [] };
  const { unmount } = render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.getByText(/deviceSyncRun\.handledBelow/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'decide' })).toBeInTheDocument();
  expect(state.settle).not.toHaveBeenCalled();
  unmount();
  state.review = { checks: [], unregistered: [], unmanaged: [] };
  render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(state.settle).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'run-1' }),
  );
  expect(screen.queryByRole('button', { name: 'decide' })).toBeNull();
});

// Her own and the shared one waiting are each its own card, decided apart
// (2026-10-22; one card for a day).
it('shows the reader’s waiting follow-ups as a card each', () => {
  state.plan = null;
  state.inbox = {
    open: [run({ id: 'own' }), run({ id: 'shared', subjectId: 'shared:mia' })],
    handled: [],
  };
  render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.getByText('deviceSyncRun.ownDevices')).toBeInTheDocument();
  expect(screen.getByText('deviceSyncRun.sharedDevices')).toBeInTheDocument();
  expect(
    screen.getAllByRole('button', { name: 'deviceSyncRun.setAside' }),
  ).toHaveLength(2);
  // The reader's own first, wherever the newest is (2026-10-22), and each
  // worked out again alone, on its tab.
  const again = screen.getAllByRole('button', { name: 'deviceSyncRun.rerun' });
  fireEvent.click(again[0]!);
  expect(state.ask).toHaveBeenCalledWith({ part: 'own', tab: 'checks' });
  fireEvent.click(again[1]!);
  expect(state.ask).toHaveBeenCalledWith({ part: 'shared', tab: 'checks' });
});

// Decided here, a card stays folded until a newer follow-up of the same
// subject comes (2026-10-22): asking again left it under the new one.
it('drops a card decided here once a newer follow-up comes', () => {
  state.plan = null;
  state.inbox = { open: [run({ id: 'old' })], handled: [] };
  const view = render(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  state.inbox = {
    open: [],
    handled: [run({ id: 'old', status: 'accepted' })],
  };
  view.rerender(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.getByText(/deviceSyncRun\.accepted/)).toBeInTheDocument();
  state.inbox = {
    open: [
      run({ id: 'new', createdAt: new Date(Date.now() + 1000).toISOString() }),
    ],
    handled: [run({ id: 'old', status: 'accepted' })],
  };
  view.rerender(
    <MemoryRouter>
      <DeviceSyncFollowUpBlock />
    </MemoryRouter>,
  );
  expect(screen.queryByText(/deviceSyncRun\.accepted/)).toBeNull();
});
