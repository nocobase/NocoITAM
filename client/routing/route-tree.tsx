import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import type { ReactElement } from 'react';
import { Outlet, Route } from 'react-router';

import { EMPTY_ARRAY } from '#lib/constants';

import {
  childRouteParentPath,
  relativeRoutePath,
  routeKey,
} from './route-navigation.js';
import { ClientRoute } from './client-route.js';
import { isLandingPath } from './landing.js';

/** Groups pass children through; pages deliberately own their Outlet placement. */
export function renderRouteTree(
  routes: readonly AppClientRegisteredRoute[],
  parentPath = '',
): ReactElement[] {
  return routes.map((route) =>
    // Application change (ITAM, 2026-10-23): a record's landing tab is its
    // detail route's index, so the record shows it at its own address; the
    // registry has no index routes, so it is marked by its path
    // (`client/routing/landing.ts`).
    isLandingPath(route.path) ? (
      <Route
        key={routeKey(route)}
        index
        element={<ClientRoute key={routeKey(route)} route={route} />}
      />
    ) : (
      <Route
        key={routeKey(route)}
        path={relativeRoutePath(route, parentPath)}
        element={
          route.componentLoader ? (
            <ClientRoute key={routeKey(route)} route={route} />
          ) : (
            <Outlet />
          )
        }
      >
        {renderRouteTree(
          route.children ?? EMPTY_ARRAY,
          childRouteParentPath(route, parentPath),
        )}
      </Route>
    ),
  );
}
