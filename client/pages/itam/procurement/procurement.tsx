import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { purchaseOrderDomain } from './po-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={purchaseOrderDomain} />;
}
