import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { expect, it, vi } from 'vitest';

import { RecordDrawerProvider } from '../../client/components/itam/record-drawer.js';
import { RecordLink } from '../../client/components/itam/record-link.js';
import type { ItamRecord } from '../../client/lib/itam/api.js';
import { useOpenRecord } from '../../client/lib/itam/record-drawer.js';
import { recordTarget } from '../../client/lib/itam/record-view.js';

const records: Record<string, ItamRecord> = {
  c1: {
    id: 'c1',
    disposalNo: 'DP-001',
    method: 'recycle',
    vendorId: 'v1',
    status: 'draft',
  },
  v1: { id: 'v1', name: 'Acme', type: 'service' },
};
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useItamRecord: (_path: string, id: string) => ({ data: records[id] }),
  useItamList: () => ({ data: undefined }),
}));
// Stand-in detail pages: the drawer mounts whatever page the route table
// names for a segment, with that page's tabs as child routes.
vi.mock('../../client/lib/itam/record-pages.js', async () => {
  const { Link, NavLink, Outlet, useParams } = await import('react-router');
  const { RecordLink: Reference } =
    await import('../../client/components/itam/record-link.js');
  function DisposalPage(): React.JSX.Element {
    const { id } = useParams();
    return (
      <div>
        <h2>Disposal page {id}</h2>
        <NavLink to='devices'>Devices tab</NavLink>
        <Reference to='/vendors/v1'>Acme</Reference>
        <Link to='/disposals'>All disposals</Link>
        <Outlet />
      </div>
    );
  }
  function DevicesTab(): React.JSX.Element {
    return <p>Devices content</p>;
  }
  const { DetailPage } =
    await import('../../client/components/itam/detail-page.js');
  function VendorPage(): React.JSX.Element {
    const { id } = useParams();
    return (
      <DetailPage
        breadcrumb={<span>Vendors crumb</span>}
        title={`Vendor page ${String(id)}`}
        info={null}
        tabs={[]}
      />
    );
  }
  return {
    recordPage: (segment: string) =>
      segment === 'disposals'
        ? {
            Detail: DisposalPage,
            tabs: [{ path: 'devices', Component: DevicesTab }],
          }
        : segment === 'vendors'
          ? { Detail: VendorPage, tabs: [] }
          : undefined,
  };
});
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({ vendors: new Map([['v1', 'Acme']]) }),
}));

function Page(): React.JSX.Element {
  const location = useLocation();
  const openRecord = useOpenRecord();
  return (
    <div>
      <output data-testid='pathname'>{location.pathname}</output>
      <RecordLink to='/disposals/c1'>Laptop disposal</RecordLink>
      <RecordLink to='/disposals/c1/devices'>Disposal devices</RecordLink>
      <RecordLink to='/disposals/c1' drawer={false}>
        Full disposal
      </RecordLink>
      <div role='row' onClick={() => openRecord('/procurement/p2')}>
        <RecordLink to='/vendors/v1'>Row vendor</RecordLink>
      </div>
      <button type='button' onClick={() => openRecord('/vendors/v1')}>
        Vendor row
      </button>
      <button type='button' onClick={() => openRecord('/reports?tab=x')}>
        Reports
      </button>
    </div>
  );
}
function show(withDrawer = true) {
  const page = withDrawer ? (
    <RecordDrawerProvider>
      <Page />
    </RecordDrawerProvider>
  ) : (
    <Page />
  );
  return render(
    <MemoryRouter initialEntries={['/procurement/p1/lines']}>
      <Routes>
        <Route path='/procurement/:id/*' element={page} />
        <Route path='*' element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}
const pathname = () => screen.getByTestId('pathname').textContent;

it('resolves record links to their collection and rejects everything else', () => {
  expect(recordTarget('/disposals/c1')).toMatchObject({
    collection: 'disposals',
    path: 'itam/disposals',
    id: 'c1',
  });
  expect(recordTarget('/accessories/s1?from=x')).toMatchObject({
    collection: 'stockItems',
    i18n: 'accessories',
  });
  expect(recordTarget('/software-products/sp1')).toMatchObject({
    collection: 'softwareProducts',
    path: 'itam/master/softwareProducts',
  });
  expect(recordTarget('/procurement')).toBeUndefined();
  expect(recordTarget('/devices/d1/history')).toBeUndefined();
  expect(recordTarget('/reports')).toBeUndefined();
  expect(recordTarget('/unknown/x')).toBeUndefined();
});

it('opens a linked record on its own detail page in the drawer without leaving the page', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  const drawer = screen.getByRole('dialog', {
    name: 'DP-001',
  });
  expect(within(drawer).getByText('Disposal page c1')).toBeVisible();
  expect(pathname()).toBe('/procurement/p1/lines');
  expect(
    within(drawer).queryByRole('button', { name: 'common.back' }),
  ).toBeNull();
  // Nor the page's own way back: inside a drawer there is no page before.
  expect(
    within(drawer).queryByRole('button', { name: 'common.backPrevious' }),
  ).toBeNull();
});

it('switches the page tabs inside the drawer without moving the page behind it', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  const drawer = screen.getByRole('dialog');
  fireEvent.click(within(drawer).getByRole('link', { name: 'Devices tab' }));
  expect(within(drawer).getByText('Devices content')).toBeVisible();
  expect(pathname()).toBe('/procurement/p1/lines');
});

it('opens the full page on the tab the drawer shows and closes it', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  const drawer = screen.getByRole('dialog');
  fireEvent.click(within(drawer).getByRole('link', { name: 'Devices tab' }));
  fireEvent.click(
    within(drawer).getByRole('button', { name: 'common.openFullPage' }),
  );
  expect(pathname()).toBe('/disposals/c1/devices');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it("puts the page's line above its title in the drawer's top row", () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Vendor row' }));
  const drawer = screen.getByRole('dialog');
  // Beside 打开完整页面, not on a line of its own under it (2026-10-22).
  const row = within(drawer).getByRole('button', {
    name: 'common.openFullPage',
  }).parentElement!;
  expect(within(row).getByText('Vendors crumb')).toBeVisible();
  expect(within(drawer).getAllByText('Vendors crumb')).toHaveLength(1);
});

it('hands a link that leaves the record to the page and closes the drawer', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('link', {
      name: 'All disposals',
    }),
  );
  expect(pathname()).toBe('/disposals');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('stacks a record opened from inside the drawer and goes back', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('link', { name: 'Acme' }),
  );
  const drawer = screen.getByRole('dialog', { name: 'Acme' });
  expect(within(drawer).getByText('Vendor page v1')).toBeVisible();
  fireEvent.click(within(drawer).getByRole('button', { name: 'common.back' }));
  expect(
    within(screen.getByRole('dialog', { name: 'DP-001' })).getByText(
      'Disposal page c1',
    ),
  ).toBeVisible();
  expect(pathname()).toBe('/procurement/p1/lines');
});

it('leaves modified clicks, opted-out links and non-record paths to the router', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }), {
    metaKey: true,
  });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pathname()).toBe('/procurement/p1/lines');
  fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pathname()).toBe('/reports');
});

it('opens rows through useOpenRecord and navigates a link that opted out', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Vendor row' }));
  expect(screen.getByRole('dialog', { name: 'Acme' })).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'common.openFullPage',
    }),
  );
  fireEvent.click(screen.getByRole('link', { name: 'Full disposal' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pathname()).toBe('/disposals/c1');
});

it('lets a link inside a clickable row open without the row following', () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Row vendor' }));
  expect(screen.getByRole('dialog', { name: 'Acme' })).toBeVisible();
  expect(pathname()).toBe('/procurement/p1/lines');
});

it('navigates as an ordinary link outside a detail page', () => {
  show(false);
  fireEvent.click(screen.getByRole('link', { name: 'Laptop disposal' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(pathname()).toBe('/disposals/c1');
  fireEvent.click(screen.getByRole('button', { name: 'Vendor row' }));
  expect(pathname()).toBe('/vendors/v1');
});

it("opens a link that names a record's tab in the drawer, on that tab", () => {
  show();
  fireEvent.click(screen.getByRole('link', { name: 'Disposal devices' }));
  const drawer = screen.getByRole('dialog');
  expect(within(drawer).getByText('Devices content')).toBeVisible();
  // The page behind stays where it was (2026-10-22: it navigated).
  expect(pathname()).toBe('/procurement/p1/lines');
});
