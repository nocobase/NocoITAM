import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi } from './api.js';
import { REPORTS_PATH } from './workbench.js';

/** Where each item's supply and demand come from (`supply-demand.ts`). */
export const SUPPLY_SOURCES = ['stock', 'order', 'repair', 'return'] as const;
export const DEMAND_SOURCES = [
  'joiner',
  'minimum',
  'expiring',
  'replacement',
] as const;
export type SupplySource =
  (typeof SUPPLY_SOURCES)[number] | (typeof DEMAND_SOURCES)[number];

export interface SupplyEntry {
  readonly kind: SupplySource;
  /** Signed: what it adds (supply) or takes (demand). */
  readonly quantity: number;
  readonly label: string;
  readonly date: string | null;
  readonly url: string | null;
}

export interface SupplyRow {
  readonly key: string;
  readonly target: {
    readonly type: 'model' | 'category' | 'softwareProduct';
    readonly id: string;
    readonly name: string;
  };
  readonly kind: string;
  readonly totals: Readonly<Record<SupplySource, number>>;
  readonly supply: number;
  readonly demand: number;
  /** An entitlement with no seat count lasting the window: 不限. */
  readonly unlimitedBy: { readonly label: string; readonly url: string } | null;
  /** With its place on the categories page, to sort by. */
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly order: number;
    /** Its names from the top of the tree down, itself last. */
    readonly path: readonly string[];
  } | null;
  /** Null where seats are unlimited. */
  readonly balance: number | null;
  readonly orderBy: string | null;
  readonly vendorId: string | null;
  readonly itemType: string | null;
  readonly entries: readonly SupplyEntry[];
}

export interface SupplyDemand {
  readonly today: string;
  readonly until: string;
  readonly rows: readonly SupplyRow[];
}

export const SUPPLY_HORIZONS = [30, 60, 90] as const;

export function useSupplyDemand(
  days: number,
  replacements: boolean,
): UseQueryResult<SupplyDemand> {
  const api = useApi();
  const query = { days: String(days), replacements: replacements ? '1' : '0' };
  return useQuery({
    queryKey: ['itam', REPORTS_PATH, 'supply-demand', query],
    queryFn: async () =>
      (
        await api.request<{ data: SupplyDemand }>({
          path: `${REPORTS_PATH}/supply-demand`,
          query,
        })
      ).data,
  });
}
