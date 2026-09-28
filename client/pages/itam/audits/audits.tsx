import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { auditDomain } from './audit-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={auditDomain} />;
}
