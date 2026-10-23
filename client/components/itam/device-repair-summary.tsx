import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RecordLink } from '@/components/itam/record-link';
import { Badge } from '@/components/ui/badge';
import type { ItamRecord } from '@/lib/itam/api';
import { daysOverdue, formatDate, text } from '@/lib/itam/format';

/**
 * The repair a device in repair is out on (2026-10-16): its number, when it
 * is expected back and, once that has passed, how late — under the status,
 * as a disposal shows for a device being disposed of.
 */
export function DeviceRepairSummary({
  repair,
}: {
  readonly repair: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const late = daysOverdue(repair.expectedReturnAt);
  return (
    <span className='inline-flex flex-wrap items-center gap-2'>
      <RecordLink to={`/repairs/${text(repair.id)}`} className='text-link'>
        {text(repair.repairNo)}
      </RecordLink>
      {repair.expectedReturnAt ? (
        <span className='text-muted-foreground'>
          {t('repairs.expectedBack', {
            date: formatDate(repair.expectedReturnAt),
          })}
        </span>
      ) : null}
      {late > 0 ? (
        <Badge variant='destructive'>
          {t('repairs.overdueDays', { count: late })}
        </Badge>
      ) : null}
    </span>
  );
}
