import { useTranslation } from '@nocobase/i18n/client';
import {
  ClipboardCheck,
  Recycle,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import type { DocumentKind } from '@/lib/itam/document-kinds';

/**
 * The four kinds of work document, each with the icon of its own navigation
 * entry, so a tag reads the same as the sidebar it points into. The label
 * names the kind of work rather than the document — 采购, not 采购单 —
 * because it sits beside the document's own number, and 「采购单
 * PO-000126」 says 单 twice.
 */
const DOCUMENTS: Readonly<
  Record<DocumentKind, { readonly icon: LucideIcon; readonly label: string }>
> = {
  purchaseOrders: { icon: ShoppingCart, label: 'workbench.work.tagPurchase' },
  repairs: { icon: Wrench, label: 'workbench.work.tagRepair' },
  auditTasks: { icon: ClipboardCheck, label: 'workbench.work.tagAudit' },
  disposals: { icon: Recycle, label: 'workbench.work.tagDisposal' },
};

export function DocumentTypeBadge({
  kind,
  className,
}: {
  readonly kind: DocumentKind;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  const { icon: Icon, label } = DOCUMENTS[kind];
  return (
    // The asset-type tag's own contract (`styles.css`): outlined, because it
    // says what kind of thing this is rather than what state it is in — in
    // a colour of its own per kind (`data-kind`, 2026-10-17), so 采购, 维修,
    // 盘点 and 报废 are told apart before they are read.
    <Badge
      variant='secondary'
      data-tag='kind'
      data-kind={kind}
      className={className}
    >
      <Icon className='size-3' aria-hidden='true' />
      {t(label)}
    </Badge>
  );
}
