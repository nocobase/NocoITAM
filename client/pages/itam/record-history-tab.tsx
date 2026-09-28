import type { ReactElement } from 'react';
import { useLocation } from 'react-router';

import { masterDataPath } from '@/lib/itam/api';
import { MASTER_DATA } from '@/lib/itam/master-data';

import { DomainHistoryTab } from './domain-tabs.js';

/**
 * The history tab every master-data detail page shares (the `master()`
 * helper in `client/routes.ts` gives each one this loader). Which collection
 * it belongs to is the route's first segment — `/models/:id/history` — which
 * holds in the record drawer too, since the drawer mounts the page at its
 * own path.
 */
export default function RecordHistoryTab(): ReactElement {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[0] ?? '';
  const collection =
    MASTER_DATA.find((entry) => entry.route === segment) ??
    MASTER_DATA.find((entry) => entry.name === segment);
  return (
    <DomainHistoryTab
      path={masterDataPath(collection?.name ?? segment)}
      fields={collection?.fields}
    />
  );
}
