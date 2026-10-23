import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { EnumBadge } from '@/components/itam/cells';
import { RecordLink } from '@/components/itam/record-link';
import type { ItamRecord } from '@/lib/itam/api';
import { formatDate, text } from '@/lib/itam/format';
import { DISPOSAL_FIELDS } from '@/lib/itam/operations';

const STATUS_FIELD = DISPOSAL_FIELDS.find((field) => field.key === 'status')!;

/** The disposal a device is on: its number, status and, once executed, when. */
export function DeviceDisposalSummary({
  disposal,
}: {
  readonly disposal: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span className='inline-flex flex-wrap items-center gap-2'>
      <RecordLink to={`/disposals/${text(disposal.id)}`} className='text-link'>
        {text(disposal.disposalNo)}
      </RecordLink>
      <EnumBadge field={STATUS_FIELD} value={disposal.status} />
      {disposal.status === 'executed' && disposal.disposedAt ? (
        <span className='text-muted-foreground'>
          {t('devices.disposedOn', { date: formatDate(disposal.disposedAt) })}
        </span>
      ) : null}
    </span>
  );
}
