import packageMetadata from '../../package.json' with { type: 'json' };
import { createAuthenticatedClientRenderer } from '../helpers/authenticated-client.js';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import SettingsHomePage from '../../client/pages/settings/settings-home.js';
import { createApplicationRoutes } from '../../client/routes.js';
import { RouteTreeProvider } from '../../client/routing/route-context.js';
import { useRouteNavigation } from '../../client/routing/route-navigation.js';

const renderAuthenticatedClient = createAuthenticatedClientRenderer();

const { routes } = resolveAppClientContributions([
  {
    packageName: packageMetadata.name,
    source: 'application',
    routes: createApplicationRoutes(),
  },
]);

function Shell({ children }: { children: ReactNode }) {
  const { denied, loading } = useRouteNavigation(routes);
  return (
    <RouteTreeProvider routes={routes} access={{ denied, loading }}>
      <Breadcrumbs denied={denied} />
      {children}
    </RouteTreeProvider>
  );
}

function Where() {
  return <output aria-label='Route'>{useLocation().pathname}</output>;
}

function mount(
  options: Parameters<typeof renderAuthenticatedClient>[1] = {},
  route = '/settings',
) {
  return renderAuthenticatedClient(
    <Shell>
      <Routes>
        <Route path='/settings' element={<SettingsHomePage />} />
        <Route path='*' element={<Where />} />
      </Routes>
    </Shell>,
    { route, ...options },
  );
}

// The settings home on ITAM's own routes (template 1.0.0-beta.92,
// 2026-11-10), after the template's checks.
const hrefs = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((card) => card.getAttribute('href'));

it('groups the modules an administrator may open into categories of cards that open by keyboard', async () => {
  const user = userEvent.setup();
  await mount();
  const account = await screen.findByRole('region', {
    name: 'Accounts and permissions',
  });
  expect(hrefs(account)).toEqual([
    '/main/settings/users',
    '/main/settings/roles',
    '/main/settings/api-keys',
  ]);
  expect(
    hrefs(screen.getByRole('region', { name: 'Business configuration' })),
  ).toEqual(['/main/settings/itam', '/main/settings/demo']);
  expect(hrefs(screen.getByRole('region', { name: 'System' }))).toEqual([
    '/main/settings/notifications/templates',
    '/main/settings/scheduled-tasks',
    '/main/settings/database-explorer',
  ]);
  // A card says what its module is for.
  expect(within(account).getAllByRole('link')[0].textContent).toMatch(
    /^Users.+/,
  );
  // No AI category: ITAM's agents live in the sidebar.
  expect(screen.getAllByRole('region')).toHaveLength(3);
  within(account).getAllByRole('link')[1].focus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Route' })).toHaveTextContent(
      '/settings/roles',
    ),
  );
});

it('shows a restricted viewer only what they may open', async () => {
  await mount({
    member: true,
    grants: [
      {
        resource: { type: 'settings', id: 'authorization.permission-sets' },
        actions: [{ action: 'read' }],
      },
    ],
  });
  const account = await screen.findByRole('region', {
    name: 'Accounts and permissions',
  });
  expect(screen.getAllByRole('region')).toHaveLength(1);
  // API keys are everyone's own.
  expect(hrefs(account)).toEqual([
    '/main/settings/roles',
    '/main/settings/api-keys',
  ]);
});

it('leaves a viewer without grants their own API keys', async () => {
  await mount({ member: true, locale: 'zh-CN' });
  const account = await screen.findByRole('region', { name: '账号与权限' });
  expect(hrefs(account)).toEqual(['/main/settings/api-keys']);
  expect(screen.getByRole('heading', { name: '系统设置' })).toBeVisible();
});

it('links the Settings breadcrumb back to the home from a module view', async () => {
  await mount({}, '/settings/roles');
  const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
  expect(
    await within(trail).findByRole('link', { name: 'System settings' }),
  ).toHaveAttribute('href', '/main/settings');
});
