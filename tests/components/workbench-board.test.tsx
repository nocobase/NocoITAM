import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import WorkbenchPage from '../../client/pages/itam/workbench.js';
import type { MyWorkItem } from '../../client/lib/itam/workbench.js';
import { setWorkScope } from '../../client/lib/itam/work-scope.js';

const state = vi.hoisted(() => ({
  items: [] as MyWorkItem[],
  /** Full rows per list path, as the board cards read them; none by default. */
  rows: {} as Record<string, Record<string, unknown>[]>,
  /** 需要关注's rules; none found by default. */
  reminders: [] as Record<string, unknown>[],
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
  useReminders: () => ({ data: state.reminders, isLoading: false }),
}));
vi.mock('../../client/lib/itam/api.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/api.js',
  )),
  useItamSettings: () => ({ data: undefined }),
  useApi: () => ({ request: async () => ({ data: {} }) }),
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
vi.mock('../../client/lib/itam/permissions.js', async (original) => ({
  ...(await original<object>()),
  useCurrentUserId: () => 'u1',
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
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <WorkbenchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const column = (label: string) => screen.getByRole('region', { name: label });

it('lays the to-dos out as columns, 需要关注 first, and opens a record in the drawer', () => {
  state.reminders = [
    {
      kind: 'idleDevice',
      count: 1,
      severity: 'info',
      preview: [{ label: 'SH-LT-007' }],
    },
  ];
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
    // 借出逾期 a column of its own again, before 采购中 (2026-10-22), where
    // 待到货入库 reads, the column it shares with 待下单.
    'workbench.work.loansDueToday',
    'workbench.work.purchasing',
  ]);
  // An empty column stays, dimmed, and says so.
  const loans = column('workbench.work.loansDueToday');
  expect(within(loans).getByText('workbench.nothingPending')).toBeTruthy();
  expect(loans.className).toContain('opacity-60');
  fireEvent.click(screen.getByText('PO-000020'));
  expect(state.opened).toHaveBeenCalledWith('/procurement/a');
  state.reminders = [];
});

// Nothing at risk, no band; a rule that found nothing is not listed
// (2026-10-22).
it('leaves 需要关注 out when no rule found anything', () => {
  state.reminders = [
    { kind: 'idleDevice', count: 0, severity: 'info', preview: [] },
  ];
  state.items = [];
  show();
  expect(
    screen.queryByRole('region', { name: 'workbench.attention' }),
  ).toBeNull();
  state.reminders = [];
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
  const repairs = column('workbench.work.activeRepairs');
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
  const loans = column('workbench.work.loansDueToday');
  expect(within(loans).getByText('workbench.work.lentTo')).toBeTruthy();
  expect(within(loans).getByText('workbench.work.dueBack')).toBeTruthy();
  // How many days past it (2026-10-22).
  expect(
    within(loans).getByText('workbench.work.loanOverdueDays'),
  ).toBeTruthy();
});

const LONG_NAME = 'Maximiliana Alexandrovna Konstantinopolskaya-Wellington';

it('marks the approvals that wait on the reader once, with the tag the list uses', () => {
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
        awaitingMe: true,
      },
      { id: 'po-b', orderNo: 'PO-000002' },
    ],
  };
  setWorkScope('all');
  show();
  const approvals = column('workbench.work.pendingApprovals');
  // One card says so, the one addressed to this reader, and only once: the
  // 待你审批 at its foot repeated the tag (2026-10-22).
  expect(within(approvals).getAllByText('common.awaitingMe')).toHaveLength(1);
  expect(
    within(approvals).queryByText('workbench.work.awaitingYou'),
  ).toBeNull();
  const mine = within(approvals).getByText('PO-000001').closest('button')!;
  within(mine).getByText('common.awaitingMe');
  // A long name on the bottom line is what gives way, never the time.
  const footer = within(mine).getByText(LONG_NAME).closest('p')!;
  expect(footer.textContent).toMatch(/2026-10-05 21:13/);
  expect(
    within(footer).getByText(LONG_NAME).closest('.truncate'),
  ).not.toBeNull();
  state.rows = {};
  setWorkScope('mine');
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
      .getByRole('link', { name: 'workbench.seeDetails' })
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

it('says on a joiner’s card what is still to buy, red past its last order day', () => {
  state.items = [
    {
      key: 'pendingOnboarding',
      count: 2,
      url: '/people?view=joiners',
      records: [
        {
          ...record('孙涵', '2099-10-30', '/people/a'),
          progress: { done: 1, total: 8 },
          shortfall: 1,
          orderOverdue: true,
        },
        {
          ...record('林雪', '2099-11-30', '/people/b'),
          progress: { done: 0, total: 7 },
          shortfall: 2,
        },
      ],
    },
  ];
  show();
  const people = column('workbench.work.people');
  // The column heading buys nothing (2026-10-23).
  expect(within(people).queryByText(/draftAll|supplyDemand/)).toBeNull();
  const late = within(people).getByText(
    'onboarding.shortfall · onboarding.orderNow',
  );
  expect(late.className).toContain('text-destructive');
  expect(
    within(people).getByText('onboarding.shortfallTotal').className,
  ).not.toContain('text-destructive');
});
