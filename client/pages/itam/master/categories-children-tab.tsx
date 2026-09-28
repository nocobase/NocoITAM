import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';

import { RelatedListTab } from './related-list-tab.js';

/**
 * Sub-categories with what each holds: models, or software products under
 * a software category (children share the parent's kind).
 */
export default function Tab(): ReactElement {
  const { id = '' } = useParams();
  const category = useItamRecord<ItamRecord>(masterDataPath('categories'), id);
  const software = category.data?.appliesTo === 'entitlement';
  return (
    <RelatedListTab
      collection='categories'
      filterField='parentId'
      countKind='none'
      countColumns={
        software
          ? [{ key: 'softwareProducts', label: 'navigation.softwareProducts' }]
          : [{ key: 'models', label: 'navigation.models' }]
      }
    />
  );
}
