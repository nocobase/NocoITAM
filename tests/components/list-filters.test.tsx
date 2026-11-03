import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ItamRecord, ListQuery } from '../../client/lib/itam/api.js';
import type { DomainConfig } from '../../client/lib/itam/domain.js';
import { DomainListPage } from '../../client/pages/itam/domain-list.js';

// Every list filters through the Filters menu in its header, its values in
// the address (2026-11-03, after NocoSupport's lists).

const state = vi.hoisted(() => ({
  lists: [] as { path: string; query: ListQuery }[],
  requests: [] as { path: string; query?: Record<string, unknown> }[],
}));

vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: false, isPending: false }),
}));
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
    request: (input: { path: string; query?: Record<string, unknown> }) => {
      state.requests.push(input);
      const rows: ItamRecord[] = [
        { id: 'v1', name: 'Acme' },
        { id: 'v2', name: 'Globex' },
      ];
      const q = String(input.query?.q ?? '').toLowerCase();
      const data = rows.filter((row) =>
        String(row.name).toLowerCase().includes(q),
      );
      return Promise.resolve({ data, total: data.length, page: 1 });
    },
  }),
  useItamList: (path: string, query: ListQuery) => {
    state.lists.push({ path, query });
    return { data: { data: [], total: 0 }, isFetching: false };
  },
  useItamSettings: () => ({ data: undefined }),
  useItamMutations: () => ({ create: {}, remove: {} }),
  useDeleteImpact: () => ({}),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({}),
  useCurrentUserId: () => 'u1',
}));
// The applied vendor's name before the menu has read any.
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({ vendors: new Map([['v1', 'Acme']]) }),
}));
vi.mock('../../client/components/itam/import-export.js', () => ({
  ImportExport: () => null,
}));
vi.mock('../../client/components/itam/data-table.js', () => ({
  DataTable: () => null,
}));
vi.mock('../../client/components/itam/record-form-dialog.js', () => ({
  RecordFormDialog: () => null,
}));
vi.mock('../../client/components/itam/delete-dialog.js', () => ({
  DeleteDialog: () => null,
}));

const DOMAIN: DomainConfig = {
  name: 'disposals',
  path: 'itam/disposals',
  route: 'disposals',
  i18n: 'disposals',
  nameField: 'disposalNo',
  fields: [
    { key: 'disposalNo', label: 'fields.no', type: 'text', column: true },
    {
      key: 'method',
      label: 'fields.method',
      type: 'select',
      column: true,
      options: [
        { value: 'scrap', label: 'enums.scrap' },
        { value: 'sell', label: 'enums.sell' },
      ],
    },
    {
      key: 'vendorId',
      label: 'fields.vendor',
      type: 'reference',
      column: true,
      reference: { collection: 'vendors' },
    },
  ],
  filterFields: ['method', 'vendorId'],
};

function Address(): ReactElement {
  return <output aria-label='address'>{useLocation().search}</output>;
}

function land(search = '') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/disposals${search}`]}>
        <Routes>
          <Route
            path='/disposals'
            element={
              <>
                <DomainListPage domain={DOMAIN} />
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
const lastFilter = () => state.lists.at(-1)?.query.filter ?? {};

async function openDimension(label: string) {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /^listFilters\.filters/ }),
  );
  await user.click(await screen.findByRole('menuitem', { name: label }));
}

beforeEach(() => {
  state.lists = [];
  state.requests = [];
});

it('puts a chosen value in the address and its chip takes it out', async () => {
  land('?page=3');
  await openDimension('fields.method');
  // jsdom has no submenu geometry for the pointer safe corridor.
  fireEvent.click(
    await screen.findByRole('menuitemradio', { name: 'enums.scrap' }),
  );

  // A filter starts the list from its first page.
  await waitFor(() => expect(address()).toHaveTextContent('?method=scrap'));
  expect(lastFilter()).toMatchObject({ method: 'scrap' });
  await userEvent.keyboard('{Escape}{Escape}');

  fireEvent.click(
    screen.getByRole('button', {
      name: 'listFilters.removeFilter:fields.method',
    }),
  );
  await waitFor(() => expect(address()).toBeEmptyDOMElement());
  expect(lastFilter().method).toBeUndefined();
});

it('reads a reference only once the menu opens, searched by its box', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    land();
    expect(state.requests).toHaveLength(0);
    await openDimension('fields.vendor');
    expect(
      await screen.findByRole('menuitemradio', { name: 'Globex' }),
    ).toBeInTheDocument();
    expect(state.requests[0]?.path).toBe('itam/master/vendors');

    fireEvent.change(
      screen.getByRole('textbox', { name: 'listFilters.searchIn' }),
      { target: { value: 'ac' } },
    );
    await act(() => vi.advanceTimersByTimeAsync(300));
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitemradio', { name: 'Globex' }),
      ).not.toBeInTheDocument(),
    );
    expect(state.requests.at(-1)?.query).toMatchObject({ q: 'ac' });

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Acme' }));
    await waitFor(() => expect(address()).toHaveTextContent('?vendorId=v1'));
  } finally {
    vi.useRealTimers();
  }
});

it('clears every filter, the keyword included', async () => {
  land('?q=lap&method=sell&vendorId=v1&page=2');
  // The applied ones show as chips from the address, the vendor by name.
  expect(screen.getByText('lap')).toBeInTheDocument();
  expect(screen.getByText('enums.sell')).toBeInTheDocument();
  expect(screen.getByText('Acme')).toBeInTheDocument();
  expect(lastFilter()).toMatchObject({ method: 'sell', vendorId: 'v1' });

  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'listFilters.filtersApplied:3' }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: 'listFilters.clear' }),
  );
  await waitFor(() => expect(address()).toBeEmptyDOMElement());
  expect(screen.queryByText('Acme')).not.toBeInTheDocument();
});
