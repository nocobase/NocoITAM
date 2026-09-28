import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { usePurchaseOrders, type OrderRow } from '@/lib/itam/purchases';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

import { EmptyState } from './empty-state.js';
import { DocumentList } from './document-card.js';
import { Paged } from './paged.js';
import { PurchaseOrderCard } from './purchase-order-card.js';

/** The orders as cards: date, quantity delivered, amount, then the vendor. */
export function PurchaseOrderCards({
  orders,
}: {
  readonly orders: readonly OrderRow[];
}): ReactElement {
  const { t } = useTranslation();
  const names = useReferenceNames([
    { collection: 'vendors', ids: orders.map((row) => text(row.vendorId)) },
  ]);
  return (
    <Paged rows={orders}>
      {(pageRows) => (
        <DocumentList>
          {pageRows.map((order) => (
            <PurchaseOrderCard
              key={text(order.id)}
              order={order}
              detail={[
                order.orderedAt ? formatDate(order.orderedAt) : '',
                t('stock.purchasedQuantity', { count: Number(order.quantity) }),
                order.amount === null || order.amount === undefined
                  ? ''
                  : formatMoney(order.amount, text(order.currency) || null),
                order.vendorId
                  ? (names.vendors?.get(text(order.vendorId)) ?? '')
                  : '',
              ]}
            />
          ))}
        </DocumentList>
      )}
    </Paged>
  );
}

/**
 * Tab: the purchase orders a record came in through. Stock items keep no
 * purchase fields of their own — every batch may come from a different
 * order — so the receipts are the purchase history, one card per order
 * with the quantity it delivered. `path` is the record's API path; the
 * route's `id` is the record.
 */
export function PurchasesTab({
  path,
  emptyKey = 'stock.noPurchases',
}: {
  readonly path: string;
  /** Translation key shown when nothing was bought through an order. */
  readonly emptyKey?: string;
}): ReactElement {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const orders = usePurchaseOrders(path, id);
  if (orders && orders.length === 0) return <EmptyState title={t(emptyKey)} />;
  return <PurchaseOrderCards orders={orders ?? []} />;
}
