import type { ReactElement } from 'react';

import { DomainHistoryTab } from '../domain-tabs.js';

import { purchaseOrderDomain } from './po-domain.js';

export default function Page(): ReactElement {
  return (
    <DomainHistoryTab
      path='itam/purchase-orders'
      fields={purchaseOrderDomain.fields}
    />
  );
}
