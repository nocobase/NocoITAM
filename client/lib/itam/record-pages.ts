import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
import { lazy, type ComponentType } from 'react';

import { appRouteDefinitions } from '@/routes';

/**
 * The detail route behind a list route segment — `devices` → the
 * `/devices/:id` route with its tab children — so the record drawer can
 * mount the same page the full view shows. Undefined when the segment has
 * no detail page.
 */
export function recordPageRoute(
  segment: string,
): AppClientRouteDefinition | undefined {
  const walk = (
    routes: readonly AppClientRouteDefinition[],
  ): AppClientRouteDefinition | undefined => {
    for (const route of routes) {
      if (route.path === `/${segment}`) {
        const detail = route.children?.find((child) => child.path === ':id');
        if (detail) return detail;
      }
      const nested = route.children ? walk(route.children) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  return walk(appRouteDefinitions);
}

export interface RecordPage {
  /** The detail page, which renders its tabs through an outlet. */
  readonly Detail: ComponentType;
  readonly tabs: readonly {
    readonly path: string;
    readonly Component: ComponentType;
  }[];
}

const pages = new Map<string, RecordPage | null>();

const lazyOf = (route: AppClientRouteDefinition): ComponentType =>
  route.componentLoader ? lazy(route.componentLoader) : () => null;

/**
 * The detail page of a segment and its tabs as lazy components, created
 * once per segment so the drawer never re-creates a page (and loses its
 * state) while rendering.
 */
export function recordPage(segment: string): RecordPage | undefined {
  if (!pages.has(segment)) {
    const route = recordPageRoute(segment);
    pages.set(
      segment,
      route
        ? {
            Detail: lazyOf(route),
            tabs: (route.children ?? []).map((child) => ({
              path: child.path ?? '',
              Component: lazyOf(child),
            })),
          }
        : null,
    );
  }
  return pages.get(segment) ?? undefined;
}
