import type { ReactElement } from 'react';

import { DomainListPage } from '../domain-list.js';

import { masterDomain } from './master-domain.js';

export default function Page(): ReactElement {
  return <DomainListPage domain={masterDomain('models')} />;
}
