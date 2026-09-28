import type { ReactElement } from 'react';

import { entitlementTarget } from '@/lib/itam/related-targets';

import { RelatedListTab } from './related-list-tab.js';

/** What was bought for this product: perpetual and subscription entitlements. */
export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      target={entitlementTarget}
      filterField='softwareProductId'
      countKind='none'
    />
  );
}
