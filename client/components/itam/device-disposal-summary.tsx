import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { EnumBadge } from '@/components/itam/cells';
import { RecordLink } from '@/components/itam/record-link';
import type { ItamRecord } from '@/lib/itam/api';
import { formatDate, text } from '@/lib/itam/format';
import { DISPOSAL_FIELDS } from '@/lib/itam/operations';

const STATUS_FIELD = DISPOSAL_FIELDS.find((field) => field.key === 'status')!;

/** The disposal a device is on: its number and status, or once executed, when. */
export function DeviceDisposalSummary({
  disposal,
}: {
  readonly disposal: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const link = (
    <RecordLink to={`/disposals/${text(disposal.id)}`} className='text-link'>
      {text(disposal.disposalNo)}
    </RecordLink>
  );
  // Carried out, it says when, which says 已执行 too: no tag, the date
  // after the number with a comma (2026-10-23). Before that, the tag says
  // how far it got.
  if (disposal.status === 'executed' && disposal.disposedAt)
    return (
      <span>
        {link}
        <span className='text-muted-foreground'>
          {t('devices.disposedOn', { date: formatDate(disposal.disposedAt) })}
        </span>
      </span>
    );
  return (
    <span className='inline-flex flex-wrap items-center gap-2'>
      {link}
      <EnumBadge field={STATUS_FIELD} value={disposal.status} />
    </span>
  );
}
