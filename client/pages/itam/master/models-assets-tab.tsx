import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import type { DataTableColumn } from '@/components/itam/data-table';
import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { stockTarget } from '@/lib/itam/related-targets';

import { kindOfAppliesTo } from './master-stats.js';
import { RelatedListTab } from './related-list-tab.js';

/**
 * A model's 资产 (2026-10-21): its devices or its stock items, whichever its
 * category holds, in one tab rather than a 设备 and a 库存 tab of which only
 * one ever showed. Each row leads with its asset type, so the list reads the
 * same for a laptop model and a toner.
 */
export default function ModelAssetsTab(): ReactElement | null {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const model = useItamRecord(masterDataPath('models'), id);
  const category = useItamRecord(
    masterDataPath('categories'),
    text(model.data?.categoryId) || undefined,
  );
  const kind = kindOfAppliesTo(category.data?.appliesTo);
  const typeColumn = (
    typeOf: (row: ItamRecord) => unknown,
  ): DataTableColumn<ItamRecord> => ({
    key: 'assetType',
    header: t('fields.appliesTo'),
    className: 'w-px whitespace-nowrap',
    render: (row) => <AssetTypeBadge value={typeOf(row)} />,
  });
  if (kind === 'device')
    return (
      <DeviceListEmbed
        filter={{ modelId: id }}
        leading={[typeColumn(() => 'device')]}
        // Every row is this model, filed under its category.
        omit={['modelId', 'categoryId']}
      />
    );
  if (kind === 'stock')
    return (
      <RelatedListTab
        target={stockTarget}
        filterField='modelId'
        countKind='none'
        leading={[typeColumn((row) => row.kind)]}
      />
    );
  return null;
}
