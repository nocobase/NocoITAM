import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes, {
  createApplicationRoutes,
} from '../../client/routes.ts';
import { includeNotificationTemplateRoutes } from '../../client/pages/settings/notification-routes.js';
import { defineAppRoutes } from '@nocobase/app-client/plugins';

describe('app client routes', () => {
  it('joins the settings system category across contributions without moving the log URL', () => {
    const shell = defineAppRoutes([
      {
        name: 'settings',
        path: '/settings',
        navigation: { title: 'Settings' },
        children: [
          {
            name: 'settingsSystem',
            navigation: { title: 'System' },
            children: [],
          },
        ],
      },
    ]);
    const logs = defineAppRoutes([
      {
        name: 'notificationManagement',
        parent: 'settingsSystem',
        navigation: { title: 'Notifications' },
        children: [
          {
            name: 'notificationLogs',
            path: '/notifications/logs',
            auth: 'required',
            authz: {
              resource: { type: 'page', id: 'notification.logs' },
              action: 'access',
            },
            componentLoader: () =>
              import('../../client/pages/settings/notification-templates.js'),
          },
        ],
      },
    ]);
    const routes = includeNotificationTemplateRoutes([shell, logs], true);
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes,
      },
    ]);
    expect(pagePaths(built.routes)).toEqual([
      '/settings/notifications/logs',
      '/settings/notifications/templates',
    ]);
    expect(built.routes[0].children[0].children).toHaveLength(1);
    const created = includeNotificationTemplateRoutes([shell], true);
    expect(
      created
        .flatMap((part) => part.routes)
        .find((route) => route.name === 'notificationManagement')?.parent,
    ).toBe('settingsSystem');
  });

  // ITAM sends notifications of its own, so the module is there whatever
  // the invitation mailer: ITAM declares it, templates first, then the
  // delivery logs, a template opening in a drawer (2026-11-10, as NocoCRM).
  it('exposes the notification templates and logs through the real application route factory', async () => {
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes: createApplicationRoutes(),
      },
    ]);
    expect(pagePaths(built.routes)).toEqual(
      expect.arrayContaining([
        '/settings/notifications/templates',
        '/settings/notifications/templates/:templateId',
        '/settings/notifications/logs',
      ]),
    );
    expect(pageAuthorizations(built.routes)).toEqual(
      expect.arrayContaining([
        {
          name: 'notificationTemplates',
          authorizedAs: 'notification.templates',
        },
        { name: 'notificationTemplate', authorizedAs: null },
        { name: 'notificationLogs', authorizedAs: 'notification.logs' },
      ]),
    );
    for (const loader of componentLoadersIn(built.routes))
      await expect(loader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
  });

  it('reuses the notification module and preserves its logs and existing grants', () => {
    const existing = defineAppRoutes([
      {
        name: 'settings',
        path: '/settings',
        navigation: { title: 'Settings' },
        children: [
          {
            name: 'notificationManagement',
            navigation: { title: 'Notifications' },
            children: [
              {
                name: 'notificationLogs',
                path: '/notification-logs',
                auth: 'required',
                authz: {
                  resource: { type: 'page', id: 'existing.notification.logs' },
                  action: 'access',
                },
                componentLoader: () =>
                  import('../../client/pages/settings/notification-templates.js'),
              },
            ],
          },
        ],
      },
    ]);
    const once = includeNotificationTemplateRoutes([existing], false);
    expect(includeNotificationTemplateRoutes(once, true)).toBe(once);
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes: once,
      },
    ]);
    expect(pagePaths(built.routes)).toEqual([
      '/settings/notification-logs',
      '/settings/notifications/templates',
    ]);
    expect(pageAuthorizations(built.routes)).toEqual([
      { name: 'notificationLogs', authorizedAs: 'existing.notification.logs' },
      { name: 'notificationTemplates', authorizedAs: 'notification.templates' },
    ]);
    expect(built.routes[0].children).toHaveLength(1);
  });

  it('keeps the landing page and the authentication pages', () => {
    // The authentication plugin and this application have to agree on these paths: it sends an unknown visitor to
    // /login, sends a signed-in user who opens a guest page back to /, and mails a reset link to /reset-password,
    // while the sign-in form links to /register and /forgot-password. Only their presence is asserted, so a page the
    // application adds is not a defect. Whether these four are guest pages is not checked here either: app-client
    // refuses any route that claims one of those paths without `auth: 'guest'`.
    expect(pagePaths(resolveRoutes().routes)).toEqual(
      expect.arrayContaining([
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
      ]),
    );
  });

  it('loads every page component', async () => {
    const resolved = resolveRoutes();
    const loaders = componentLoadersIn(resolved.routes);
    // The trees above are filtered by loader, so an empty list would make the loop below pass without loading
    // anything at all.
    expect(loaders).not.toHaveLength(0);

    for (const componentLoader of loaders) {
      // The registered loader is already the wrapped one, so awaiting it holds every page to the contract that its
      // module default-exports a component. A page that moved or lost its default export fails here.
      await expect(componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('pins the page authorization of every signed-in page', () => {
    // A stored page grant records the page's `authz` resource id (`authorizedAs`), not its route `name`: changing an
    // id is a data change that has to migrate the grants that reference it, not a refactor — so changing this list
    // deliberately is the point. A new page that requires sign-in adds an entry here, because a page that checks
    // access is a new grant somebody has to be given.
    const resolved = resolveRoutes();

    // Every menu entry checks a page grant named after its route, and the
    // permission sets decide which a role holds; a detail page or tab is
    // reached through the list that already checked, so it skips. This list
    // is the one the seeds' IT_PAGES are written against.
    const pages = pageAuthorizations(resolved.routes);
    expect(
      pages
        .filter((page) => page.authorizedAs !== null)
        .map((page) => page.authorizedAs),
    ).toEqual([
      'workbench',
      'devices',
      'accessories',
      'consumables',
      'components',
      'entitlements',
      'procurement',
      'repairs',
      'disposals',
      'audits',
      'reports',
      'master-data-overview',
      'categories',
      'models',
      'software-products',
      'manufacturers',
      'vendors',
      'locations',
      'departments',
      'people',
      // AI: 智能体工作 (2026-10-16), ITAM's own page; then (template
      // 1.0.0-beta.64) the Agents plugin's pages, each behind its own grant
      // or the settings item its API reads. 收件箱, first in the menu, checks
      // no grant: everyone has one, showing only their own.
      'agent-work',
      // 业务说明 (2026-10-16), a setting: the settings page's grant.
      'itam-settings',
      'agents',
      'skills',
      'settings:agents.services',
      'usage',
      // 系统设置 (template 1.0.0-beta.92, 2026-11-10): the home checks
      // nothing, listing what its viewer may open, and API keys are
      // everyone's; each module checks what it checked as a tab of ITAM's
      // former settings page. 业务配置 first (ITAM's order, 2026-11-10):
      // ITAM's four tabs, the grant its settings always had.
      // 报废流程 (2026-10-18) is one of them. Then the demo data.
      'itam-settings',
      'itam-settings',
      'itam-settings',
      'itam-settings',
      'itam-settings',
      // 账号与权限: NocoBase 3's prepared Users page (2026-10-24): the list, creating
      // and inviting check the users plugin's own actions.
      'user:*',
      'user:*',
      'user:*',
      // Its Roles page and creating a role; then /settings/permission-sets,
      // ITAM's own page until then, now a redirect to it.
      'settings:authorization.permission-sets',
      'settings:authorization.permission-sets',
      'settings:authorization.permission-sets',
      // 系统: notification management, its templates then its delivery
      // logs (2026-11-10, as NocoCRM), scheduled tasks and the template's
      // Database Explorer (beta.92).
      'notification.templates',
      'notification.logs',
      'scheduler.schedules',
      'database-explorer',
    ]);
    // A detail page is not a menu entry and carries no grant of its own.
    expect(
      pages.find((page) => page.name === 'devices-detail')?.authorizedAs,
    ).toBeNull();
  });
});

/** This application's own contribution, registered the way the client runtime registers it. */
function resolveRoutes() {
  return resolveAppClientContributions([
    {
      packageName: 'itam',
      routes: applicationRoutes,
      source: 'application',
    },
  ]);
}

/**
 * The paths of the pages a route tree registers. A menu group names no component, so it carries no path of its own
 * and inherits its parent's — filtering on `componentLoader` is what keeps that inherited path out of the list.
 */
function pagePaths(routes: readonly AppClientRegisteredRoute[]): string[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.path] : []),
    ...pagePaths(route.children ?? []),
  ]);
}

/** Every page loader in a tree, at any depth. */
function componentLoadersIn(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRouteComponentLoader[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.componentLoader] : []),
    ...componentLoadersIn(route.children ?? []),
  ]);
}

/** Page authorization comes directly from the registered tree. */
function pageAuthorizations(
  routes: readonly AppClientRegisteredRoute[],
): { name: string; authorizedAs: string | null }[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader && route.auth === 'required'
      ? [
          {
            name: route.name,
            authorizedAs:
              route.authz === 'skip'
                ? null
                : route.authz === 'unrestricted'
                  ? 'unrestricted'
                  : route.authz.resource.type === 'page'
                    ? route.authz.resource.id
                    : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
