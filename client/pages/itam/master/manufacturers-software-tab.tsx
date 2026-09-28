import type { ReactElement } from 'react';

import { RelatedListTab } from './related-list-tab.js';

export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      collection='softwareProducts'
      filterField='manufacturerId'
      countKind='none'
    />
  );
}
