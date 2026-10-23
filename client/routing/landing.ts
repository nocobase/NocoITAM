/**
 * Where a record's landing tab is registered (2026-10-23). The route
 * registry takes no index routes and refuses a child at its parent's path,
 * so the tab a record opens on is registered under this placeholder and
 * `renderRouteTree` renders it as its parent's index route: the record
 * shows that tab at its own address. Nothing links to the placeholder.
 */
export const LANDING_PATH = '_landing';

/** Whether a registered route is a record's landing tab. */
export const isLandingPath = (path: string | undefined): boolean =>
  path === LANDING_PATH || (path?.endsWith(`/${LANDING_PATH}`) ?? false);
