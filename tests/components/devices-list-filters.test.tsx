import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ListQuery } from '../../client/lib/itam/api.js';
import DevicesListPage from '../../client/pages/itam/devices/devices-list.js';

// The device list filters through the same Filters menu as every other list
// (2026-11-03); its 型号 filter reaches the request, which it did not before.

const state = vi.hoisted(() => ({
  phone: false,
  lists: [] as { path: string; query: ListQuery }[],
}));

vi.mock('#hooks/use-mobile', () => ({ useIsMobile: () => state.phone }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options
        ? `${key}:${String(options.count)}`
        : options && 'name' in options
          ? `${key}:${String(options.name)}`
          : key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useApi: () => ({
    request: () => Promise.resolve({ data: [], total: 0, page: 1 }),
  }),
  useItamList: (path: string, query: ListQuery) => {
    state.lists.push({ path, query });
    return { data: { data: [], total: 0 }, isFetching: false };
  },
}));
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({ models: new Map([['m1', 'ThinkPad X1']]) }),
}));
vi.mock('../../client/lib/itam/device-sync.js', () => ({
  useDeviceReview: () => ({ data: undefined }),
}));
vi.mock('../../client/components/itam/import-export.js', () => ({
  ImportExport: () => null,
}));
vi.mock('../../client/components/itam/data-table.js', () => ({
  DataTable: () => null,
}));
vi.mock('../../client/components/itam/device-create-dialog.js', () => ({
  DeviceCreateDialog: () => null,
}));

function Address(): ReactElement {
  return <output aria-label='address'>{useLocation().search}</output>;
}

function land(search = '') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/devices${search}`]}>
        <Routes>
          <Route
            path='/devices'
            element={
              <>
                <DevicesListPage />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const address = () => screen.getByRole('status', { name: 'address' });
const lastFilter = () =>
  state.lists.filter((list) => list.path === 'itam/devices').at(-1)?.query
    .filter ?? {};

beforeEach(() => {
  state.lists = [];
});

// A phone reads the table (2026-11-03), even from an address asking for the
// board: a column of it took two thirds of the screen.
it('has no board and no switch to it on a phone', () => {
  state.phone = true;
  land('?layout=board');
  expect(
    screen.queryByRole('radio', { name: 'common.boardLayout' }),
  ).toBeNull();
  expect(state.lists.at(-1)?.query.pageSize).not.toBe(1);
  state.phone = false;
});

it('filters by status from the menu and drops it through its chip', async () => {
  land();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'listFilters.filters' }));
  await user.click(
    await screen.findByRole('menuitem', { name: 'fields.status' }),
  );
  fireEvent.click(
    await screen.findByRole('menuitemradio', {
      name: 'enums.deviceStatus.inStock',
    }),
  );
  await waitFor(() => expect(address()).toHaveTextContent('?status=inStock'));
  expect(lastFilter()).toMatchObject({ status: 'inStock' });
  await userEvent.keyboard('{Escape}{Escape}');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'listFilters.removeFilter:fields.status',
    }),
  );
  await waitFor(() => expect(address()).toBeEmptyDOMElement());
});

it('sends the model filter and clears every filter, the keyword included', async () => {
  land('?q=x1&modelId=m1&status=assigned');
  expect(lastFilter()).toMatchObject({ modelId: 'm1', status: 'assigned' });
  expect(screen.getByText('ThinkPad X1')).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'listFilters.filtersApplied:3' }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: 'listFilters.clear' }),
  );
  await waitFor(() => expect(address()).toBeEmptyDOMElement());
});
