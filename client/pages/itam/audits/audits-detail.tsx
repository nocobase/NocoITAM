import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { auditDomain } from './audit-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={auditDomain} />;
}
