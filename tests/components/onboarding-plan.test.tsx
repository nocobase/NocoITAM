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
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/onboarding.js', () => ({
  useOnboardingPlan: () => ({ data: state.plan }),
}));
vi.mock('../../client/lib/itam/ai-context.js', () => ({
  useAiPageContext: () => ({
    ref: () => undefined,
    available: false,
    ask: () => undefined,
  }),
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
      return {};
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
  lines: [
    {
      target: { type: 'model', id: 'm1', name: 'MacBook Pro 14' },
      kind: 'device',
      itemType: 'device',
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [{ type: 'device', id: 'd1', label: 'DE-000001 / Mac' }],
      onOrder: 0,
      shortfall: 0,
    },
    {
      target: { type: 'model', id: 'm2', name: 'MX Keys' },
      kind: 'stock',
      itemType: 'accessory',
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [{ type: 'stock', id: 's1', label: 'MX Keys', quantity: 1 }],
      onOrder: 0,
      shortfall: 0,
    },
    {
      target: { type: 'softwareProduct', id: 'sp1', name: 'Figma' },
      kind: 'entitlement',
      itemType: null,
      required: 1,
      prepared: [],
      preparedCount: 0,
      proposals: [],
      onOrder: 0,
      shortfall: 1,
    },
  ],
});

const show = () =>
  render(
    <MemoryRouter>
      <OnboardingPlanCard personId='p1' personName='Sun Hao' />
    </MemoryRouter>,
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.requests = [];
  state.failOn = undefined;
});

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
        onOrder: 0,
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
