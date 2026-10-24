import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';

describe('app client routes', () => {
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
      // 设置, one page of tabs (2026-10-16): the page itself checks nothing,
      // API keys being everyone's; ITAM's tabs check the grant the settings
      // page always had, and the administration pages what the plugin's own
      // API checks. 报废流程 (2026-10-18) is one of ITAM's.
      'itam-settings',
      'itam-settings',
      'itam-settings',
      'itam-settings',
      // NocoBase 3's prepared Users page (2026-10-24): the list, creating
      // and inviting check the users plugin's own actions.
      'user:*',
      'user:*',
      'user:*',
      // Its Roles page and creating a role; then /settings/permission-sets,
      // ITAM's own page until then, now a redirect to it.
      'settings:authorization.permission-sets',
      'settings:authorization.permission-sets',
      'settings:authorization.permission-sets',
      'scheduler.schedules',
      'itam-settings',
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
