import { masterDataPath } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';

/** What `/itam/master/:collection/:id/stats` answers. */
export interface MasterDataStats {
  readonly counts: Readonly<Record<string, number>>;
  readonly devicesByStatus: Readonly<Record<string, number>>;
  readonly ancestors: readonly { id: string; name: string }[];
  readonly attributeUsage?: Readonly<Record<string, number>>;
}

/** `/itam/master/:collection/:id/stats`, shared by the tab badges and the rest. */
export const statsRequest = (name: string, id: string) => ({
  path: `${masterDataPath(name)}/${id}/stats`,
  queryKey: ['itam', masterDataPath(name), id, 'stats'] as const,
});

/** A tab's badge from the stats; a tab the stats do not count stays bare. */
export function statsTabCount(
  answer: unknown,
  key: string,
): number | undefined {
  const stats = answer as MasterDataStats | undefined;
  if (!stats) return undefined;
  if (key === 'devices')
    return Object.values(stats.devicesByStatus).reduce((a, b) => a + b, 0);
  if (key === 'stock') return stats.counts.stockItems;
  return stats.counts[key];
}

export type CategoryKind = 'device' | 'stock' | 'entitlement';

/** Devices, stock (accessories, consumables, components) or entitlements. */
export function kindOfAppliesTo(value: unknown): CategoryKind | undefined {
  const applies = text(value);
  if (!applies) return undefined;
  return applies === 'device' || applies === 'entitlement' ? applies : 'stock';
}
