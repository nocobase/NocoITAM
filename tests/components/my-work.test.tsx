import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import { MyWork } from '../../client/components/itam/my-work.js';
import type { MyWorkItem } from '../../client/lib/itam/workbench.js';

const state = vi.hoisted(() => ({
  items: [] as MyWorkItem[],
  opened: vi.fn(),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/workbench.js', async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    '../../client/lib/itam/workbench.js',
  )),
  useMyWork: () => ({ data: state.items }),
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
      <MyWork />
    </MemoryRouter>,
  );

it('renders one card per to-do and opens a record in the drawer', () => {
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
  // A to-do with nothing waiting says so rather than listing nothing.
  expect(screen.getByText('workbench.nothingPending')).toBeTruthy();
  fireEvent.click(screen.getByText('PO-000020'));
  expect(state.opened).toHaveBeenCalledWith('/procurement/a');
});

it('shows both kinds of approval on one card, each tagged', () => {
  state.items = [
    {
      key: 'pendingPurchaseApprovals',
      count: 1,
      url: '/procurement?view=myApproval',
      records: [record('PO-000019', '2026-10-19', '/procurement/p')],
    },
    {
      key: 'pendingDisposalApprovals',
      count: 6,
      url: '/disposals?view=myApproval',
      records: [
        record('DP-000001', '2026-09-01', '/disposals/d1'),
        record('DP-000002', '2026-09-02', '/disposals/d2'),
        record('DP-000003', '2026-09-03', '/disposals/d3'),
        record('DP-000004', '2026-09-04', '/disposals/d4'),
        record('DP-000005', '2026-09-05', '/disposals/d5'),
      ],
    },
  ];
  show();
  // One card, counting both kinds.
  const card = screen.getByText('workbench.work.pendingApprovals').closest('div')
    ?.parentElement as HTMLElement;
  expect(within(card).getByText('7')).toBeTruthy();
  // Oldest first across both kinds, capped at the preview, so the purchase
  // order due furthest out falls off the end of the disposals.
  expect(screen.queryByText('PO-000019')).toBeNull();
  expect(screen.getByText('DP-000005')).toBeTruthy();
  expect(screen.getAllByText('workbench.work.tagDisposal').length).toBe(5);
  // Only the kind that overflows offers its own list.
  const links = screen.getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/disposals?view=myApproval',
  ]);
});

it('renders nothing when no to-do applies to the reader', () => {
  state.items = [];
  const { container } = show();
  expect(container.innerHTML).toBe('');
});
