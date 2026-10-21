import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { useSubtree } from '@/lib/itam/tree';

import { RelatedListTab } from './related-list-tab.js';

/** Software products in a software category, with license / subscription counts. */
export default function Tab(): ReactElement | null {
  const { id = '' } = useParams();
  // Its sub-categories' products too (2026-10-21), each under its own.
  const ids = useSubtree('categories', id);
  if (!ids) return null;
  return (
    <RelatedListTab
      collection='softwareProducts'
      filterField='categoryId'
      filterValue={ids}
      showFilterField={ids.length > 1}
      countKind='none'
    />
  );
}
