import type { ReactElement } from 'react';

import { stockTarget } from '@/lib/itam/related-targets';

import { RelatedListTab } from './related-list-tab.js';

export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      target={stockTarget}
      filterField='locationId'
      countKind='none'
    />
  );
}
