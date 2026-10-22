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
    // 待到货入库 reads as 采购中, the column it shares with 待下单, and
    // 借出逾期 as 设备跟进, with 维修中.
    'workbench.work.purchasing',
    'workbench.work.devices',
  ]);
  // An empty column stays, dimmed, and says so.
  const loans = column('workbench.work.devices');
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
        status: 'ordered',
        createdAt: '2026-10-05T21:13:00.000',
      },
    ],
  };
  show();
  const receipts = column('workbench.work.purchasing');
  // The board's card: the order's number and amount, not the to-do's title.
  expect(within(receipts).getByText('PO-000020')).toBeTruthy();
  expect(within(receipts).getByText(/2,990\.00/)).toBeTruthy();
  // 采购中 holds orders at several steps, so each card says which.
  expect(within(receipts).getByText('enums.poStatus.ordered')).toBeTruthy();
  fireEvent.click(within(receipts).getByText('PO-000020'));
  expect(state.opened).toHaveBeenCalledWith('/procurement/po-1');
  state.rows = {};
});

it('puts orders to place and to receive in one column, overdue first', () => {
  state.items = [
    {
      key: 'pendingOrders',
      count: 1,
      url: '/procurement?status=approved',
      records: [record('PO-000030', '2999-01-01', '/procurement/place')],
    },
    {
      key: 'awaitingReceipt',
      count: 2,
      url: '/procurement?view=awaitingReceipt',
      records: [
        record('PO-000031', '2020-01-01', '/procurement/late'),
        record('PO-000032', '2999-06-01', '/procurement/coming'),
      ],
    },
  ];
  show();
  expect(
    screen.queryByRole('region', { name: 'workbench.work.pendingOrders' }),
  ).toBeNull();
  const purchasing = column('workbench.work.purchasing');
  expect(within(purchasing).getByText('3')).toBeTruthy();
  expect(
    within(purchasing)
      .getAllByText(/^PO-/)
      .map((node) => node.textContent),
  ).toEqual(['PO-000031', 'PO-000030', 'PO-000032']);
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
  const repairs = column('workbench.work.devices');
  const line = within(repairs).getByText(fault);
  // One line, cut by CSS, with nothing to unfold.
  expect(line.className).toContain('truncate');
  expect(
    within(repairs).queryByRole('button', { name: /expand|展开/i }),
  ).toBeNull();
  state.rows = {};
});

it('says whom an overdue device is lent to and when it was due back', () => {
  state.items = [
    {
      key: 'loansDueToday',
      count: 1,
      url: '/devices?status=onLoan',
      records: [
        {
          ...record('DE-000005 / MacBook', '2026-09-28', '/devices/d5'),
          subtitle: 'Zhao Min',
        },
      ],
    },
  ];
  show();
  const loans = column('workbench.work.devices');
  expect(within(loans).getByText('workbench.work.lentTo')).toBeTruthy();
  expect(within(loans).getByText('workbench.work.dueBack')).toBeTruthy();
});

const LONG_NAME = 'Maximiliana Alexandrovna Konstantinopolskaya-Wellington';

it('marks, in the team view, the approvals that wait on the reader', () => {
  state.items = [
    {
      key: 'pendingPurchaseApprovals',
      count: 2,
      url: '/procurement?status=pendingApproval',
      records: [
        { ...record('po-a', '2026-10-01', '/procurement/po-a'), mine: true },
        { ...record('po-b', '2026-10-02', '/procurement/po-b'), mine: false },
      ],
    },
  ];
  state.rows = {
    'itam/purchase-orders': [
      {
        id: 'po-a',
        orderNo: 'PO-000001',
        ownerId: LONG_NAME,
        createdAt: '2026-10-05T21:13:00.000',
      },
      { id: 'po-b', orderNo: 'PO-000002' },
    ],
  };
  show();
  const approvals = column('workbench.work.pendingApprovals');
  // One card says so: the one addressed to this reader.
  expect(
    within(approvals).getAllByText('workbench.work.awaitingYou'),
  ).toHaveLength(1);
  const mine = within(approvals).getByText('PO-000001').closest('button')!;
  const marker = within(mine).getByText('workbench.work.awaitingYou');
  // After the time, on the bottom line, and never the part that is cut.
  const footer = marker.closest('p')!;
  expect(footer.textContent).toMatch(
    /2026-10-05 21:13.*workbench\.work\.awaitingYou/,
  );
  expect(marker.className).toContain('shrink-0');
  // A long name is what gives way.
  expect(
    within(footer).getByText(LONG_NAME).closest('.truncate'),
  ).not.toBeNull();
  state.rows = {};
});

it('leads from the device checks column to MDM 核对, even when it is empty', () => {
  state.items = [
    {
      key: 'deviceChecks',
      count: 0,
      url: '/device-sync',
      records: [],
    },
  ];
  show();
  const checks = column('workbench.work.deviceChecks');
  expect(
    within(checks)
      .getByRole('link', { name: 'workbench.seeAll' })
      .getAttribute('href'),
  ).toBe('/device-sync');
});

it('counts the MDM 核对 tabs its cards are not on, each opening its tab', () => {
  state.items = [
    {
      key: 'deviceChecks',
      count: 0,
      url: '/device-sync',
      records: [],
      summary: { unregistered: 4, unmanaged: 0 },
    },
  ];
  show();
  const checks = column('workbench.work.deviceChecks');
  // The column's count in its heading, and the card's own.
  expect(within(checks).getAllByText('4')).toHaveLength(2);
  expect(
    within(checks)
      .getByText('deviceSync.review.views.unregistered')
      .closest('a')
      ?.getAttribute('href'),
  ).toBe('/device-sync?view=unregistered');
  // An empty tab has no card.
  expect(
    within(checks).queryByText('deviceSync.review.views.unmanaged'),
  ).toBeNull();
  expect(within(checks).queryByText('workbench.nothingPending')).toBeNull();
});

// The differences as one card by kind, as the other two tabs are, rather
// than a card a device (2026-10-22).
it('shows the MDM differences as one card, by kind', () => {
  state.items = [
    {
      key: 'deviceChecks',
      count: 3,
      url: '/device-sync?view=checks',
      records: [record('DE-000001 / SH-LT-001', '2026-09-04', '/devices/d1')],
      summary: { checks: { stale: 2, statusMismatch: 1 }, unmanaged: 1 },
    },
  ];
  show();
  const checks = column('workbench.work.deviceChecks');
  // 3 differences and 1 只在台账.
  expect(within(checks).getByText('4')).toBeInTheDocument();
  expect(
    within(checks)
      .getByText('deviceSync.review.views.checks')
      .closest('a')
      ?.getAttribute('href'),
  ).toBe('/device-sync?view=checks');
  expect(
    within(checks).getByText(
      'deviceSync.checks.kinds.stale 2 · deviceSync.checks.kinds.statusMismatch 1',
    ),
  ).toBeInTheDocument();
  expect(within(checks).queryByText('DE-000001 / SH-LT-001')).toBeNull();
});

it('keeps leavers and joiners in one column, says what waits, and lays the columns out as a list', () => {
  state.items = [
    {
      key: 'leaverRecovery',
      count: 1,
      url: '/people?view=leavers',
      records: [record('陈杰', '2026-10-01', '/people/l')],
    },
    {
      key: 'pendingOnboarding',
      count: 1,
      url: '/people?view=joiners',
      records: [record('孙涵', '2026-10-30', '/people/j')],
    },
  ];
  show();
  const people = column('workbench.work.people');
  // Each card says which it is.
  expect(within(people).getByText('workbench.work.tagLeaving')).toBeTruthy();
  expect(within(people).getByText('workbench.work.tagJoining')).toBeTruthy();
  // The line above the board counts what waits.
  expect(
    screen.getByRole('button', { name: /workbench\.work\.people\s*2/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /workbench\.view\.list/ }));
  expect(column('workbench.work.people').className).not.toContain('min-w-');
});
