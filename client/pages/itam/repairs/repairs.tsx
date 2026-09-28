import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { repairDomain } from './repair-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={repairDomain} />;
}
