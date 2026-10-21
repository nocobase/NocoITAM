import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import { useSubtree } from '@/lib/itam/tree';

import { RelatedListTab } from './related-list-tab.js';

/**
 * The count column names what it counts, like the tree badges: 设备 for
 * device categories, 库存 (quantity on hand) for stock categories; none for
 * software.
 */
export default function Tab(): ReactElement | null {
  const { id = '' } = useParams();
  // Its sub-categories' models too (2026-10-21), each under its own.
  const ids = useSubtree('categories', id);
  const category = useItamRecord<ItamRecord>(masterDataPath('categories'), id);
  const kind = category.data?.appliesTo;
  if (!ids) return null;
  return (
    <RelatedListTab
      collection='models'
      filterField='categoryId'
      filterValue={ids}
      showFilterField
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
