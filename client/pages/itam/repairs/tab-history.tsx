import type { ReactElement } from 'react';

import { DomainHistoryTab } from '../domain-tabs.js';

import { repairDomain } from './repair-domain.js';

export default function Page(): ReactElement {
  return <DomainHistoryTab path='itam/repairs' fields={repairDomain.fields} />;
}
