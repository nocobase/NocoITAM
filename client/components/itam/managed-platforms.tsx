import { useTranslation } from '@nocobase/i18n/client';
import { AlertTriangle, ExternalLink, Unlink } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog.js';
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
      {/* Where the platforms and the register disagree (step 2), first. */}
      {/* A notice only for a difference with something to do about it
          (2026-10-16): silence is the record's own last sync, marked. */}
      {checks
        .filter((check) => check.kind !== 'stale')
        .map((check) => (
          <CheckNotice key={check.kind} check={check} actions={actions} />
        ))}
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
              silent={checks.some(
                (check) =>
                  check.kind === 'stale' && check.managedDeviceId === record.id,
              )}
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
          size='sm'
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

/**
 * One difference, said in a sentence, with the act that settles it on the
 * register's side and 忽略 for when the register is right.
 */
function CheckNotice({
  check,
  actions,
}: {
  readonly check: DeviceCheck;
  readonly actions?: CheckActions;
}): ReactElement {
  const { t } = useTranslation();
  const source = t(`deviceSync.sources.${check.source}`);
  const user = check.userName ?? '';
  // 失联 has no notice: its record's last sync is marked instead.
  const sentence =
    check.kind === 'userMismatch'
      ? t('deviceSync.checks.userSentence', { user, source })
      : t('deviceSync.checks.statusSentence', {
          status: t(`enums.deviceStatus.${check.status}`),
          date: formatDate(check.lastSyncAt),
          source,
        });
  const editable = actions?.editable ?? false;
  return (
    <Alert
      variant={check.critical ? 'destructive' : 'default'}
      // The theme's 注意 tone, or 错 for a device that should not be online.
      className={
        check.critical
          ? 'mb-3 border-destructive/40'
          : 'mb-3 border-warning-foreground/25 bg-warning text-warning-foreground'
      }
    >
      <AlertTriangle />
      <AlertDescription className='flex flex-col gap-2'>
        <span>{sentence}</span>
        {/* The register's own acts only (2026-10-16): 忽略 is MDM 核对's,
            where what was ignored is listed and taken back. */}
        {editable &&
        ((check.kind === 'userMismatch' && check.personId) ||
          (check.kind === 'statusMismatch' &&
            ((check.status === 'inStock' && check.personId) ||
              check.status === 'lost'))) ? (
          <span className='flex flex-wrap gap-2'>
            {check.kind === 'userMismatch' && check.personId ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => actions?.onTransfer(check.personId!)}
              >
                {t('deviceSync.checks.transferTo', { user })}
              </Button>
            ) : null}
            {check.kind === 'statusMismatch' &&
            check.status === 'inStock' &&
            check.personId ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => actions?.onAssign(check.personId!)}
              >
                {t('deviceSync.checks.assignTo', { user })}
              </Button>
            ) : null}
            {check.kind === 'statusMismatch' && check.status === 'lost' ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() => actions?.onRestore()}
              >
                {t('deviceSync.checks.restore')}
              </Button>
            ) : null}
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function PlatformRecord({
  record,
  editable,
  silent = false,
}: {
  readonly record: ManagedDevice;
  readonly editable: boolean;
  /** The record a 失联 was read from: its last sync is marked. */
  readonly silent?: boolean;
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
      record.personId ? (
        <HolderLink key='user' holderType='person' holderId={record.personId} />
      ) : (
        (record.userName ?? record.userPrincipal)
      ),
    ],
    [
      'deviceSync.fields.lastSync',
      <LastSync key='lastSync' value={record.lastSyncAt} silent={silent} />,
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
        <Badge
          data-size='sm'
          className='ml-2 bg-warning text-warning-foreground'
        >
          {t('deviceSync.daysAgo', { count: days })}
        </Badge>
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
