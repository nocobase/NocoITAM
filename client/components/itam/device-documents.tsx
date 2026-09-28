import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useItamRecord, type ItamRecord } from '@/lib/itam/api';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import { useReferenceNames } from '@/lib/itam/references';

import { EmptyState } from './empty-state.js';
import { DocumentList } from './document-card.js';
import { PurchaseOrderCard } from './purchase-order-card.js';

/**
 * The one order a device came in through, as a card of the 关联单据 tab:
 * the same shape as the repair and disposal cards around it.
 */
export function DevicePurchaseOrderList({
  purchaseOrderId,
}: {
  readonly purchaseOrderId: string | null;
}): ReactElement {
  const { t } = useTranslation();
  const order = useItamRecord<ItamRecord>(
    PURCHASE_ORDERS_PATH,
    purchaseOrderId ?? undefined,
  );
  const rows = order.data ? [order.data] : [];
  const names = useReferenceNames([
    { collection: 'vendors', ids: rows.map((row) => text(row.vendorId)) },
  ]);
  if (!purchaseOrderId)
    return <EmptyState title={t('devices.noPurchaseOrder')} />;
  return (
    <DocumentList>
      {rows.map((row) => {
        const amount = row.estimatedTotal;
        return (
          <PurchaseOrderCard
            key={text(row.id)}
            order={row}
            detail={[
              row.orderedAt ? formatDate(row.orderedAt) : '',
              amount === null || amount === undefined
                ? ''
                : formatMoney(amount, text(row.currency)),
              row.vendorId
                ? (names.vendors?.get(text(row.vendorId)) ?? '')
                : '',
            ]}
          />
        );
      })}
    </DocumentList>
  );
}
