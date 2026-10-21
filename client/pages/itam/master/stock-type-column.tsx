import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import type { DataTableColumn } from '@/components/itam/data-table';
import type { ItamRecord } from '@/lib/itam/api';

/**
 * A stock list's leading 资产类型 (2026-10-21): stock items of every kind
 * share one list, so each says which it is.
 */
export function stockTypeColumn(
  t: (key: string) => string,
): DataTableColumn<ItamRecord> {
  return {
    key: 'assetType',
    header: t('fields.appliesTo'),
    className: 'w-px whitespace-nowrap',
    render: (row) => <AssetTypeBadge value={row.kind} />,
  };
}
