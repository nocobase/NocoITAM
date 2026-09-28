import type { ReactElement } from 'react';
import { useLocation } from 'react-router';

import { STOCK_ROUTES, stockFields, type StockKind } from '@/lib/itam/stock';

import { DomainHistoryTab } from '../domain-tabs.js';

/** The route's first segment says which stock kind's fields label the changes. */
export default function Page(): ReactElement {
  const segment = useLocation().pathname.split('/').filter(Boolean)[0] ?? '';
  const kind =
    (Object.keys(STOCK_ROUTES) as StockKind[]).find(
      (candidate) => STOCK_ROUTES[candidate] === segment,
    ) ?? 'accessory';
  return <DomainHistoryTab path='itam/stock' fields={stockFields(kind)} />;
}
