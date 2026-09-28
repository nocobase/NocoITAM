import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { repairDomain } from './repair-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={repairDomain} />;
}
