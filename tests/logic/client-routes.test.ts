import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

const GUEST_PAGES = ['login', 'register', 'forgot-password', 'reset-password'];

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    // The sign-in pages are this application's own routes since template
    // beta.43, so no extension overrides the authentication plugin's. The
    // extensions that remain are Registry component libraries.
    expect(
      sourceExtensions.flatMap(
        (extension) => extension.routeComponentOverrides ?? [],
      ),
    ).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    const [app, settings] = applicationRoutes;
    expect(app).toMatchObject({ parent: 'app' });
    // The sign-in pages the template now ships, alongside this application's
    // own pages.
    const names = app.routes.map((route) => route.name);
    expect(names).toContain('workbench');
    expect(names.filter((name) => GUEST_PAGES.includes(name))).toEqual(
      GUEST_PAGES,
    );
    for (const route of app.routes) {
      if (GUEST_PAGES.includes(route.name))
        expect(route).toMatchObject({ auth: 'guest' });
    }
    expect(settings).toMatchObject({ parent: 'settings' });
    expect(settings.routes.map((route) => route.name)).toEqual([
      'theme',
      'itam-settings',
    ]);
    expect(Object.isFrozen(app)).toBe(true);
    expect(Object.isFrozen(settings)).toBe(true);
    for (const route of [...app.routes, ...settings.routes]) {
      if (!route.componentLoader) continue;
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('routes nothing under client/pages/reference', () => {
    // A reference page reaching the router would put a shadcn gallery inside somebody's product, so this pins the
    // boundary rather than trusting a reviewer to notice the import path.
    const loaders = JSON.stringify(applicationRoutes);
    expect(loaders).not.toContain('pages/reference');
  });

  it('pins the route names page grants are stored against', () => {
    // A route's `name` is the identifier a stored page grant records. Renaming one is a data change that has to
    // migrate the grants that name it, not a refactor — so changing this list deliberately is the point.
    const resolved = resolveAppClientContributions([
      {
        packageName: 'itam',
        routes: applicationRoutes,
        source: 'application',
      },
    ]);

    // Every menu entry checks a page grant named after its route, and the
    // permission sets decide which a role holds; a detail page or tab is
    // reached through the list that already checked, so it skips. This list
    // is the one the seeds' IT_PAGES / EMPLOYEE_PAGES are written against.
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
      'audits',
      'disposals',
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
      'my-assets',
    ]);
    // A detail page is not a menu entry and carries no grant of its own.
    expect(
      pages.find((page) => page.name === 'devices-detail')?.authorizedAs,
    ).toBeNull();
    expect(pageAuthorizations(resolved.settingsRouteTree)).toEqual([
      { name: 'itam-settings', authorizedAs: 'itam-settings' },
      { name: 'theme', authorizedAs: 'theme' },
    ]);
  });
});

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
                : route.authz.resource.type === 'page'
                  ? route.authz.resource.id
                  : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
