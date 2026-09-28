import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { disposalDomain } from './disposal-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={disposalDomain} />;
}
