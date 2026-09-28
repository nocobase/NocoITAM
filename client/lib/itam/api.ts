import {
  ApiClientError,
  apiClientToken,
  useService,
  type ApiClient,
} from '@nocobase/app-client';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { localizeErrorBody } from './server-errors.js';

/**
 * Typed access to `/api/itam/*`. Every list is server-paged and every hook
 * keys its cache by collection so a mutation can invalidate exactly what it
 * changed.
 */
export type ItamRecord = Readonly<Record<string, unknown>> & {
  readonly id: string;
};

export interface ListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
  readonly order?: 'asc' | 'desc';
  readonly q?: string;
  readonly filter?: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
  readonly ids?: readonly string[];
}

export interface ListResponse<T = ItamRecord> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface ApiErrorBody {
  readonly code?: string;
  readonly message?: string;
  readonly field?: string;
  readonly issues?: readonly { path: string; message: string }[];
  readonly impact?: DeleteImpact;
}

export interface DeleteImpact {
  readonly level: 'blocked' | 'warn' | 'plain';
  readonly references: readonly {
    collection: string;
    field: string;
    count: number;
  }[];
}

export type ApiQuery = Readonly<
  Record<
    string,
    string | number | boolean | null | readonly string[] | undefined
  >
>;

export function listQueryParams(query: ListQuery): ApiQuery {
  const params: Record<
    string,
    string | number | readonly string[] | undefined
  > = {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    q: query.q || undefined,
    ids: query.ids && query.ids.length > 0 ? query.ids.join(',') : undefined,
  };
  for (const [field, value] of Object.entries(query.filter ?? {})) {
    if (
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    )
      continue;
    params[`filter[${field}]`] = value as string | readonly string[];
  }
  return params;
}

export const masterDataPath = (collection: string): string =>
  `itam/master/${collection}`;

export function useApi(): ApiClient {
  return useService(apiClientToken);
}

export function useItamList<T extends ItamRecord = ItamRecord>(
  path: string,
  query: ListQuery = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<ListResponse<T>> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, 'list', query],
    queryFn: () =>
      api.request<ListResponse<T>>({ path, query: listQueryParams(query) }),
    enabled: options.enabled ?? true,
    placeholderData: (previous) => previous,
  });
}

export function useItamRecord<T extends ItamRecord = ItamRecord>(
  path: string,
  id: string | undefined,
): UseQueryResult<T> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, 'record', id],
    queryFn: async () =>
      (await api.request<{ data: T }>({ path: `${path}/${id}` })).data,
    enabled: Boolean(id),
  });
}

export interface ItamMutations<T extends ItamRecord = ItamRecord> {
  readonly create: UseMutationResult<
    T,
    ApiClientError,
    Record<string, unknown>
  >;
  readonly update: UseMutationResult<
    T,
    ApiClientError,
    { id: string; input: Record<string, unknown> }
  >;
  readonly remove: UseMutationResult<void, ApiClientError, string>;
}

export function useItamMutations<T extends ItamRecord = ItamRecord>(
  path: string,
): ItamMutations<T> {
  const api = useApi();
  const queryClient = useQueryClient();
  // Everything ITAM, not just this collection: a record is read in more
  // places than its own list — the workbench's to-do cards, the reminder
  // counts, the reports behind them, a reference name on another page — and
  // a record edited in the drawer leaves the page behind it on screen, where
  // a stale number is plainly wrong. The operation dialogs already do this;
  // only the plain field edits did not, so editing in the drawer left the
  // workbench showing what it showed before. Only active queries refetch.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['itam'] });
  return {
    create: useMutation({
      mutationFn: async (input: Record<string, unknown>) =>
        (await api.request<{ data: T }>({ path, method: 'POST', json: input }))
          .data,
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        input,
      }: {
        id: string;
        input: Record<string, unknown>;
      }) =>
        (
          await api.request<{ data: T }>({
            path: `${path}/${id}`,
            method: 'PATCH',
            json: input,
          })
        ).data,
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        await api.request({ path: `${path}/${id}`, method: 'DELETE' });
      },
      // Drop the deleted record's own queries instead of refetching them
      // (a refetch would 404 and retry, holding the caller for seconds),
      // and let the list refresh in the background.
      onSuccess: (_result, id) => {
        queryClient.removeQueries({
          queryKey: ['itam', path],
          predicate: (query) => query.queryKey.includes(id),
        });
        void queryClient.invalidateQueries({
          queryKey: ['itam'],
          predicate: (query) => !query.queryKey.includes(id),
        });
      },
    }),
  };
}

export function useDeleteImpact(
  path: string,
  id: string | undefined,
): UseQueryResult<DeleteImpact> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, 'delete-impact', id],
    queryFn: async () =>
      (
        await api.request<{ data: DeleteImpact }>({
          path: `${path}/${id}/delete-impact`,
        })
      ).data,
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export interface ItamSettings {
  readonly general: {
    currency: string;
    timeZone: string;
    dateFormat: string;
  };
  readonly thresholds: {
    warrantyDays: number;
    maintenanceExpiryDays: number;
    subscriptionExpiryDays: number;
    idleDays: number;
    auditDays: number;
    idleSeatRatio: number;
    defaultStockMinimum: number;
    /** The two cross-record patterns' windows and counts. */
    lateDeliveryDays: number;
    lateDeliveryOrders: number;
    batchDefectDays: number;
    batchDefectDevices: number;
  };
  readonly numbering: Record<
    string,
    { prefix: string; width: number; start: number }
  >;
  readonly ai: {
    businessNotes: string;
  };
}

export function useItamSettings(): UseQueryResult<ItamSettings> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', 'settings'],
    queryFn: async () =>
      (await api.request<{ data: ItamSettings }>({ path: 'itam/settings' }))
        .data,
    staleTime: 5 * 60_000,
  });
}

/** Reads the structured error body an ITAM route returned, if any. */
export function apiErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!(error instanceof ApiClientError)) return undefined;
  const payload = error.payload;
  return payload && typeof payload === 'object'
    ? localizeErrorBody(payload)
    : undefined;
}

/**
 * Row counts of several related lists at once (the numbers on detail tabs):
 * one request per list asking for a single row, reading its `total`.
 */
/**
 * Counts from endpoints that return rows rather than a paged list (a
 * record's purchase orders); `distinct` counts the different values of
 * that field instead of the rows. The query key is the caller's, so a tab
 * reading the same rows shares the request.
 */
export function useRowCounts(
  requests: readonly {
    readonly path: string;
    readonly queryKey: readonly unknown[];
    readonly distinct?: string;
  }[],
): readonly (number | undefined)[] {
  const api = useApi();
  return useQueries({
    queries: requests.map((request) => ({
      queryKey: request.queryKey,
      queryFn: async () =>
        (await api.request<{ data: ItamRecord[] }>({ path: request.path }))
          .data,
    })),
    combine: (results) =>
      results.map((result, index) => {
        const rows = result.data;
        if (!rows) return undefined;
        const key = requests[index]?.distinct;
        return key
          ? new Set(rows.map((row) => JSON.stringify(row[key] ?? null))).size
          : rows.length;
      }),
  });
}

export function useRelatedCounts(
  requests: readonly { readonly path: string; readonly query: ListQuery }[],
): readonly (number | undefined)[] {
  const api = useApi();
  return useQueries({
    queries: requests.map((request) => ({
      queryKey: [
        'itam',
        request.path,
        'list',
        { ...request.query, pageSize: 1 },
      ],
      queryFn: () =>
        api.request<ListResponse>({
          path: request.path,
          query: listQueryParams({ ...request.query, pageSize: 1 }),
        }),
    })),
    combine: (results) => results.map((result) => result.data?.total),
  });
}
