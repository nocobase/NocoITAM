import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { entitlementDomain } from './entitlement-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={entitlementDomain} />;
}
