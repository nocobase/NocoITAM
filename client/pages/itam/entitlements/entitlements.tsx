import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';
import { entitlementDomain } from './entitlement-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={entitlementDomain} />;
}
