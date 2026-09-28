import { useMutation } from '@tanstack/react-query';

import { useApi } from './api.js';

/** CSV import / export. */
export interface ImportField {
  readonly key: string;
  readonly type: string;
  readonly required?: boolean;
  readonly reference?: string;
  readonly options?: readonly string[];
}

export interface ImportPreview {
  readonly columns: readonly string[];
  readonly sample: readonly Readonly<Record<string, string>>[];
  readonly total: number;
  readonly fields: readonly ImportField[];
  readonly mapping: Readonly<Record<string, string | undefined>>;
  /** Set when several rows make one record: the column they group by. */
  readonly groupBy?: string;
}

export interface ImportRowResult {
  readonly line: number;
  readonly status: 'create' | 'update' | 'error' | 'created' | 'updated';
  readonly errors: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly id?: string;
}

export interface ImportReport {
  readonly total: number;
  readonly creates: number;
  readonly updates: number;
  readonly errors: number;
  readonly rows: readonly ImportRowResult[];
}

/** Collections that offer the import wizard, by their API collection name. */
export const IMPORTABLE: Readonly<Record<string, string>> = {
  devices: 'devices',
  purchaseOrders: 'purchaseOrders',
  stockItems: 'stockItems',
  entitlements: 'entitlements',
  manufacturers: 'manufacturers',
  vendors: 'vendors',
  categories: 'categories',
  models: 'models',
  softwareProducts: 'softwareProducts',
  locations: 'locations',
  departments: 'departments',
  people: 'people',
};

export function useImportStep<T>(
  collection: string,
  step: 'preview' | 'validate' | 'commit',
) {
  const api = useApi();
  return useMutation({
    mutationFn: (input: {
      csv: string;
      mapping?: Record<string, string | undefined>;
    }) =>
      api
        .request<{ data: T }>({
          path: `itam/imports/${collection}/${step}`,
          method: 'POST',
          json: input,
        })
        .then((result) => result.data),
  });
}

/** Downloads the current filter of a collection as CSV. */
export async function downloadExport(
  api: ReturnType<typeof useApi>,
  collection: string,
  query: Record<string, string>,
  columns?: readonly string[],
): Promise<void> {
  const payload: unknown = await api.request({
    path: `itam/exports/${collection}`,
    query: { ...query, ...(columns ? { columns: columns.join(',') } : {}) },
  });
  const text = typeof payload === 'string' ? payload : '';
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${collection}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
