import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';

import { RelatedListTab } from './related-list-tab.js';

/**
 * The count column names what it counts, like the tree badges: 设备 for
 * device categories, 库存 (quantity on hand) for stock categories; none for
 * software.
 */
export default function Tab(): ReactElement {
  const { id = '' } = useParams();
  const category = useItamRecord<ItamRecord>(masterDataPath('categories'), id);
  const kind = category.data?.appliesTo;
  return (
    <RelatedListTab
      collection='models'
      filterField='categoryId'
      countKind={
        kind === 'device'
          ? 'devices'
          : kind === 'entitlement'
            ? 'none'
            : 'stock'
      }
      countLabel={kind === 'device' ? 'tabs.devices' : 'tabs.stock'}
    />
  );
}
