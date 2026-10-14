import { useTranslation } from '@nocobase/i18n/client';
import { Wifi } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RecordLink } from './record-link.js';
import { useOnlineAfterLeaving } from '@/lib/itam/device-sync';
import { formatDate } from '@/lib/itam/format';

/**
 * A leaver's devices that a management platform still heard from after
 * they left, with them as its primary user (device sync, 2026-10-15): on
 * their 归属 tab, above what they hold, because a device returned on the
 * register but still signing in as them is the case it exists for. Nothing
 * when none, or while no platform is connected.
 */
export function LeaverOnlineDevices({
  personId,
  left,
}: {
  readonly personId: string;
  readonly left: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const online = useOnlineAfterLeaving(personId, left);
  const rows = online.data ?? [];
  if (!left || rows.length === 0) return null;
  return (
    <Alert className='border-warning-foreground/25 bg-warning text-warning-foreground'>
      <Wifi />
      <AlertTitle>
        {t('deviceSync.onlineAfterLeaving', { count: rows.length })}
      </AlertTitle>
      <AlertDescription>
        <ul className='flex flex-col gap-0.5'>
          {rows.map((row) => {
            const label =
              row.deviceName ?? row.serialNo ?? t('deviceSync.unknownDevice');
            return (
              <li key={row.id} className='flex flex-wrap gap-x-2'>
                {row.deviceId ? (
                  <RecordLink
                    to={`/devices/${row.deviceId}`}
                    className='font-medium underline-offset-4 hover:underline'
                  >
                    {label}
                  </RecordLink>
                ) : (
                  <span className='font-medium'>{label}</span>
                )}
                <span>
                  {t('deviceSync.syncedOn', {
                    source: t(`deviceSync.sources.${row.source}`),
                    date: formatDate(row.lastSyncAt, true),
                  })}
                </span>
                {row.deviceId ? null : (
                  <span>{t('deviceSync.notOnRegister')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
