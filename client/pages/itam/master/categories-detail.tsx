import type { ReactElement } from 'react';

import { DomainDetailPage } from '../domain-detail.js';

import { masterDomain } from './master-domain.js';

export default function Page(): ReactElement {
  return <DomainDetailPage domain={masterDomain('categories')} />;
}
