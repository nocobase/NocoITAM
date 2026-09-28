import type { ReactElement } from 'react';

import { DomainHistoryTab } from '../domain-tabs.js';

import { ENTITLEMENT_FIELDS } from '@/lib/itam/entitlements';

export default function Page(): ReactElement {
  return (
    <DomainHistoryTab path='itam/entitlements' fields={ENTITLEMENT_FIELDS} />
  );
}
