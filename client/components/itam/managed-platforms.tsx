import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink, Unlink } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog.js';
import { DifferenceTag } from './difference-tag.js';
import { HolderLink } from './holder-link.js';
import { InfoRow, InfoSection } from './detail-page.js';
import {
  useDeviceReviewAction,
  useManagedDevices,
  type DeviceCheck,
  type Exemption,
  type ManagedDevice,
} from '@/lib/itam/device-sync';
import { useReferenceNames } from '@/lib/itam/references';
import { formatDate, toDate } from '@/lib/itam/format';

/** What the device's page offers to settle a difference with. */
export interface CheckActions {
  /** Whether the reader may change the device at all. */
  readonly editable: boolean;
  /** Opens 分配 with this person chosen. */
  readonly onAssign: (personId: string) => void;
  /** Opens 调拨 with this person chosen. */
  readonly onTransfer: (personId: string) => void;
  /** Opens 恢复为库存中. */
  readonly onRestore: () => void;
}

/**
 * What each device management platform reports about a device (device sync,
 * 2026-10-14): a group of its own on the device's page, beside the fields
 * people keep. Nothing here is editable — the platform owns these values —
 * and each block says when the platform last heard from the device. Absent
 * altogether while no platform is connected.
 */
export function ManagedPlatforms({
  deviceId,
  status,
  actions,
}: {
  readonly deviceId: string;
  /**
   * The device's status: only one in use or on loan should be on a
   * platform, so for any other, not being on one is said calmly.
   */
  readonly status?: string;
  readonly actions?: CheckActions;
}): ReactElement | null {
  const { t } = useTranslation();
  const managed = useManagedDevices(deviceId);
  if (!managed.data?.connected) return null;
  const records = managed.data.data;
  const checks = managed.data.checks ?? [];
  const exemption = managed.data.exemption ?? null;
  return (
    <InfoSection title={t('deviceSync.group')}>
      {/* Where the platforms and the register disagree is marked on the
          record itself (2026-10-16), each with the register's own act
          beside it: silence on its last sync, another user on its primary
          user, an off-duty status on its last sync. */}
      {records.length === 0 && exemption ? (
        <ExemptionNotice
          deviceId={deviceId}
          exemption={exemption}
          editable={actions?.editable ?? false}
        />
      ) : records.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t(
            // A category that need not be on a platform says so first
            // (2026-10-16): a monitor is not missing from MDM.
            managed.data.managedCategory === false
              ? 'deviceSync.notFoundUnmanaged'
              : status && !['inUse', 'onLoan'].includes(status)
                ? 'deviceSync.notFoundIdle'
                : 'deviceSync.notFound',
          )}
        </p>
      ) : (
        <div className='flex flex-col gap-4'>
          {records.map((record) => (
            <PlatformRecord
              key={record.id}
              record={record}
              editable={actions?.editable ?? false}
              // A record gone from its platform says so by its name; only
              // one still reported but long silent marks its last sync.
              silent={
                !record.goneAt &&
                checks.some(
                  (check) =>
                    check.kind === 'stale' &&
                    check.managedDeviceId === record.id,
                )
              }
              otherUser={checks.some(
                (check) =>
                  check.kind === 'userMismatch' &&
                  check.managedDeviceId === record.id,
              )}
              onTransfer={
                actions?.editable && record.personId
                  ? () => actions.onTransfer(record.personId!)
                  : undefined
              }
              offDuty={checks.find(
                (check) =>
                  check.kind === 'statusMismatch' &&
                  check.managedDeviceId === record.id,
              )}
              onAssign={
                actions?.editable && record.personId
                  ? () => actions.onAssign(record.personId!)
                  : undefined
              }
              onRestore={actions?.editable ? actions.onRestore : undefined}
            />
          ))}
        </div>
      )}
    </InfoSection>
  );
}

/**
 * 不需要纳管 (2026-10-15): on no platform, and rightly so — the reason, who
 * said it and when, and 恢复 for when it should be enrolled after all.
 */
function ExemptionNotice({
  deviceId,
  exemption,
  editable,
}: {
  readonly deviceId: string;
  readonly exemption: Exemption;
  readonly editable: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReviewAction();
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: exemption.exemptedById ? [exemption.exemptedById] : [],
    },
  ]);
  return (
    <div className='flex flex-wrap items-start justify-between gap-2 text-sm'>
      <div className='min-w-0'>
        <p>{t('deviceSync.exempted', { reason: exemption.reason })}</p>
        <p className='text-xs text-muted-foreground'>
          {[
            exemption.exemptedById
              ? (people.users?.get(exemption.exemptedById) ?? '…')
              : null,
            formatDate(exemption.exemptedAt),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {editable ? (
        <Button
          variant='outline'
          disabled={review.isPending}
          onClick={() => review.mutate({ kind: 'unexempt', deviceId })}
        >
          {t('deviceSync.review.restore')}
        </Button>
      ) : null}
    </div>
  );
}

function PlatformRecord({
  record,
  editable,
  silent = false,
  otherUser = false,
  onTransfer,
  offDuty,
  onAssign,
  onRestore,
}: {
  readonly record: ManagedDevice;
  readonly editable: boolean;
  /** The record a 失联 was read from: its last sync is marked. */
  readonly silent?: boolean;
  /** Its primary user is not who the register assigned it to. */
  readonly otherUser?: boolean;
  /** Opens 调拨 to the primary user, for whoever may. */
  readonly onTransfer?: () => void;
  /** 状态不符 read from this record: the register says it is off duty. */
  readonly offDuty?: DeviceCheck;
  /** Opens 分配 to the primary user, for a device on the shelf. */
  readonly onAssign?: () => void;
  /** Opens 恢复为库存中, for a device marked lost. */
  readonly onRestore?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReviewAction();
  const [unlinking, setUnlinking] = useState(false);
  const source = t(`deviceSync.sources.${record.source}`);
  const rows: [string, ReactNode][] = [
    ['deviceSync.fields.deviceName', record.deviceName],
    // How the record came to this device (2026-10-16): by its serial on a
    // pull, or by a person.
    [
      'deviceSync.fields.matchedBy',
      record.matchedBy
        ? t(`deviceSync.matchedBy.${record.matchedBy}`, {
            defaultValue: record.matchedBy,
          })
        : null,
    ],
    [
      'deviceSync.fields.os',
      [record.osName, record.osVersion].filter(Boolean).join(' '),
    ],
    [
      'deviceSync.fields.user',
      <span key='user' className='inline-flex flex-wrap items-center gap-2'>
        {record.personId ? (
          <HolderLink holderType='person' holderId={record.personId} />
        ) : (
          (record.userName ?? record.userPrincipal)
        )}
        {otherUser ? (
          <>
            <DifferenceTag>{t('deviceSync.checks.otherUserTag')}</DifferenceTag>
            {onTransfer ? (
              <Button variant='outline' onClick={onTransfer}>
                {t('deviceSync.checks.transferTo', {
                  user: record.userName ?? '',
                })}
              </Button>
            ) : null}
          </>
        ) : null}
      </span>,
    ],
    [
      'deviceSync.fields.lastSync',
      <span key='lastSync' className='inline-flex flex-wrap items-center gap-2'>
        <LastSync value={record.lastSyncAt} silent={silent} />
        {offDuty ? (
          <>
            <DifferenceTag critical={offDuty.critical}>
              {t('deviceSync.checks.statusTag', {
                status: t(`enums.deviceStatus.${offDuty.status}`),
              })}
            </DifferenceTag>
            {offDuty.status === 'inStock' && onAssign ? (
              <Button variant='outline' onClick={onAssign}>
                {t('deviceSync.checks.assignTo', {
                  user: record.userName ?? '',
                })}
              </Button>
            ) : null}
            {offDuty.status === 'lost' && onRestore ? (
              <Button variant='outline' onClick={onRestore}>
                {t('deviceSync.checks.restore')}
              </Button>
            ) : null}
          </>
        ) : null}
      </span>,
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
            <DifferenceTag>
              {t('deviceSync.gone', { date: formatDate(record.goneAt) })}
            </DifferenceTag>
          ) : null}
        </span>
        <span className='flex items-center gap-3'>
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
          {editable ? (
            <button
              type='button'
              onClick={() => setUnlinking(true)}
              className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
            >
              <Unlink className='size-3' />
              {t('deviceSync.unlink')}
            </button>
          ) : null}
        </span>
      </div>
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={t('deviceSync.unlinkTitle')}
        description={t('deviceSync.unlinkDescription', { source })}
        busy={review.isPending}
        error={review.error}
        onConfirm={() =>
          review.mutate(
            { kind: 'unlink', managedId: record.id },
            { onSuccess: () => setUnlinking(false) },
          )
        }
      />
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
function LastSync({
  value,
  silent = false,
}: {
  readonly value: string | null;
  /** Too long ago for a device in use: the age reads as a warning tag. */
  readonly silent?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  // The moment the page opened is "now": how long ago need not tick.
  const [now] = useState(() => Date.now());
  const date = toDate(value);
  if (!date) return <span className='text-muted-foreground'>—</span>;
  const days = Math.floor((now - date.getTime()) / 86_400_000);
  return (
    <span title={formatDate(value, true)}>
      {formatDate(value, true)}
      {silent ? (
        <DifferenceTag className='ml-2'>
          {days <= 0
            ? t('deviceSync.today')
            : t('deviceSync.daysAgo', { count: days })}
        </DifferenceTag>
      ) : (
        <span className='ml-2 text-muted-foreground'>
          {days <= 0
            ? t('deviceSync.today')
            : t('deviceSync.daysAgo', { count: days })}
        </span>
      )}
    </span>
  );
}
