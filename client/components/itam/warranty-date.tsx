import { useTranslation } from '@nocobase/i18n/client';

import { Badge } from '@/components/ui/badge';
import { useItamSettings } from '@/lib/itam/api';
import { warrantyState } from '@/lib/itam/devices';
import { formatDate } from '@/lib/itam/format';

/** The same date and current warranty status wherever a device is referenced. */
export function WarrantyDate({ value }: { readonly value: unknown }) {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const warranty = warrantyState(
    value,
    settings.data?.thresholds.warrantyDays ?? 30,
  );
  return (
    <span className='inline-flex flex-wrap items-center gap-x-3 gap-y-1'>
      <span>{formatDate(value) || '—'}</span>
      {warranty.state !== 'unknown' ? (
        <Badge
          variant={warranty.state === 'expired' ? 'destructive' : 'secondary'}
          className={
            warranty.state === 'expiring'
              ? 'text-warning-foreground'
              : undefined
          }
        >
          {t(`devices.warranty.${warranty.state}`, {
            days: warranty.daysLeft ?? 0,
            date: formatDate(value),
          })}
        </Badge>
      ) : null}
    </span>
  );
}
