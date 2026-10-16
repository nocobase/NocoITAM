import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi, type ItamRecord } from './api.js';
import { text } from './format.js';
import { referenceLabel } from './references.js';
import { WORKBENCH_PATH } from './workbench.js';

/** One group of the workbench search: the matches on one list page. */
export interface SearchGroup {
  /** The list page the group belongs to; see `SEARCH_PAGES`. */
  readonly key: string;
  readonly collection: string;
  /** Every match, of which `rows` are the first few. */
  readonly total: number;
  readonly rows: readonly ItamRecord[];
}

/**
 * The list page each search group belongs to: its collection, its route,
 * the navigation title that names it, and the enum its status reads
 * through, if any. The server's `SEARCH_GROUPS` lists the same keys in the
 * order they read.
 */
export const SEARCH_PAGES: Readonly<
  Record<
    string,
    {
      readonly collection: string;
      readonly route: string;
      readonly title: string;
      readonly status?: string;
    }
  >
> = {
  devices: {
    collection: 'devices',
    route: 'devices',
    title: 'navigation.devices',
    status: 'deviceStatus',
  },
  people: { collection: 'people', route: 'people', title: 'navigation.people' },
  accessories: {
    collection: 'stockItems',
    route: 'accessories',
    title: 'navigation.accessories',
  },
  consumables: {
    collection: 'stockItems',
    route: 'consumables',
    title: 'navigation.consumables',
  },
  components: {
    collection: 'stockItems',
    route: 'components',
    title: 'navigation.components',
  },
  entitlements: {
    collection: 'entitlements',
    route: 'entitlements',
    title: 'navigation.entitlements',
  },
  purchaseOrders: {
    collection: 'purchaseOrders',
    route: 'procurement',
    title: 'navigation.procurement',
    status: 'poStatus',
  },
  repairs: {
    collection: 'repairs',
    route: 'repairs',
    title: 'navigation.repairs',
  },
  disposals: {
    collection: 'disposals',
    route: 'disposals',
    title: 'navigation.disposals',
    status: 'disposalStatus',
  },
  auditTasks: {
    collection: 'auditTasks',
    route: 'audits',
    title: 'navigation.audits',
    status: 'auditStatus',
  },
  models: { collection: 'models', route: 'models', title: 'navigation.models' },
  softwareProducts: {
    collection: 'softwareProducts',
    route: 'software-products',
    title: 'navigation.softwareProducts',
  },
  vendors: {
    collection: 'vendors',
    route: 'vendors',
    title: 'navigation.vendors',
  },
  locations: {
    collection: 'locations',
    route: 'locations',
    title: 'navigation.locations',
  },
  departments: {
    collection: 'departments',
    route: 'departments',
    title: 'navigation.departments',
  },
  categories: {
    collection: 'categories',
    route: 'categories',
    title: 'navigation.categories',
  },
  manufacturers: {
    collection: 'manufacturers',
    route: 'manufacturers',
    title: 'navigation.manufacturers',
  },
};

/**
 * The matches for `q`, one request for every group. The previous answer
 * stays on screen while the next one loads, so the list does not blink
 * empty between keystrokes.
 */
export function useSearchResults(
  q: string,
): UseQueryResult<readonly SearchGroup[]> {
  const api = useApi();
  const term = q.trim();
  return useQuery({
    queryKey: ['itam', WORKBENCH_PATH, 'search', term],
    queryFn: async () =>
      (
        await api.request<{ data: SearchGroup[] }>({
          path: `${WORKBENCH_PATH}/search`,
          query: { q: term },
        })
      ).data,
    enabled: term.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

/**
 * The URL parameters a list reads "the records Asset Steward found" from: their ids
 * and the one line saying what they are. A list given `ids` shows those
 * records only, as a table, under a strip that names them and clears them.
 */
export const FOUND_IDS = 'ids';
export const FOUND_TITLE = 'found';

/** The ids a list was handed, or none. */
export function foundIds(params: URLSearchParams): string[] | undefined {
  const ids = params.get(FOUND_IDS)?.split(',').filter(Boolean);
  return ids && ids.length > 0 ? ids : undefined;
}

/**
 * The second line of a result: what tells two of a name apart. A status
 * reads through its enum.
 */
const DETAIL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  // The model first: "MacBook" finds a device through it (the server's
  // `searchByReference`), and the row should say why it matched.
  devices: ['modelName', 'serialNo', 'status'],
  stockItems: ['modelName'],
  entitlements: ['productName'],
  people: ['employeeNo', 'email'],
  purchaseOrders: ['status'],
  repairs: ['faultDescription'],
  disposals: ['status'],
  auditTasks: ['status'],
  models: ['code'],
  departments: ['code'],
  vendors: ['email'],
};

/** How a result of search group `key` is headed. */
export function searchRowTitle(key: string, row: ItamRecord): string {
  const collection = SEARCH_PAGES[key]?.collection ?? key;
  // A repair is named by its fault elsewhere; here its number heads it,
  // and the fault is the line under it.
  return collection === 'repairs' && row.repairNo
    ? text(row.repairNo)
    : referenceLabel(collection, row);
}

/** The line beside a result's heading, or an empty string. */
export function searchRowDetail(
  key: string,
  row: ItamRecord,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const page = SEARCH_PAGES[key];
  return (DETAIL_FIELDS[page?.collection ?? ''] ?? [])
    .map((field) => {
      const raw = text(row[field]);
      if (!raw) return '';
      return field === 'status' && page?.status
        ? t(`enums.${page.status}.${raw}`, { defaultValue: raw })
        : raw;
    })
    .filter(Boolean)
    .join(' · ');
}

/** The records Asset Steward found for a question, as its tool handed them over. */
export interface FoundRecordSet {
  /** A key of `SEARCH_PAGES`. */
  readonly list: string;
  readonly ids: readonly string[];
  /** A few words saying what they are, in Asset Steward's words. */
  readonly title: string;
}

/** The link that opens a list narrowed to `found`. */
export function foundListUrl(found: FoundRecordSet): string | undefined {
  const page = SEARCH_PAGES[found.list];
  if (!page) return undefined;
  const params = new URLSearchParams({ [FOUND_IDS]: found.ids.join(',') });
  if (found.title) params.set(FOUND_TITLE, found.title);
  return `/${page.route}?${params.toString()}`;
}
