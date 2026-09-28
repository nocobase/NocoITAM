import type { ReactElement } from 'react';

import { RelatedListTab } from './related-list-tab.js';

export default function Tab(): ReactElement {
  // A manufacturer's models spa devices and stock, so both are counted.
  return (
    <RelatedListTab
      collection='models'
      filterField='manufacturerId'
      countKind='both'
    />
  );
}
