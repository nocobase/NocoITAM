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
 * One purchase order as a document card: the order number, its reason and
 * status, then whatever the record knows about its share of the order.
 */
export function PurchaseOrderCard({
  order,
  detail,
}: {
  /** `id`, `orderNo`, `reason` and `status` of the order. */
  readonly order: ItamRecord;
  /** The small line: dates, amounts, the vendor. */
  readonly detail: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <DocumentCard
      icon={ShoppingCart}
      to={`/procurement/${text(order.id)}`}
      number={text(order.orderNo)}
      kind={t(`enums.poReason.${text(order.reason)}`, {
        defaultValue: text(order.reason),
      })}
      status={<EnumBadge field={STATUS_FIELD} value={order.status} />}
      details={detail}
    />
  );
}
