import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { HolderLink } from './holder-link.js';
import { InfoRow, InfoSection } from './detail-page.js';
import { useManagedDevices, type ManagedDevice } from '@/lib/itam/device-sync';
import { formatDate, toDate } from '@/lib/itam/format';

/**
 * What each device management platform reports about a device (device sync,
 * 2026-10-14): a group of its own on the device's page, beside the fields
 * people keep. Nothing here is editable — the platform owns these values —
 * and each block says when the platform last heard from the device. Absent
 * altogether while no platform is connected.
 */
export function ManagedPlatforms({
  deviceId,
}: {
  readonly deviceId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const managed = useManagedDevices(deviceId);
  if (!managed.data?.connected) return null;
  const records = managed.data.data;
  return (
    <InfoSection title={t('deviceSync.group')}>
      {records.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('deviceSync.notFound')}
        </p>
      ) : (
        <div className='flex flex-col gap-4'>
          {records.map((record) => (
            <PlatformRecord key={record.id} record={record} />
          ))}
        </div>
      )}
    </InfoSection>
  );
}

function PlatformRecord({
  record,
}: {
  readonly record: ManagedDevice;
}): ReactElement {
  const { t } = useTranslation();
  const source = t(`deviceSync.sources.${record.source}`);
  const rows: [string, ReactNode][] = [
    ['deviceSync.fields.deviceName', record.deviceName],
    [
      'deviceSync.fields.os',
      [record.osName, record.osVersion].filter(Boolean).join(' '),
    ],
    [
      'deviceSync.fields.user',
      record.personId ? (
        <HolderLink key='user' holderType='person' holderId={record.personId} />
      ) : (
        (record.userName ?? record.userPrincipal)
      ),
    ],
    [
      'deviceSync.fields.lastSync',
      <LastSync key='lastSync' value={record.lastSyncAt} />,
    ],
    ['deviceSync.fields.enrolledAt', formatDate(record.enrolledAt)],
    [
      'deviceSync.fields.ownership',
      t(`deviceSync.ownership.${record.ownership}`),
    ],
    [
      'deviceSync.fields.compliance',
      record.compliance
        ? t(`deviceSync.compliance.${record.compliance}`, {
            defaultValue: record.compliance,
          })
        : null,
    ],
    [
      'deviceSync.fields.encrypted',
      record.encrypted === null
        ? null
        : t(record.encrypted ? 'common.yes' : 'common.no'),
    ],
  ];
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='flex items-center gap-2 text-sm font-medium'>
          {source}
          {record.goneAt ? (
            <Badge variant='outline' data-size='sm'>
              {t('deviceSync.gone', { date: formatDate(record.goneAt) })}
            </Badge>
          ) : null}
        </span>
        {record.consoleUrl ? (
          <a
            href={record.consoleUrl}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1 text-xs text-link hover:underline'
          >
            {t('deviceSync.openIn', { source })}
            <ExternalLink className='size-3' />
          </a>
        ) : null}
      </div>
      <dl className='flex flex-col gap-2'>
        {rows
          .filter(([, value]) => value !== null && value !== '')
          .map(([label, value]) => (
            <InfoRow key={label} label={t(label)}>
              {value}
            </InfoRow>
          ))}
      </dl>
    </div>
  );
}

/** When the platform last heard from the device, and how long ago that is. */
function LastSync({ value }: { readonly value: string | null }): ReactElement {
  const { t } = useTranslation();
  // The moment the page opened is "now": how long ago need not tick.
  const [now] = useState(() => Date.now());
  const date = toDate(value);
  if (!date) return <span className='text-muted-foreground'>—</span>;
  const days = Math.floor((now - date.getTime()) / 86_400_000);
  return (
    <span title={formatDate(value, true)}>
      {formatDate(value, true)}
      <span className='ml-2 text-muted-foreground'>
        {days <= 0
          ? t('deviceSync.today')
          : t('deviceSync.daysAgo', { count: days })}
      </span>
    </span>
  );
}
