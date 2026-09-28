import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { stockDomain } from './stock-domain.js';

const domain = stockDomain('accessory');

export default function Page(): ReactElement {
  return <DomainListPage domain={domain} />;
}
