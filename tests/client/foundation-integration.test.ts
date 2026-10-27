import { describe, expect, it } from 'vitest';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import appRuntime from '../../client/runtime.js';
import cliPlugins from '../../cli/plugins.js';
import serverPlugins from '../../server/plugins.js';
import { buildRouteNavigation } from '../../client/routing/route-navigation.js';

// Application change (ITAM): 设置 is one page with tabs of its own, in a
// 系统设置 group named `settings` (2026-10-22), which Foundation's page
// joins for an unrestricted administrator.
describe('default Foundation integration', () => {
  it('registers the Foundation deployment evidence build hook', () => {
    expect(
      cliPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });
  it('puts Foundation in 系统设置 beside 设置 for an unrestricted administrator, and only 设置 when denied', async () => {
    const runtime = await resolveAppRuntime(appRuntime);
    const menu = buildRouteNavigation(runtime.routes, new Set());
    expect(menu.some(({ route }) => route.name === 'foundationSettings')).toBe(
      false,
    );
    const settings = menu.find(({ route }) => route.name === 'settings');
    expect(settings?.children.map(({ route }) => route.name)).toEqual([
      'settings-home',
      'foundation',
    ]);
    const page = settings?.children.at(-1)?.route;
    expect(page).toMatchObject({
      path: '/foundation',
      auth: 'required',
      authz: 'unrestricted',
    });
    if (!page) throw new Error('Foundation route missing');
    const denied = buildRouteNavigation(
      runtime.routes,
      new Set([`${page.packageName}:${page.path}:${page.id}`]),
    );
    expect(
      denied
        .find(({ route }) => route.name === 'settings')
        ?.children.map(({ route }) => route.name),
    ).toEqual(['settings-home']);
    expect(
      serverPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });
});
