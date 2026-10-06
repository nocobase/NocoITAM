import type { ReactElement } from 'react';

import { disposalTarget } from '@/lib/itam/related-targets';

import { RelatedListTab } from './related-list-tab.js';

/** The disposals that hand their devices to this vendor (接收方（供应商）). */
export default function Tab(): ReactElement {
  return (
    <RelatedListTab
      target={disposalTarget}
      filterField='recipientVendorId'
      countKind='none'
    />
  );
}
