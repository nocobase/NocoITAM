import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        line('adobe', 'Adobe', {
          planned: [
            {
              type: 'seat',
              id: 'po1',
              label: 'Adobe',
              quantity: 1,
              supply: {
                kind: 'order',
                availableOn: '2099-01-05',
                orderId: 'po1',
                orderNo: 'PO-1',
                orderStatus: 'ordered',
              },
            },
          ],
          onOrder: 1,
        }),
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

it('drafts orders for every shortage from the page’s heading', async () => {
  state.supply = supply;
  state.requests = [];
  show();
  // 全部起草采购单: named as all of it (2026-10-22).
  fireEvent.click(screen.getByRole('button', { name: /onboarding\.draftAll/ }));
  // Every joiner's shortfall, in the create dialog (2026-10-22).
  await waitFor(() =>
    expect(state.requests).toEqual([
      expect.objectContaining({
        path: 'itam/purchase-orders/joiner-proposals',
        json: {},
      }),
    ]),
  );
});

it('lists under each joiner only what is short or on its way, once', async () => {
  state.supply = supply;
  state.requests = [];
  show();
  expect(
    screen
      .getAllByRole('link', { name: 'Sun Hao' })
      .map((link) => link.getAttribute('href')),
  ).toContain('/people/p1/holdings');
  // From stock, on their own card: not repeated here.
  expect(screen.queryByText('Microsoft 365')).toBeNull();
  // No 需要采购 card listing the shortages a second time (2026-10-22).
  expect(screen.queryByText('onboarding.supply.shortages')).toBeNull();
  // Short and on its way: each listed, the item opening its product.
  expect(
    screen.getByRole('link', { name: 'IntelliJ' }).getAttribute('href'),
  ).toBe('/software-products/ide');
  expect(screen.getByRole('link', { name: 'Adobe' }).getAttribute('href')).toBe(
    '/software-products/adobe',
  );
  // The shortage's own button: this item, for this joiner.
  const buttons = screen.getAllByRole('button', {
    name: /onboarding\.draftOrder/,
  });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]!);
  await waitFor(() =>
    expect(state.requests).toEqual([
      expect.objectContaining({ json: { personId: 'p1', keys: ['ide'] } }),
    ]),
  );
});
