import { masterDataPath } from './api.js';
import { DEVICES_PATH } from './device-api.js';
import { ENTITLEMENTS_PATH } from './entitlements.js';
import { MASTER_DATA } from './master-data.js';
import { AUDITS_PATH, DISPOSALS_PATH, REPAIRS_PATH } from './operations.js';
import { PURCHASE_ORDERS_PATH } from './procurement.js';
import { STOCK_I18N, STOCK_KINDS, STOCK_PATH, STOCK_ROUTES } from './stock.js';

/**
 * Which links point at a record the drawer can open, and what it needs to
 * name that record: the collection, the API path to load it from and the
 * translation prefix of its kind. The drawer then mounts the record's own
 * detail page (see `record-pages.ts`), so nothing about its fields is
 * registered here. Every collection with a detail page has an entry, keyed
 * by its route segment.
 */
export interface RecordView {
  readonly collection: string;
  /** API path under /api, e.g. `itam/devices`. */
  readonly path: string;
  /** Route segment, e.g. `devices`. */
  readonly route: string;
  /** Translation prefix: `${i18n}.object` names the kind of record. */
  readonly i18n: string;
}

export interface RecordTarget extends RecordView {
  readonly id: string;
  /** The link as written, for the full page. */
  readonly to: string;
}

const DOMAIN_VIEWS: readonly RecordView[] = [
  {
    collection: 'devices',
    path: DEVICES_PATH,
    route: 'devices',
    i18n: 'devices',
  },
  // Stock items share one API but route by kind, so each kind is a view.
  ...STOCK_KINDS.map((kind) => ({
    collection: 'stockItems',
    path: STOCK_PATH,
    route: STOCK_ROUTES[kind],
    i18n: STOCK_I18N[kind],
  })),
  {
    collection: 'entitlements',
    path: ENTITLEMENTS_PATH,
    route: 'entitlements',
    i18n: 'entitlements',
  },
  {
    collection: 'purchaseOrders',
    path: PURCHASE_ORDERS_PATH,
    route: 'procurement',
    i18n: 'procurement',
  },
  {
    collection: 'auditTasks',
    path: AUDITS_PATH,
    route: 'audits',
    i18n: 'audits',
  },
  {
    collection: 'disposals',
    path: DISPOSALS_PATH,
    route: 'disposals',
    i18n: 'disposals',
  },
  {
    collection: 'repairs',
    path: REPAIRS_PATH,
    route: 'repairs',
    i18n: 'repairs',
  },
];

/** The view behind a route segment (`devices`, `procurement`, `models`, …). */
function recordViewByRoute(route: string): RecordView | undefined {
  const domain = DOMAIN_VIEWS.find((view) => view.route === route);
  if (domain) return domain;
  const master = MASTER_DATA.find((collection) => collection.route === route);
  return master
    ? {
        collection: master.name,
        path: masterDataPath(master.name),
        route: master.route,
        i18n: master.i18n,
      }
    : undefined;
}

/**
 * Resolves a record link (`/devices/abc`, with or without a query string)
 * to the record it points at. Anything else — a list, a tab, a page of
 * tools — is not a record and returns nothing, so the caller navigates.
 */
export function recordTarget(to: string): RecordTarget | undefined {
  const pathname = to.split(/[?#]/, 1)[0] ?? '';
  const [route, id, ...rest] = pathname.split('/').filter(Boolean);
  if (!route || !id || rest.length > 0) return undefined;
  const view = recordViewByRoute(route);
  return view ? { ...view, id, to } : undefined;
}
