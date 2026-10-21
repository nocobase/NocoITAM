import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DocumentList } from '@/components/itam/document-card';
import { EmptyState } from '@/components/itam/empty-state';
import { Paged } from '@/components/itam/paged';
import { PurchaseOrderCard } from '@/components/itam/purchase-order-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';

/**
 * A vendor's 采购 (2026-10-21): its purchase orders as the cards a stock
 * item's or an entitlement's purchases are — number, what it is for, the
 * reason, status and amount, then when it is needed and was ordered —
 * newest first, rather than a table of numbers.
 */
export default function Tab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const orders = useItamList<ItamRecord>(PURCHASE_ORDERS_PATH, {
    pageSize: 200,
    sort: 'createdAt',
    order: 'desc',
    filter: { vendorId: id },
  });
  const rows = orders.data?.data ?? [];
  if (orders.isLoading) return <Skeleton className='h-40 w-full' />;
  if (rows.length === 0) return <EmptyState title={t('procurement.empty')} />;
  return (
    <Paged rows={rows}>
      {(pageRows) => (
        <DocumentList>
          {pageRows.map((order) => (
            <PurchaseOrderCard
              key={text(order.id)}
              order={order}
              amount={
                order.estimatedTotal === null ||
                order.estimatedTotal === undefined
                  ? null
                  : formatMoney(
                      order.estimatedTotal,
                      text(order.currency) || null,
                    )
              }
              detail={[
                order.neededBy
                  ? `${t('fields.neededBy')} ${formatDate(order.neededBy)}`
                  : '',
                order.orderedAt
                  ? `${t('fields.orderedAt')} ${formatDate(order.orderedAt)}`
                  : '',
              ]}
            />
          ))}
        </DocumentList>
      )}
    </Paged>
  );
}
