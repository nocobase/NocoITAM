import { useTranslation } from '@nocobase/i18n/client';
import { ShoppingCart } from 'lucide-react';
import type { ReactElement } from 'react';

import type { ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { PO_FIELDS } from '@/lib/itam/procurement';

import { EnumBadge } from './cells.js';
import { DocumentCard } from './document-card.js';

const STATUS_FIELD = PO_FIELDS.find((field) => field.key === 'status')!;

/**
 * One purchase order as a document card: the order number and description,
 * its reason, status and amount, then whatever the record knows about its
 * share of the order.
 */
export function PurchaseOrderCard({
  order,
  amount,
  detail,
}: {
  /** `id`, `orderNo`, `description`, `reason` and `status` of the order. */
  readonly order: ItamRecord;
  /** The amount, formatted, shown at the right. */
  readonly amount?: string | null;
  /** The small line: dates, quantities, the vendor. */
  readonly detail: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <DocumentCard
      icon={ShoppingCart}
      tone='purchase'
      to={`/purchases/${text(order.id)}`}
      number={text(order.orderNo)}
      title={text(order.description) || null}
      kind={t(`enums.poReason.${text(order.reason)}`, {
        defaultValue: text(order.reason),
      })}
      status={<EnumBadge field={STATUS_FIELD} value={order.status} />}
      amount={amount}
      details={detail}
    />
  );
}
