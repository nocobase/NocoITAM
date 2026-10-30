import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  listQueryParams,
  masterDataPath,
  useApi,
  type ItamRecord,
  type ListResponse,
} from './api.js';
import { deviceLabel, text } from './format.js';
import { masterDataByName } from './master-data.js';

/** API path and display label for every collection ids may point at. */
const DOMAIN_PATHS: Readonly<Record<string, { path: string; route: string }>> =
  {
    devices: { path: 'itam/devices', route: 'devices' },
    stockItems: { path: 'itam/stock', route: 'accessories' },
    entitlements: { path: 'itam/entitlements', route: 'entitlements' },
    purchaseOrders: { path: 'itam/purchase-orders', route: 'purchases' },
    repairs: { path: 'itam/repairs', route: 'repairs' },
    auditTasks: { path: 'itam/audits', route: 'audits' },
    disposals: { path: 'itam/disposals', route: 'disposals' },
    // Users have a directory but no page of their own. Picking from it
    // offers the people in IT; a name lookup answers for anybody.
    users: { path: 'itam/users', route: '' },
    // Not a collection: the people who may approve a kind of request, which
    // a submitter picks from (`filter.subject` says which kind).
    approvers: { path: 'itam/users/approvers', route: '' },
    // Likewise: the people a repair may be made the responsibility of,
    // which is whoever may finish one.
    repairOwners: { path: 'itam/users/repair-owners', route: '' },
  };

export function referencePath(collection: string): string {
  return DOMAIN_PATHS[collection]?.path ?? masterDataPath(collection);
}

export function referenceRoute(collection: string): string {
  return (
    DOMAIN_PATHS[collection]?.route ??
    masterDataByName(collection)?.route ??
    collection
  );
}

export function referenceLabel(collection: string, row: ItamRecord): string {
  if (collection === 'devices') return deviceLabel(row);
  if (collection === 'purchaseOrders') return text(row.orderNo);
  if (collection === 'disposals') return text(row.disposalNo);
  if (collection === 'repairs') return text(row.faultDescription);
  const nameField = masterDataByName(collection)?.nameField ?? 'name';
  return text(row[nameField] ?? row.id);
}

/**
 * Resolves ids to display names for the ids currently on screen — never the
 * whole collection. Ids are fetched in batches per collection and cached.
 */
export type ReferenceNames = ReadonlyMap<string, string>;

const BATCH = 100;

export function useReferenceNames(
  requests: readonly {
    collection: string;
    ids: readonly (string | null | undefined)[];
  }[],
): Record<string, ReferenceNames> {
  const api = useApi();
  const batches = useMemo(() => {
    const result: { collection: string; ids: string[] }[] = [];
    for (const request of requests) {
      const ids = [
        ...new Set(request.ids.filter((id): id is string => Boolean(id))),
      ].sort();
      for (let index = 0; index < ids.length; index += BATCH) {
        result.push({
          collection: request.collection,
          ids: ids.slice(index, index + BATCH),
        });
      }
    }
    return result;
  }, [requests]);

  const queries = useQueries({
    queries: batches.map((batch) => ({
      queryKey: ['itam', referencePath(batch.collection), 'names', batch.ids],
      queryFn: () =>
        api.request<ListResponse<ItamRecord>>({
          path: referencePath(batch.collection),
          query: listQueryParams({ ids: batch.ids, pageSize: BATCH }),
        }),
      staleTime: 60_000,
    })),
  });

  // A collection's map appears once its names have loaded, so a missing
  // key means the record is gone rather than still on its way.
  const result: Record<string, Map<string, string>> = {};
  batches.forEach((batch, index) => {
    const data = queries[index]?.data?.data;
    if (!data) return;
    const map = (result[batch.collection] ??= new Map());
    for (const row of data) {
      map.set(row.id, referenceLabel(batch.collection, row));
    }
  });
  return result;
}
