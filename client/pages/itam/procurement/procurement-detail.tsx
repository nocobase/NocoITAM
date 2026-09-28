import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { purchaseOrderDomain } from './po-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={purchaseOrderDomain} />;
}
