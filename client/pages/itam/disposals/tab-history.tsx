import type { ReactElement } from 'react';

import { DomainHistoryTab } from '../domain-tabs.js';

import { disposalDomain } from './disposal-domain.js';

export default function Page(): ReactElement {
  return (
    <DomainHistoryTab path='itam/disposals' fields={disposalDomain.fields} />
  );
}
