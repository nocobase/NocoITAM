import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import WorkbenchPage from '../../client/pages/itam/workbench.js';
import type { MyWorkItem } from '../../client/lib/itam/workbench.js';

const state = vi.hoisted(() => ({
  items: [] as MyWorkItem[],
  /** Full rows per list path, as the board cards read them; none by default. */
  rows: {} as Record<string, Record<string, unknown>[]>,
  opened: vi.fn(),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('../../client/lib/itam/workbench.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/workbench.js',
  )),
  useMyWork: () => ({ data: state.items, isLoading: false }),
  useReminders: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../client/lib/itam/api.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/api.js',
  )),
  useItamSettings: () => ({ data: undefined }),
  useItamList: (path: string, query: { ids?: readonly string[] }) => ({
    data: state.rows[path]
      ? {
          data: state.rows[path].filter((row) =>
            (query.ids ?? []).includes(String(row.id)),
          ),
        }
      : undefined,
  }),
}));
vi.mock('../../client/lib/itam/references.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/references.js',
  )),
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/record-drawer.js', () => ({
  useOpenRecord: () => state.opened,
}));

const record = (id: string, date: string, url: string) => ({
  id,
  title: id,
  date,
  url,
});

const show = () =>
  render(
    <MemoryRouter>
      <WorkbenchPage />
    </MemoryRouter>,
  );

const column = (label: string) => screen.getByRole('region', { name: label });

it('lays the to-dos out as columns, 需要关注 first, and opens a record in the drawer', () => {
  state.items = [
    {
      key: 'awaitingReceipt',
      count: 1,
      url: '/procurement?view=awaitingReceipt',
      records: [record('PO-000020', '2026-09-26', '/procurement/a')],
    },
    {
      key: 'loansDueToday',
      count: 0,
      url: '/devices?status=onLoan',
      records: [],
    },
  ];
  show();
  expect(
    screen
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-label')),
  ).toEqual([
    'workbench.attention',
    'workbench.work.awaitingReceipt',
    'workbench.work.loansDueToday',
  ]);
  // An empty column stays, dimmed, and says so.
  const loans = column('workbench.work.loansDueToday');
  expect(within(loans).getByText('workbench.nothingPending')).toBeTruthy();
  expect(loans.className).toContain('opacity-60');
  fireEvent.click(screen.getByText('PO-000020'));
  expect(state.opened).toHaveBeenCalledWith('/procurement/a');
});

it('shows both kinds of approval in one column, each tagged', () => {
  state.items = [
    {
      key: 'pendingPurchaseApprovals',
      count: 1,
      url: '/procurement?status=pendingApproval',
      records: [record('PO-000019', '2026-10-19', '/procurement/p')],
    },
    {
      key: 'pendingDisposalApprovals',
      count: 2,
      url: '/disposals?status=pendingApproval',
      records: [
        record('DP-000001', '2026-09-01', '/disposals/d1'),
        record('DP-000002', '2026-09-02', '/disposals/d2'),
      ],
    },
  ];
  show();
  const approvals = column('workbench.work.pendingApprovals');
  expect(within(approvals).getByText('3')).toBeTruthy();
  // Oldest first across both kinds.
  expect(
    within(approvals)
      .getAllByText(/^(PO|DP)-/)
      .map((node) => node.textContent),
  ).toEqual(['DP-000001', 'DP-000002', 'PO-000019']);
});

it('draws a purchase order with the card of its board, and opens it in the drawer', () => {
  state.opened.mockClear();
  state.items = [
    {
      key: 'awaitingReceipt',
      count: 1,
      url: '/procurement?view=awaitingReceipt',
      records: [record('po-1', '2026-09-26', '/procurement/po-1')],
    },
  ];
  state.rows = {
    'itam/purchase-orders': [
      {
        id: 'po-1',
        orderNo: 'PO-000020',
        estimatedTotal: 2990,
        currency: 'CNY',
        createdAt: '2026-10-05T21:13:00.000',
      },
    ],
  };
  show();
  const receipts = column('workbench.work.awaitingReceipt');
  // The board's card: the order's number and amount, not the to-do's title.
  expect(within(receipts).getByText('PO-000020')).toBeTruthy();
  expect(within(receipts).getByText(/2,990\.00/)).toBeTruthy();
  fireEvent.click(within(receipts).getByText('PO-000020'));
  expect(state.opened).toHaveBeenCalledWith('/procurement/po-1');
  state.rows = {};
});

it('keeps a long fault description to one truncated line on a repair card', () => {
  const fault = '屏幕闪烁，'.repeat(80);
  state.items = [
    {
      key: 'activeRepairs',
      count: 1,
      url: '/repairs?result=inProgress',
      records: [
        { ...record('rp-1', '2026-10-09', '/repairs/rp-1'), tag: 'repairs' },
      ],
    },
  ];
  state.rows = {
    'itam/repairs': [
      { id: 'rp-1', repairNo: 'RP-000001', faultDescription: fault },
    ],
  };
  show();
  const repairs = column('workbench.work.activeRepairs');
  const line = within(repairs).getByText(fault);
  // One line, cut by CSS, with nothing to unfold.
  expect(line.className).toContain('truncate');
  expect(
    within(repairs).queryByRole('button', { name: /expand|展开/i }),
  ).toBeNull();
  state.rows = {};
});
