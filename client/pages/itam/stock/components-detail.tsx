import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { stockDomain } from './stock-domain.js';

const domain = stockDomain('component');

export default function Page(): ReactElement {
  return <DomainDetailPage domain={domain} />;
}
