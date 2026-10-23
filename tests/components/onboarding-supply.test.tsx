import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import type {
  OnboardingPlan,
  OnboardingPlanLine,
  OnboardingSupply,
} from '../../client/lib/itam/onboarding.js';
import OnboardingSupplyPage from '../../client/pages/itam/onboarding-supply.js';

const state = vi.hoisted(() => ({
  supply: undefined as unknown,
  requests: [] as { path: string; json?: unknown }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/onboarding.js', async (original) => ({
  ...(await original<object>()),
  useOnboardingSupply: () => ({ data: state.supply, isLoading: false }),
}));
vi.mock('../../client/lib/itam/permissions.js', async (original) => ({
  ...(await original<object>()),
  useCurrentUserId: () => 'u1',
}));
vi.mock('../../client/lib/itam/api.js', async (original) => ({
  ...(await original<object>()),
  useApi: () => ({
    request: async (request: { path: string; json?: unknown }) => {
      state.requests.push(request);
      return { data: { orders: [], skipped: [] } };
    },
  }),
}));

const line = (
  key: string,
  name: string,
  extra: Partial<OnboardingPlanLine> = {},
): OnboardingPlanLine => ({
  key,
  missing: 0,
  waived: false,
  target: { type: 'softwareProduct', id: key, name },
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
  shortfall: 0,
  ...extra,
});

const plan = (lines: OnboardingPlanLine[]): OnboardingPlan => ({
  personId: 'p1',
  hireDate: '2099-01-10',
  kit: { id: 'k1', name: 'Kit', departmentId: 'd1', position: null },
  prepared: 1,
  required: 3,
  hasDevice: true,
  orders: [],
  waived: 0,
  advice: null,
  lines,
});

const supply: OnboardingSupply = {
  shortages: [
    {
      key: 'softwareProduct:ide',
      target: { type: 'softwareProduct', id: 'ide', name: 'IntelliJ' },
      kind: 'entitlement',
      itemType: null,
      quantity: 1,
      orderBy: '2099-01-01',
      people: [{ id: 'p1', name: 'Sun Hao' }],
    },
  ],
  joiners: [
    {
      id: 'p1',
      name: 'Sun Hao',
      position: 'Frontend Engineer',
      department: 'R&D',
      hireDate: '2099-01-10',
      ownerId: 'u1',
      plan: plan([
        line('m365', 'Microsoft 365', {
          proposals: [{ type: 'seat', id: 'e1', label: 'M365' }],
        }),
        line('ide', 'IntelliJ', { missing: 1, shortfall: 1 }),
      ]),
    },
  ],
};

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <OnboardingSupplyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

it('leads with what to buy, and proposes orders for all of it', async () => {
  state.supply = supply;
  state.requests = [];
  show();
  fireEvent.click(
    screen.getByRole('button', { name: /onboarding\.draftOrder/ }),
  );
  // Every joiner's shortfall, without the chat (2026-10-22).
  await waitFor(() =>
    expect(state.requests).toEqual([
      expect.objectContaining({
        path: 'itam/purchase-orders/joiner-proposals',
        json: {},
      }),
    ]),
  );
});

it('lists each joiner once, with only what is not taken from stock', () => {
  state.supply = supply;
  show();
  const name = screen.getAllByRole('link', { name: 'Sun Hao' });
  expect(name.map((link) => link.getAttribute('href'))).toContain(
    '/people/p1/holdings',
  );
  // From stock, on their own card: not repeated here (2026-10-22).
  expect(screen.queryByText('Microsoft 365')).toBeNull();
  // Short: said, with the item opening its product.
  const joiners = screen
    .getByText('onboarding.supply.joiners')
    .closest('[data-slot=card]') as HTMLElement;
  expect(
    within(joiners)
      .getByRole('link', { name: 'IntelliJ' })
      .getAttribute('href'),
  ).toBe('/software-products/ide');
});

it('drafts one item on its own from its row when there are several', async () => {
  state.supply = {
    ...supply,
    shortages: [
      ...supply.shortages,
      {
        key: 'model:iphone',
        target: { type: 'model', id: 'iphone', name: 'iPhone 15' },
        kind: 'device',
        itemType: 'device',
        quantity: 1,
        orderBy: '2099-01-05',
        people: [{ id: 'p2', name: 'Lin Xue' }],
      },
    ],
  };
  state.requests = [];
  show();
  const buttons = screen.getAllByRole('button', {
    name: /onboarding\.draftOrder/,
  });
  // The heading's, then one per row.
  expect(buttons).toHaveLength(3);
  fireEvent.click(buttons[2]!);
  await waitFor(() =>
    expect(state.requests).toEqual([
      expect.objectContaining({ json: { keys: ['model:iphone'] } }),
    ]),
  );
});
