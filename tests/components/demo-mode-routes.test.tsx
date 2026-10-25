import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import enUS from '../../client/locales/en-US.js';

afterEach(() => {
  document.getElementById('nocobase-runtime-config')?.remove();
  vi.resetModules();
});

it.each([true, false, undefined])(
  'keeps the demo route and tab aligned for an unrestricted user (enabled: %s)',
  async (enabled) => {
    vi.resetModules();
    const [client, plugins, authorization, fixture] = await Promise.all([
      import('@nocobase/app-client'),
      import('@nocobase/app-client/plugins'),
      import('@nocobase/app-plugin-authorization/client'),
      import('@nocobase/app-testing/client'),
    ]);
    const { apiClientToken } = client;
    const { resolveAppClientContributions } = plugins;
    const { AuthorizationClient, authorizationClientToken } = authorization;
    const { answerApi, renderWithApp } = fixture;
    document.getElementById('nocobase-runtime-config')!.textContent =
      JSON.stringify({
        version: 1,
        config: { app: { basePath: '/main' }, api: { baseURL: '/main/api' } },
        public: enabled === undefined ? {} : { demoMode: { enabled } },
      });
    const { default: routes } = await import('../../client/routes.js');
    const resolved = resolveAppClientContributions([
      { packageName: 'itam', routes, source: 'application' },
    ]);
    const flatten = (rows: typeof resolved.routes): typeof resolved.routes =>
      rows.flatMap((row) => [row, ...flatten(row.children ?? [])]);
    const demo = flatten(resolved.routes).find(
      (route) => route.path === '/settings/demo',
    );
    if (enabled) {
      expect(demo?.authz).toEqual({
        resource: { type: 'settings', id: 'demoMode.data' },
        action: 'read',
      });
      await expect(demo!.componentLoader!()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    } else {
      expect(demo?.name).toBe('itam-settings-sample-data');
      expect(demo?.authz).toEqual({
        resource: { type: 'page', id: 'itam-settings' },
        action: 'access',
      });
      expect(
        flatten(resolved.routes).some(
          (route) => route.name === 'itam-settings-demo',
        ),
      ).toBe(false);
    }
    const { default: SettingsPage } =
      await import('../../client/pages/settings/index.js');
    await renderWithApp(<SettingsPage />, {
      route: '/settings/itam',
      namespace: 'itam',
      namespaces: { itam: enUS },
      fetch: answerApi(({ path }) =>
        path === 'authorization/permissions'
          ? { data: { unrestricted: true, permissions: [] } }
          : new Response(null, { status: 404 }),
      ),
      services: (app) =>
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        ),
    });
    await screen.findByRole('tab', { name: enUS.navigation.settingsGeneral });
    expect(
      await screen.findByRole('tab', { name: enUS.settings.demo.title }),
    ).toBeVisible();
  },
);
