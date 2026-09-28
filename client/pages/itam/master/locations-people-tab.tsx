import type { ReactElement } from 'react';

import { RelatedListTab } from './related-list-tab.js';

export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      collection='people'
      filterField='locationId'
      countKind='none'
    />
  );
}
