import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';
import { createApplicationRoutes } from '../../client/routes.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
  selectedNavigationId,
  routeKey,
} from '../../client/routing/route-navigation.js';

// ITAM's settings in the template's settings shell (template 1.0.0-beta.92,
// 2026-11-10): the template's checks, on ITAM's own routes.
const app = '@nocobase/app-itam';

function resolve(): readonly AppClientRegisteredRoute[] {
  return resolveAppClientContributions([
    {
      packageName: app,
      source: 'application',
      routes: createApplicationRoutes(),
    },
  ]).routes;
}

function search(
  routes: readonly AppClientRegisteredRoute[],
  name: string,
): AppClientRegisteredRoute | undefined {
  for (const route of routes) {
    if (route.name === name) return route;
    const nested = route.children && search(route.children, name);
    if (nested) return nested;
  }
  return undefined;
}

function find(
  routes: readonly AppClientRegisteredRoute[],
  name: string,
): AppClientRegisteredRoute {
  const route = search(routes, name);
  if (!route) throw new Error(`No route ${name}`);
  return route;
}

const catalog = (
  routes: readonly AppClientRegisteredRoute[],
  denied = new Set<string>(),
) =>
  buildSettingsCatalog(routes, denied).map((category) => [
    category.route.name,
    category.modules.map((module) => [module.route.name, module.target.path]),
  ]);

const ITAM_SETTINGS = {
  resource: { type: 'page', id: 'itam-settings' },
  action: 'access',
};
const PERMISSION_SETS = {
  resource: { type: 'settings', id: 'authorization.permission-sets' },
  action: 'read',
};

describe('ITAM settings navigation', () => {
  it('keeps the URLs and grants the settings pages had as tabs', () => {
    const routes = resolve();
    expect(
      [
        'itam-settings',
        'itam-settings-mdm',
        'itam-settings-flows',
        'itam-settings-receipt-agent',
        'settings-users',
        'settings-roles',
        'settings-permission-sets',
        'settings-api-keys',
        'settings-scheduled-tasks',
        'itam-settings-sample-data',
      ].map((name) => {
        const route = find(routes, name);
        return [name, route.path, route.authz];
      }),
    ).toEqual([
      ['itam-settings', '/settings/itam', ITAM_SETTINGS],
      ['itam-settings-mdm', '/settings/mdm', ITAM_SETTINGS],
      ['itam-settings-flows', '/settings/flows', ITAM_SETTINGS],
      ['itam-settings-receipt-agent', '/settings/receipt-agent', ITAM_SETTINGS],
      [
        'settings-users',
        '/settings/users',
        { resource: { type: 'user', id: '*' }, action: 'read' },
      ],
      ['settings-roles', '/settings/roles', PERMISSION_SETS],
      [
        'settings-permission-sets',
        '/settings/permission-sets',
        PERMISSION_SETS,
      ],
      ['settings-api-keys', '/settings/api-keys', 'skip'],
      [
        'settings-scheduled-tasks',
        '/settings/scheduled-tasks',
        {
          resource: { type: 'page', id: 'scheduler.schedules' },
          action: 'access',
        },
      ],
      ['itam-settings-sample-data', '/settings/demo', ITAM_SETTINGS],
    ]);
  });

  it('shows one sidebar entry that stays selected on every settings page', () => {
    const routes = resolve();
    const menu = buildRouteNavigation(routes, new Set());
    const settings = menu.filter(({ route }) =>
      route.path.startsWith('/settings'),
    );
    expect(settings.map(({ route }) => [route.name, route.path])).toEqual([
      ['settingsHome', '/settings'],
    ]);
    expect(settings[0].children).toEqual([]);
    const entry = routeKey(settings[0].route);
    for (const path of [
      '/settings',
      '/settings/itam',
      '/settings/flows',
      '/settings/users',
      '/settings/users/create',
      '/settings/roles/itam-it-support/edit',
      '/settings/api-keys',
      '/settings/demo',
    ])
      expect(selectedNavigationId(routes, path)).toBe(entry);
  });

  it('groups the modules into categories and hides what a viewer may not open', () => {
    const routes = resolve();
    // 业务配置 comes first (ITAM's order, 2026-11-10).
    expect(catalog(routes)).toEqual([
      [
        'settingsBusiness',
        [
          ['itamSettings', '/settings/itam'],
          ['itam-settings-sample-data', '/settings/demo'],
        ],
      ],
      [
        'settingsAccount',
        [
          ['settings-users', '/settings/users'],
          ['permissionManagement', '/settings/roles'],
          ['settings-api-keys', '/settings/api-keys'],
        ],
      ],
      [
        'settingsSystem',
        [
          ['notificationManagement', '/settings/notifications/templates'],
          ['settings-scheduled-tasks', '/settings/scheduled-tasks'],
          ['databaseExplorer', '/settings/database-explorer'],
        ],
      ],
    ]);
    // A viewer without ITAM's settings grant: no business card, no demo
    // data, and API keys, everyone's own, still there.
    const denied = new Set(
      [
        'itam-settings',
        'itam-settings-mdm',
        'itam-settings-flows',
        'itam-settings-receipt-agent',
        'itam-settings-sample-data',
        'settings-users',
        'settings-roles',
        'settings-permission-sets',
        'settings-scheduled-tasks',
        'databaseExplorer',
        'notificationTemplates',
        'notificationLogs',
      ].map((name) => routeKey(find(routes, name))),
    );
    expect(catalog(routes, denied)).toEqual([
      ['settingsAccount', [['settings-api-keys', '/settings/api-keys']]],
    ]);
  });

  it('opens the ITAM module on the first of its tabs the viewer may open', () => {
    const routes = resolve();
    const denied = new Set([routeKey(find(routes, 'itam-settings'))]);
    expect(
      catalog(routes, denied).find(([name]) => name === 'settingsBusiness'),
    ).toEqual([
      'settingsBusiness',
      [
        ['itamSettings', '/settings/mdm'],
        ['itam-settings-sample-data', '/settings/demo'],
      ],
    ]);
  });

  // ITAM sends notifications of its own, so the module is always there,
  // declared by ITAM with its templates first, then its delivery logs
  // (2026-11-10, as NocoCRM); its card opens the first the viewer may open.
  it('shows notification management in System, templates then logs', () => {
    const routes = resolve();
    expect(
      catalog(routes).find(([name]) => name === 'settingsSystem')?.[1],
    ).toContainEqual([
      'notificationManagement',
      '/settings/notifications/templates',
    ]);
    const card = (denied: readonly string[]) =>
      catalog(
        routes,
        new Set(denied.map((name) => routeKey(find(routes, name)))),
      )
        .find(([name]) => name === 'settingsSystem')?.[1]
        ?.find(([name]) => name === 'notificationManagement')?.[1];
    expect(card(['notificationTemplates'])).toBe(
      '/settings/notifications/logs',
    );
    expect(card(['notificationTemplates', 'notificationLogs'])).toBeUndefined();
    expect(find(routes, 'notificationLogs').authz).toEqual({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
  });
});
