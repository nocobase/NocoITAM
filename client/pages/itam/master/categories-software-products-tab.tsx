import type { ReactElement } from 'react';

import { RelatedListTab } from './related-list-tab.js';

/** Software products in a software category, with license / subscription counts. */
export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      collection='softwareProducts'
      filterField='categoryId'
      countKind='none'
    />
  );
}
