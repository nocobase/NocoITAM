import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { stockTarget } from '@/lib/itam/related-targets';
import { useSubtree } from '@/lib/itam/tree';

import { RelatedListTab } from './related-list-tab.js';
import { stockTypeColumn } from './stock-type-column.js';

/**
 * A location's stock, its sub-locations' included (2026-10-21), with each
 * item's location when there are several.
 */
export default function Tab(): ReactElement | null {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const ids = useSubtree('locations', id);
  if (!ids) return null;
  const several = ids.length > 1;
  return (
    <RelatedListTab
      target={several ? { ...stockTarget, columns: 5 } : stockTarget}
      filterField='locationId'
      filterValue={ids}
      showFilterField={several}
      countKind='none'
      leading={[stockTypeColumn(t)]}
    />
  );
}
