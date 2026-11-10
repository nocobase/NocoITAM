import { afterEach, expect, it, vi } from 'vitest';
import enUS from '../../client/locales/en-US.js';

vi.mock('#hooks/use-mobile', () => ({ useIsMobile: () => false }));

afterEach(() => {
  document.getElementById('nocobase-runtime-config')?.remove();
  vi.resetModules();
});

it.each([true, false, undefined])(
  'keeps the demo route and its settings card aligned (enabled: %s)',
  async (enabled) => {
    vi.resetModules();
    const plugins = await import('@nocobase/app-client/plugins');
    const { resolveAppClientContributions } = plugins;
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
    // The demo data's card sits in 业务配置 on the settings home (template
    // 1.0.0-beta.92, 2026-11-10), its route the one checked above either way.
    const { buildSettingsCatalog } =
      await import('../../client/routing/route-navigation.js');
    const business = buildSettingsCatalog(resolved.routes, new Set()).find(
      ({ route }) => route.name === 'settingsBusiness',
    );
    expect(
      business?.modules.find(({ target }) => target.path === '/settings/demo')
        ?.route.navigation?.title,
    ).toBe('settings.demo.title');
    expect(enUS.settings.demo.title).toBeTruthy();
  },
);
