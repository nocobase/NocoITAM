import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';
import { disposalDomain } from './disposal-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={disposalDomain} />;
}
