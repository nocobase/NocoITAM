import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import PermissionSetsPage from '../../client/pages/settings/permission-sets/index.js';
import PermissionSetRoute from '../../client/pages/settings/permission-sets/detail/index.js';
import PermissionsDrawer from '../../client/pages/settings/permission-sets/detail/permissions.js';
import PermissionsArea from '../../client/pages/settings/permission-sets/detail/area.js';

// Settings → Permission sets: each row opens the set's permissions and its
// members in drawers over the list; the permissions drawer shows three areas
// as tabs over one draft.

const set = {
  key: 'itam-asset-manager',
  title: 'Asset manager',
  unrestricted: false,
  grants: [
    {
      resource: { type: 'page', id: 'home' },
      actions: [{ action: 'access' }],
    },
  ],
};
const text = (value: string) => ({ key: value, ns: 'test' });
const options = {
  recordAccess: [],
  sections: [
    {
      name: 'pages',
      title: text('Pages'),
      order: 1,
      subsections: [
        {
          name: 'pages',
          title: text('Pages'),
          recordType: { type: 'page', actions: [] },
          resources: [],
        },
      ],
    },
    {
      name: 'business',
      title: text('Business'),
      order: 2,
      subsections: [
        {
          name: 'itam',
          title: text('ITAM'),
          resources: [
            {
              type: 'composite',
              id: 'itam.devices',
              title: text('Devices'),
              actions: [{ name: 'export', title: text('Export') }],
            },
          ],
        },
        {
          name: 'agents',
          title: text('Agent team'),
          resources: [
            {
              type: 'composite',
              id: 'agents.agents',
              title: text('Agents'),
              actions: [{ name: 'update', title: text('Change') }],
            },
          ],
        },
      ],
    },
    {
      name: 'administration',
      title: text('Administration'),
      order: 3,
      subsections: [],
    },
  ],
};
const server = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
  // What the API client throws, carrying the status.
  ApiClientError: class extends Error {
    constructor(readonly status: number) {
      super(`status ${String(status)}`);
    }
  },
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => ({
    getPermissionSet: server.get,
    updatePermissionSet: server.update,
    invalidate: vi.fn(),
  }),
}));
// The guard the drawer registers; the application's provider asks it on
// every navigation.
const guard = vi.hoisted(() => ({
  current: undefined as (() => boolean) | undefined,
}));
vi.mock('@nocobase/app-client', () => ({
  ApiClientError: server.ApiClientError,
  useToaster: () => ({ show: server.toast }),
  usePageBreadcrumb: vi.fn(),
  useNavigationGuard: (check: () => boolean) => {
    guard.current = check;
  },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ refresh: vi.fn() }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    i18n: { language: 'en-US' },
  }),
}));
vi.mock('../../client/pages/settings/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAdminText: () => ({
    text: (key: string, values?: { name?: string }) =>
      values?.name ? `${key}:${values.name}` : key,
    language: 'en-US',
  }),
  useLocalized:
    () =>
    (value: { key?: string } | undefined, fallback = '') =>
      value?.key ?? fallback,
}));
vi.mock(
  '../../client/pages/settings/permission-sets/data.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    usePermissionSets: () => ({ data: [set] }),
    usePermissionSet: () => ({ data: set, error: null }),
    useOptions: () => ({ data: options, error: null }),
    useGrantablePages: () => [
      { id: 'home', label: 'Overview' },
      { id: 'devices', label: 'Devices' },
    ],
    usePermissionSetsKey: () => ['permissionSets'],
    useMembers: () => ({ data: { assignments: [], users: [] } }),
    useSetActions: () => () => true,
    useSetTitle: () => (value: { title: string }) => value.title,
  }),
);
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

function Where(): ReactElement {
  const location = useLocation();
  return <p data-testid='where'>{location.pathname + location.search}</p>;
}

function at(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path='/settings/permission-sets'
          element={<PermissionSetsPage />}
        >
          <Route path=':setKey' element={<PermissionSetRoute />}>
            <Route path='permissions' element={<PermissionsDrawer />}>
              <Route path=':section' element={<PermissionsArea />} />
            </Route>
            <Route path='members' element={<p>members drawer</p>} />
          </Route>
        </Route>
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const where = () => screen.getByTestId('where').textContent;

it("gives each row its Permissions and Members, keeping the list's search", () => {
  at('/settings/permission-sets?q=sales');
  expect(
    screen
      .getByRole('button', { name: 'sets.permissionsOf:Asset manager' })
      .getAttribute('href'),
  ).toBe(
    '/settings/permission-sets/itam-asset-manager/permissions/pages?q=sales',
  );
  expect(
    screen
      .getByRole('button', { name: 'sets.membersOf:Asset manager' })
      .getAttribute('href'),
  ).toBe('/settings/permission-sets/itam-asset-manager/members?q=sales');
});

it("opens a set's address, and an unknown area, on Pages over the list", async () => {
  at('/settings/permission-sets/itam-asset-manager?q=sales');
  await waitFor(() =>
    expect(where()).toBe(
      '/settings/permission-sets/itam-asset-manager/permissions/pages?q=sales',
    ),
  );
  // The list stays behind the drawer.
  expect(screen.getByText('sets.title')).toBeTruthy();
});

it('sends an address naming no area to Pages', async () => {
  at('/settings/permission-sets/itam-asset-manager/permissions/edit');
  await waitFor(() =>
    expect(where()).toBe(
      '/settings/permission-sets/itam-asset-manager/permissions/pages',
    ),
  );
});

it('keeps one draft across the areas, marking the area changed', async () => {
  at('/settings/permission-sets/itam-asset-manager/permissions/pages');
  const tabs = await screen.findByRole('navigation', {
    name: 'sets.permissionsOf:Asset manager',
  });
  // An area of one section shows no heading repeating its tab.
  expect(screen.queryByRole('button', { name: 'Pages' })).toBeNull();
  const tasks = screen.getByRole('switch', { name: 'Devices' });
  expect(tasks.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(tasks);
  expect(
    screen.getByText('sets.unsaved', { selector: '.sr-only' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'sets.headings.business' }));
  await waitFor(() =>
    expect(where()).toBe(
      '/settings/permission-sets/itam-asset-manager/permissions/business',
    ),
  );
  // The tab passed the guard although there are unsaved changes.
  expect(screen.getByRole('button', { name: 'ITAM' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Agent team' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: /sets\.headings\.pages/ }));
  await waitFor(() =>
    expect(
      screen
        .getByRole('switch', { name: 'Devices' })
        .getAttribute('aria-checked'),
    ).toBe('true'),
  );
  expect(tabs).toBeTruthy();
  // The provider asks on every navigation: the tab's own passes once, and
  // leaving any other way with the draft unsaved asks first.
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  expect(guard.current?.()).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  expect(guard.current?.()).toBe(false);
  expect(confirm).toHaveBeenCalledWith('sets.leaveConfirm');
  confirm.mockRestore();
});

it('shows nothing to grant in an empty area', async () => {
  at('/settings/permission-sets/itam-asset-manager/permissions/administration');
  expect(await screen.findByText('sets.areaEmptyTitle')).toBeTruthy();
});

beforeEach(() => {
  server.get.mockReset();
  server.update.mockReset();
  server.toast.mockReset();
});

async function changeTasks(): Promise<void> {
  at('/settings/permission-sets/itam-asset-manager/permissions/pages');
  fireEvent.click(await screen.findByRole('switch', { name: 'Devices' }));
}

it('saves the whole set and stays open, clean', async () => {
  server.get.mockResolvedValue(set);
  server.update.mockImplementation((_key: string, body: { grants: unknown }) =>
    Promise.resolve({ ...set, grants: body.grants }),
  );
  await changeTasks();
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() =>
    expect(server.toast).toHaveBeenCalledWith({
      type: 'success',
      title: 'sets.toasts.saved:Asset manager',
    }),
  );
  const [, body] = server.update.mock.calls[0] as [
    string,
    { grants: { resource: { id: string } }[] },
  ];
  expect(body.grants.map((grant) => grant.resource.id).sort()).toEqual([
    'devices',
    'home',
  ]);
  expect(where()).toBe(
    '/settings/permission-sets/itam-asset-manager/permissions/pages',
  );
  expect(
    screen
      .getByRole('button', { name: 'common.save' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'sets.discard' })).toBeNull();
});

it('writes nothing over a set someone changed meanwhile', async () => {
  server.get.mockResolvedValue({ ...set, grants: [] });
  await changeTasks();
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(await screen.findByText('sets.stale')).toBeTruthy();
  expect(server.update).not.toHaveBeenCalled();
});

it('says a set deleted meanwhile is gone, with the way back', async () => {
  server.get.mockRejectedValue(new server.ApiClientError(404));
  await changeTasks();
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  const back = await screen.findByRole('button', { name: 'common.backToList' });
  expect(back.getAttribute('href')).toBe('/settings/permission-sets');
  expect(screen.queryByRole('button', { name: 'common.save' })).toBeNull();
});
