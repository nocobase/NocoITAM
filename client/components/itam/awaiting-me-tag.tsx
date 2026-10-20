import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Says a request waits on this reader's decision (2026-10-20), on its board
 * card and its list row: the list route marks those rows `awaitingMe`
 * (`server/routes/itam/mine-view.ts`). A filled tag like a status's, in the
 * calm blue (`info`), so it stands apart from the amber 审批中 a request
 * waiting on a decision always has beside it.
 */
export function AwaitingMeTag({
  className,
}: {
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge
      variant='secondary'
      className={cn('bg-info text-info-foreground', className)}
    >
      {t('common.awaitingMe')}
    </Badge>
  );
}
