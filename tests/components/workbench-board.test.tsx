import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import WorkbenchPage from '../../client/pages/itam/workbench.js';
import type {
  DoneWorkRecord,
  MyWorkItem,
} from '../../client/lib/itam/workbench.js';

const state = vi.hoisted(() => ({
  items: [] as MyWorkItem[],
  done: [] as DoneWorkRecord[],
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
  useDoneWork: () => ({ data: state.done }),
  useReminders: () => ({ data: [], isLoading: false }),
}));
vi.mock('../../client/lib/itam/api.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/api.js',
  )),
  useItamSettings: () => ({ data: undefined }),
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
  state.done = [];
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
  state.done = [];
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

it('folds what was finished lately under its own column, unless it waits again', () => {
  state.items = [
    {
      key: 'activeRepairs',
      count: 1,
      url: '/repairs?result=inProgress',
      records: [record('RP-000002', '2026-10-20', '/repairs/r2')],
    },
  ];
  state.done = [
    {
      ...record('RP-000001', '2026-10-01', '/repairs/r1'),
      key: 'activeRepairs',
      doneAt: '2026-10-04T10:00:00.000',
    },
    {
      ...record('RP-000002', '2026-10-01', '/repairs/r2'),
      key: 'activeRepairs',
      doneAt: '2026-10-03T10:00:00.000',
    },
  ];
  show();
  const repairs = column('workbench.work.activeRepairs');
  // Folded by default: the count, not the cards.
  const toggle = within(repairs).getByRole('button', {
    name: /workbench\.work\.done/,
  });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(within(repairs).queryByText('RP-000001')).toBeNull();
  fireEvent.click(toggle);
  // The same card as a waiting one, tagged as a repair; the one waiting
  // again is not listed twice.
  expect(within(repairs).getByText('RP-000001')).toBeTruthy();
  expect(within(repairs).getAllByText('RP-000002')).toHaveLength(1);
  fireEvent.click(within(repairs).getByText('RP-000001'));
  expect(state.opened).toHaveBeenCalledWith('/repairs/r1');
});
