import type { ReactElement } from 'react';

import { DomainHistoryTab } from '../domain-tabs.js';

import { auditDomain } from './audit-domain.js';

export default function Page(): ReactElement {
  return (
    <DomainHistoryTab
      path='itam/audits'
      fields={auditDomain.fields}
      fieldDisplay={auditDomain.fieldDisplay}
    />
  );
}
