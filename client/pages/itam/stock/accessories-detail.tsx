import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { stockDomain } from './stock-domain.js';

const domain = stockDomain('accessory');

export default function Page(): ReactElement {
  return <DomainDetailPage domain={domain} />;
}
