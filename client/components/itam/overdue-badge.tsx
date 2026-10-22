import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { daysOverdue } from '@/lib/itam/format';

/**
 * 到货逾期 N 天, when `date` has passed — nothing otherwise. One tag for every
 * place an order's delivery is late (2026-10-05): the workbench's 待验收到货
 * column, the purchase board and the order's own summary strip, so the
 * three agree on what "late" means. The day the goods are due is not late.
 */
export function OverdueBadge({
  date,
  className,
  label = 'procurement.overdueDays',
}: {
  readonly date: unknown;
  readonly className?: string;
  /** What is late, by its key: a delivery unless said (2026-10-22). */
  readonly label?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const days = daysOverdue(date);
  if (days <= 0) return null;
  return (
    <Badge variant='destructive' className={className}>
      {t(label, { count: days })}
    </Badge>
  );
}
