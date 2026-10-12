import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { OnboardingPlanCard } from '../../client/components/itam/onboarding-plan.js';
import type { OnboardingPlan } from '../../client/lib/itam/onboarding.js';

const state = vi.hoisted(() => ({
  plan: undefined as unknown,
  requests: [] as { path: string; method?: string; json?: unknown }[],
  /** A request whose path contains this is refused. */
  failOn: undefined as string | undefined,
  me: 'u1' as string | undefined,
  aiAvailable: false,
  opened: [] as string[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/onboarding.js', async (original) => ({
  ...(await original<object>()),
  useOnboardingPlan: () => ({ data: state.plan }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useAiPageContext: () => ({
    available: state.aiAvailable,
    ask: () => undefined,
  }),
  useItamAi: () => ({
    available: state.aiAvailable,
    openConversation: (id: string) => state.opened.push(id),
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => state.me,
}));
vi.mock('../../client/lib/itam/announce.js', () => ({
  useAnnounce: () => async () => undefined,
}));
vi.mock('../../client/lib/itam/api.js', async (original) => ({
  ...(await original<object>()),
  useApi: () => ({
    request: async (request: {
      path: string;
      method?: string;
      json?: unknown;
    }) => {
      state.requests.push(request);
      if (state.failOn && request.path.includes(state.failOn))
        throw new Error('Not enough in stock');
      return request.path.endsWith('/advise')
        ? { data: { started: true, runId: 'r2' } }
        : {};
    },
  }),
}));
// The picker fetches its own options; choosing one is what matters here.
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: ({
    onChange,
  }: {
    onChange: (value: string, record: Record<string, unknown>) => void;
  }) => (
    <button
      type='button'
      onClick={() =>
        onChange('d2', { id: 'd2', deviceNo: 'DE-000002', name: 'Mac 2' })
      }
    >
      pick another
    </button>
  ),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (original) => ({
  ...(await original<object>()),
  useOpenRecord: () => () => undefined,
}));

const plan = (hireDate: string): OnboardingPlan => ({
  personId: 'p1',
  hireDate,
  kit: {
    id: 'kit-rd',
    name: 'R&D standard kit',
    departmentId: 'dept-rd',
    position: null,
  },
  prepared: 0,
  required: 3,
  hasDevice: false,
  orders: [],
  waived: 0,
  advice: null,
  lines: [
    {
      key: 'model:m1',
      missing: 1,
      waived: false,
      target: { type: 'model', id: 'm1', name: 'MacBook Pro 14' },
      kind: 'device',
      itemType: 'device',
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [{ type: 'device', id: 'd1', label: 'DE-000001 / Mac' }],
      planned: [],
      onOrder: 0,
      returning: 0,
      orderBy: null,
      shortfall: 0,
    },
    {
      key: 'model:m2',
      missing: 1,
      waived: false,
      target: { type: 'model', id: 'm2', name: 'MX Keys' },
      kind: 'stock',
      itemType: 'accessory',
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [{ type: 'stock', id: 's1', label: 'MX Keys', quantity: 1 }],
      planned: [],
      onOrder: 0,
      returning: 0,
      orderBy: null,
      shortfall: 0,
    },
    {
      key: 'softwareProduct:sp1',
      missing: 1,
      waived: false,
      target: { type: 'softwareProduct', id: 'sp1', name: 'Figma' },
      kind: 'entitlement',
      itemType: null,
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [],
      planned: [],
      onOrder: 0,
      returning: 0,
      orderBy: null,
      shortfall: 1,
    },
  ],
});

const show = (ownerId = 'u1') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <OnboardingPlanCard
          personId='p1'
          personName='Sun Hao'
          ownerId={ownerId}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.requests = [];
  state.failOn = undefined;
  state.me = 'u1';
  state.aiAvailable = false;
  state.opened = [];
});

/** The plan with Noco's pick on the laptop, from a run made as `u1`. */
const advised = (): OnboardingPlan => {
  const base = plan('2099-01-10');
  return {
    ...base,
    advice: {
      runId: 'r1',
      status: 'ready',
      summary: 'Chose the laptop with no repairs.',
      failure: null,
      sessionId: 's1',
      actorId: 'u1',
      createdAt: '2099-01-01T08:00:00.000',
      finishedAt: '2099-01-01T08:01:00.000',
    },
    lines: base.lines.map((line) =>
      line.key === 'model:m1'
        ? {
            ...line,
            proposals: [
              {
                type: 'device',
                id: 'd1',
                label: 'DE-000001 / Mac',
                source: 'noco',
                reason: 'Never repaired, same office',
              },
            ],
          }
        : line,
    ),
  };
};

it('reserves a device until the joining date, before they start', async () => {
  state.plan = plan('2099-01-10');
  show();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.reserve' }));
  await settle();
  expect(state.requests).toEqual([
    {
      path: 'itam/devices/d1/reserve',
      method: 'POST',
      json: {
        reservedForType: 'person',
        reservedForId: 'p1',
        reservedUntil: '2099-01-10',
      },
    },
  ]);
  // What stock cannot cover is said, not hidden.
  expect(screen.getByText('onboarding.shortfall')).toBeTruthy();
});

it('assigns once they have started, and does everything in order', async () => {
  state.plan = plan('2020-01-10');
  show();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.runAll' }));
  await settle();
  await settle();
  expect(state.requests.map((request) => request.path)).toEqual([
    'itam/devices/d1/assign',
    'itam/stock/s1/issue',
  ]);
  expect(state.requests[1]?.json).toEqual({
    holderType: 'person',
    holderId: 'p1',
    quantity: 1,
  });
});

it('carries on past a refused item, and gives a subscription seat its account', async () => {
  const base = plan('2020-01-10');
  state.plan = {
    ...base,
    lines: [
      ...base.lines,
      {
        key: 'softwareProduct:sp2',
        missing: 1,
        waived: false,
        target: { type: 'softwareProduct', id: 'sp2', name: 'Zoom' },
        kind: 'entitlement',
        itemType: 'subscription',
        required: 1,
        prepared: [],
        preparedCount: 0,
        proposals: [
          {
            type: 'seat',
            id: 'e1',
            label: 'Zoom Pro',
            needsAccount: true,
            account: 'sun.hao@example.com',
          },
        ],
        planned: [],
        onOrder: 0,
        returning: 0,
        orderBy: null,
        shortfall: 0,
      },
    ],
  };
  state.failOn = '/issue';
  show();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.runAll' }));
  await settle();
  await settle();
  await settle();
  // The stock issue was refused; the device before it and the seat after
  // it still went through.
  expect(state.requests.map((request) => request.path)).toEqual([
    'itam/devices/d1/assign',
    'itam/stock/s1/issue',
    'itam/entitlements/e1/assign-seats',
  ]);
  expect(state.requests[2]?.json).toEqual({
    seats: [
      {
        holderType: 'person',
        holderId: 'p1',
        account: 'sun.hao@example.com',
      },
    ],
  });
  // The refusal is named.
  expect(screen.getByText(/MX Keys — Not enough in stock/)).toBeTruthy();
});

it('reserves the device the person chose instead of the proposed one', async () => {
  state.plan = plan('2099-01-10');
  show();
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.change' }));
  fireEvent.click(screen.getByRole('button', { name: 'pick another' }));
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.reserve' }));
  await settle();
  expect(state.requests).toEqual([
    expect.objectContaining({ path: 'itam/devices/d2/reserve' }),
  ]);
  // And 全部执行 takes the chosen one too.
  state.requests = [];
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.runAll' }));
  await settle();
  await settle();
  expect(state.requests[0]?.path).toBe('itam/devices/d2/reserve');
});

it('shows Noco’s reason under its pick, and the run under the heading', async () => {
  state.plan = advised();
  state.aiAvailable = true;
  show();
  expect(screen.getByText('Never repaired, same office')).toBeTruthy();
  expect(screen.getByText('onboarding.advice.ready')).toBeTruthy();
  expect(screen.getByText('Chose the laptop with no repairs.')).toBeTruthy();
  // A run is one call to the model, with no conversation to open.
  expect(
    screen.queryByRole('button', { name: 'onboarding.advice.conversation' }),
  ).toBeNull();
  // The 入职负责人 may ask again.
  fireEvent.click(
    screen.getByRole('button', { name: 'onboarding.advice.again' }),
  );
  await settle();
  expect(state.requests).toEqual([
    expect.objectContaining({
      path: 'itam/master/people/p1/onboarding/advise',
      method: 'POST',
    }),
  ]);
  // A pick replaced by 更换 is the person's choice, and its reason goes.
  fireEvent.click(screen.getByRole('button', { name: 'onboarding.change' }));
  fireEvent.click(screen.getByRole('button', { name: 'pick another' }));
  expect(screen.queryByText('Never repaired, same office')).toBeNull();
});

it('lets nobody but the onboarding owner ask again', () => {
  state.plan = advised();
  state.aiAvailable = true;
  state.me = 'u2';
  show();
  expect(screen.getByText('Never repaired, same office')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'onboarding.advice.again' }),
  ).toBeNull();
});

it('says where planned things come from, with no button, and when to order the rest', () => {
  const base = plan('2099-01-10');
  state.plan = {
    ...base,
    lines: base.lines.map((line) =>
      line.key === 'model:m1'
        ? {
            ...line,
            proposals: [],
            planned: [
              {
                type: 'device',
                id: 'd9',
                label: 'DE-000009 / Mac',
                supply: {
                  kind: 'return',
                  availableOn: '2099-01-05',
                  fromId: 'p9',
                  fromName: 'Chen Jie',
                },
              },
            ],
            returning: 1,
          }
        : line.key === 'softwareProduct:sp1'
          ? { ...line, orderBy: '2000-01-01' }
          : line,
    ),
  };
  show();
  expect(screen.getByText('onboarding.planned.return')).toBeTruthy();
  // Not here yet: nothing to reserve for it.
  expect(
    screen.queryByRole('button', { name: 'onboarding.reserve' }),
  ).toBeNull();
  // A shortfall whose last order day has passed is to be ordered now.
  expect(screen.getByText(/onboarding\.orderNow/)).toBeTruthy();
});
