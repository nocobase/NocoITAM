import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { masterDataPath, useItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { stockTarget } from '@/lib/itam/related-targets';

import { kindOfAppliesTo } from './master-stats.js';
import { RelatedListTab } from './related-list-tab.js';
import { stockTypeColumn } from './stock-type-column.js';

/**
 * A model's 设备 or 库存 tab (2026-10-21): its devices or its stock items,
 * whichever its category holds, one list for both routes. A stock item
 * leads with its asset type; every device is a device, so its rows do not.
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
  if (kind === 'device')
    return (
      <DeviceListEmbed
        filter={{ modelId: id }}
        // Every row is this model, filed under its category; who holds each
        // matters more here than since when.
        omit={['modelId', 'categoryId', 'assignedAt']}
        show={['noAndName', 'serialNo', 'assignee']}
      />
    );
  if (kind === 'stock')
    return (
      <RelatedListTab
        target={stockTarget}
        filterField='modelId'
        countKind='none'
        leading={[stockTypeColumn(t)]}
      />
    );
  return null;
}
