import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import type { SupplyRow } from '../../client/lib/itam/supply-demand.js';
import SupplyDemandPage from '../../client/pages/itam/supply-demand.js';

const state = vi.hoisted(() => ({
  rows: [] as SupplyRow[],
  asked: [] as { days: number; replacements: boolean }[],
  dialogs: [] as {
    open: boolean;
    values: Record<string, unknown>;
    lines: unknown[];
  }[],
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${String(options.count)}`,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('../../client/lib/itam/supply-demand.js', async (original) => ({
  ...(await original<object>()),
  useSupplyDemand: (days: number, replacements: boolean) => {
    state.asked.push({ days, replacements });
    return {
      data: { today: '2099-01-01', until: '2099-03-02', rows: state.rows },
      isFetching: false,
      error: null,
    };
  },
}));
vi.mock('../../client/lib/itam/references.js', async (original) => ({
  ...(await original<object>()),
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/permissions.js', async (original) => ({
  ...(await original<object>()),
  useCurrentUserId: () => 'u1',
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (original) => ({
  ...(await original<object>()),
  useOpenRecord: () => vi.fn(),
}));
// The create dialog itself is tested on its own; here, what it is given.
vi.mock('../../client/pages/itam/procurement/create-dialog.js', () => ({
  PurchaseOrderCreateDialog: (props: {
    open: boolean;
    initialValues: Record<string, unknown>;
    initialLines: unknown[];
  }) => {
    state.dialogs.push({
      open: props.open,
      values: props.initialValues,
      lines: props.initialLines,
    });
    return null;
  },
}));

const totals = (values: Partial<SupplyRow['totals']>): SupplyRow['totals'] => ({
  stock: 0,
  order: 0,
  repair: 0,
  return: 0,
  joiner: 0,
  minimum: 0,
  expiring: 0,
  replacement: 0,
  ...values,
});

const row = (
  id: string,
  balance: number,
  vendorId: string | null,
  entries: SupplyRow['entries'],
): SupplyRow => ({
  key: `model:${id}`,
  target: { type: 'model', id, name: id },
  kind: 'device',
  totals: totals({ stock: 1 }),
  supply: 1,
  demand: 1 - balance,
  balance,
  orderBy: balance < 0 ? '2098-12-30' : null,
  vendorId,
  unlimitedBy: null,
  itemType: 'device',
  entries,
});

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SupplyDemandPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.asked = [];
  state.dialogs = [];
  state.rows = [
    row('mac', -2, 'v1', [
      { kind: 'stock', quantity: 1, label: 'DE-1', date: null, url: '/d/1' },
      {
        kind: 'joiner',
        quantity: -3,
        label: 'Sun Hao',
        date: '2099-01-20',
        url: '/people/p1/holdings',
      },
    ]),
    row('mouse', -1, 'v2', [
      {
        kind: 'minimum',
        quantity: -2,
        label: 'Mouse',
        date: null,
        url: '/accessories/a1',
      },
    ]),
    row('dock', 3, 'v1', []),
    row('stand', 1, 'v1', [
      {
        kind: 'order',
        quantity: 2,
        label: 'PO-1',
        date: '2099-01-10',
        url: '/procurement/o1',
      },
    ]),
  ];
});

it('puts what is short first, in words, and the rest as have + coming − using', () => {
  show();
  // 60 days, replacements left out, unless asked.
  expect(state.asked.at(-1)).toEqual({ days: 60, replacements: false });
  expect(screen.getByText('supplyDemand.short.title:2')).toBeTruthy();
  // Why: who needs it, and what there is.
  expect(screen.getByRole('link', { name: 'Sun Hao' })).toBeTruthy();
  expect(screen.getByText('supplyDemand.entry.minimum')).toBeTruthy();
  expect(screen.getByText('supplyDemand.short.missing:2')).toBeTruthy();

  // 够用 lists only what changes, unless asked for everything.
  expect(screen.queryByText('dock')).toBeNull();
  expect(screen.getByText('stand')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('switch', { name: /supplyDemand\.enough\.everything/ }),
  );
  expect(screen.getByText('dock')).toBeTruthy();

  fireEvent.click(screen.getByRole('radio', { name: 'supplyDemand.days:90' }));
  fireEvent.click(
    screen.getByRole('switch', { name: 'supplyDemand.replacements' }),
  );
  expect(state.asked.at(-1)).toEqual({ days: 90, replacements: true });
});

it('buys what is short, an order per vendor, from the heading or an item', () => {
  show();
  fireEvent.click(
    screen.getByRole('button', { name: 'supplyDemand.orders.createAll' }),
  );
  const shown = state.dialogs.slice(-2);
  expect(shown.map((dialog) => dialog.values)).toEqual([
    expect.objectContaining({
      reason: 'newHire',
      vendorId: 'v1',
      neededBy: '2099-01-20',
      ownerId: 'u1',
    }),
    expect.objectContaining({ reason: 'stockReplenishment', vendorId: 'v2' }),
  ]);
  expect(shown[0]?.lines).toEqual([
    {
      itemType: 'device',
      modelId: 'mac',
      softwareProductId: null,
      quantity: 2,
    },
  ]);
  expect(shown.map((dialog) => dialog.open)).toEqual([true, false]);
  // Each short item has its own; nothing that is enough does.
  expect(
    screen.getAllByRole('button', { name: 'supplyDemand.orders.create' }),
  ).toHaveLength(2);
});
