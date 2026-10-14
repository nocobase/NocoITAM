import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { BackButton } from '@/components/back-button';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { HolderLink } from '@/components/itam/holder-link';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  REVIEW_VIEWS,
  useDeviceReview,
  useDeviceReviewAction,
  type DeviceCheck,
  type ReviewView,
  type UnregisteredDevice,
} from '@/lib/itam/device-sync';
import { formatDate } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * 管理平台核对 (device sync, step 2, 2026-10-15): where the device management
 * platforms and the register disagree, one view at a time — the devices
 * whose platform record says otherwise, the platform records nobody put on
 * the register, the devices in use no platform reports, and the records a
 * person kept off the register. Opened from 待办 (设备核对, 需要关注) and
 * from 设置 → 设备同步, so it has no menu entry and no page grant; its
 * endpoint answers whoever may read devices.
 */
export default function DeviceSyncReviewPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const view: ReviewView = REVIEW_VIEWS.includes(requested as ReviewView)
    ? (requested as ReviewView)
    : 'checks';
  return (
    <Page>
      <BackButton to='/' />
      <PageHeader
        title={t('deviceSync.review.title')}
        description={t('deviceSync.review.description')}
      />
      <Tabs
        value={view}
        onValueChange={(next) =>
          setParams({ view: String(next) }, { replace: true })
        }
      >
        <TabsList variant='line'>
          {REVIEW_VIEWS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`deviceSync.review.views.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className='text-sm text-muted-foreground'>
        {t(`deviceSync.review.hints.${view}`)}
      </p>
      {view === 'checks' ? (
        <ChecksView />
      ) : view === 'unmanaged' ? (
        <UnmanagedView />
      ) : (
        <RecordsView view={view} />
      )}
    </Page>
  );
}

function Empty(): ReactElement {
  const { t } = useTranslation();
  return (
    <p className='rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground'>
      {t('deviceSync.review.empty')}
    </p>
  );
}

const deviceLabel = (row: {
  readonly deviceNo: string | null;
  readonly deviceName?: string | null;
  readonly name?: string | null;
}) => [row.deviceNo, row.deviceName ?? row.name].filter(Boolean).join(' / ');

/** Devices whose platform record says otherwise than the register. */
function ChecksView(): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReview('checks');
  const action = useDeviceReviewAction();
  const rows = review.data ?? [];
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: rows.flatMap((row) => (row.ownerId ? [row.ownerId] : [])),
    },
  ]);
  if (review.isLoading) return <Skeleton className='h-40 w-full rounded-xl' />;
  if (rows.length === 0) return <Empty />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('deviceSync.review.columns.device')}</TableHead>
          <TableHead>{t('deviceSync.review.columns.difference')}</TableHead>
          <TableHead>{t('deviceSync.fields.lastSync')}</TableHead>
          <TableHead>{t('deviceSync.fields.user')}</TableHead>
          <TableHead>{t('fields.owner')}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row: DeviceCheck) => (
          <TableRow key={`${row.deviceId}:${row.kind}`}>
            <TableCell>
              <RecordLink
                to={`/devices/${row.deviceId}`}
                className='font-medium text-foreground hover:underline'
              >
                {deviceLabel(row)}
              </RecordLink>
            </TableCell>
            <TableCell>
              <Badge variant={row.critical ? 'destructive' : 'outline'}>
                {t(`deviceSync.checks.kinds.${row.kind}`)}
              </Badge>
              {row.kind === 'statusMismatch' ? (
                <span className='ml-2 text-xs text-muted-foreground'>
                  {t(`enums.deviceStatus.${row.status}`)}
                </span>
              ) : null}
            </TableCell>
            <TableCell className='whitespace-nowrap tabular-nums'>
              {row.goneAt
                ? t('deviceSync.gone', { date: formatDate(row.goneAt) })
                : formatDate(row.lastSyncAt, true)}
            </TableCell>
            <TableCell>
              {row.personId ? (
                <HolderLink holderType='person' holderId={row.personId} />
              ) : (
                (row.userName ?? '—')
              )}
            </TableCell>
            <TableCell>
              {row.ownerId ? (people.users?.get(row.ownerId) ?? '…') : '—'}
            </TableCell>
            <TableCell className='text-right'>
              <Button
                size='sm'
                variant='ghost'
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    kind: 'dismiss',
                    deviceId: row.deviceId,
                    check: row.kind,
                  })
                }
              >
                {t('deviceSync.checks.keepRegister')}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Devices in use, in a category that should be managed, on no platform. */
function UnmanagedView(): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReview('unmanaged');
  const rows = review.data ?? [];
  if (review.isLoading) return <Skeleton className='h-40 w-full rounded-xl' />;
  if (rows.length === 0) return <Empty />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('deviceSync.review.columns.device')}</TableHead>
          <TableHead>{t('deviceSync.review.columns.holder')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <RecordLink
                to={`/devices/${row.id}`}
                className='font-medium text-foreground hover:underline'
              >
                {deviceLabel(row)}
              </RecordLink>
            </TableCell>
            <TableCell>
              {row.assigneeType && row.assigneeId ? (
                <HolderLink
                  holderType={row.assigneeType}
                  holderId={row.assigneeId}
                />
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Platform records off the register: the ones nobody has decided on, with
 * 补登记 / 关联到已有设备 / 不纳入台账, or the ones kept off, with 恢复.
 */
function RecordsView({
  view,
}: {
  readonly view: 'unregistered' | 'ignored';
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const review = useDeviceReview(view);
  const action = useDeviceReviewAction();
  const [linking, setLinking] = useState<UnregisteredDevice>();
  const [target, setTarget] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<UnregisteredDevice>();
  const [reason, setReason] = useState('');
  const rows = review.data ?? [];
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: rows.flatMap((row) => (row.ignoredById ? [row.ignoredById] : [])),
    },
  ]);
  // 补登记: the device list's own create form, filled with what the
  // platform knows; the new device is linked by its serial when saved.
  const register = (row: UnregisteredDevice) => {
    const query = new URLSearchParams({ new: '1' });
    if (row.serialNo) query.set('init.serialNo', row.serialNo);
    if (row.deviceName) query.set('init.name', row.deviceName);
    if (row.suggestedModelId) query.set('init.modelId', row.suggestedModelId);
    if (row.suggestedCategoryId)
      query.set('init.categoryId', row.suggestedCategoryId);
    if (row.suggestedManufacturerId)
      query.set('init.manufacturerId', row.suggestedManufacturerId);
    void navigate(`/devices?${query.toString()}`);
  };
  if (review.isLoading) return <Skeleton className='h-40 w-full rounded-xl' />;
  if (rows.length === 0) return <Empty />;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('deviceSync.fields.deviceName')}</TableHead>
            <TableHead>{t('fields.serialNo')}</TableHead>
            <TableHead>
              {t('deviceSync.review.columns.platformModel')}
            </TableHead>
            <TableHead>{t('deviceSync.fields.user')}</TableHead>
            <TableHead>
              {view === 'ignored'
                ? t('deviceSync.review.columns.reason')
                : t('deviceSync.fields.lastSync')}
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <span className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>
                    {row.deviceName ?? row.externalId}
                  </span>
                  {/* Which platforms report it: one row per device. */}
                  <span className='text-xs text-muted-foreground'>
                    {row.sources
                      .map((source) => t(`deviceSync.sources.${source}`))
                      .join(' · ')}
                  </span>
                  {row.ownership === 'personal' ? (
                    <Badge variant='outline' data-size='sm'>
                      {t('deviceSync.ownership.personal')}
                    </Badge>
                  ) : null}
                  {row.consoleUrl ? (
                    <a
                      href={row.consoleUrl}
                      target='_blank'
                      rel='noreferrer'
                      aria-label={t('deviceSync.openIn', {
                        source: t(`deviceSync.sources.${row.source}`),
                      })}
                      className='text-muted-foreground hover:text-foreground'
                    >
                      <ExternalLink className='size-3.5' />
                    </a>
                  ) : null}
                </span>
              </TableCell>
              <TableCell className='tabular-nums'>
                {row.serialNo ?? '—'}
                {row.matchState === 'ambiguous' ? (
                  <span className='block text-xs text-warning-foreground'>
                    {t('deviceSync.review.sharedSerial', {
                      count: row.candidates.length,
                    })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                {[row.manufacturer, row.model].filter(Boolean).join(' ') || '—'}
              </TableCell>
              <TableCell>
                {row.personId ? (
                  <HolderLink holderType='person' holderId={row.personId} />
                ) : (
                  (row.userName ?? '—')
                )}
              </TableCell>
              <TableCell className='text-sm'>
                {view === 'ignored' ? (
                  <span>
                    {row.ignoreReason}
                    <span className='block text-xs text-muted-foreground'>
                      {[
                        row.ignoredById
                          ? (people.users?.get(row.ignoredById) ?? '…')
                          : null,
                        formatDate(row.ignoredAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                ) : (
                  <span className='whitespace-nowrap tabular-nums'>
                    {formatDate(row.lastSyncAt, true)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <span className='flex flex-wrap justify-end gap-1'>
                  {view === 'ignored' ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ kind: 'restore', managedId: row.id })
                      }
                    >
                      {t('deviceSync.review.restore')}
                    </Button>
                  ) : (
                    <>
                      {row.matchState === 'unlinked' ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => register(row)}
                        >
                          {t('deviceSync.review.register')}
                        </Button>
                      ) : null}
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setTarget(row.candidates[0]?.id ?? null);
                          setLinking(row);
                        }}
                      >
                        {t('deviceSync.review.link')}
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => {
                          setReason('');
                          setIgnoring(row);
                        }}
                      >
                        {t('deviceSync.review.ignore')}
                      </Button>
                    </>
                  )}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={Boolean(linking)}
        onOpenChange={(open) => !open && setLinking(undefined)}
        title={t('deviceSync.review.linkTitle')}
        description={t('deviceSync.review.linkDescription', {
          name: linking?.deviceName ?? linking?.externalId ?? '',
        })}
        busy={action.isPending}
        error={action.error}
        confirmDisabled={!target}
        onConfirm={() => {
          if (!linking || !target) return;
          action.mutate(
            { kind: 'link', managedId: linking.id, deviceId: target },
            { onSuccess: () => setLinking(undefined) },
          );
        }}
      >
        <div className='flex flex-col gap-2'>
          {linking && linking.candidates.length > 0 ? (
            <div className='flex flex-col gap-1'>
              <Label>{t('deviceSync.review.candidates')}</Label>
              {linking.candidates.map((candidate) => (
                <label
                  key={candidate.id}
                  className='flex items-center gap-2 text-sm'
                >
                  <input
                    type='radio'
                    name='candidate'
                    checked={target === candidate.id}
                    onChange={() => setTarget(candidate.id)}
                  />
                  {candidate.label}
                </label>
              ))}
            </div>
          ) : null}
          <Label>{t('deviceSync.review.pickDevice')}</Label>
          <ReferenceSelect
            reference={{ collection: 'devices' }}
            value={target}
            onChange={(value) => setTarget(value)}
            initialSearch={linking?.serialNo ?? ''}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(ignoring)}
        onOpenChange={(open) => !open && setIgnoring(undefined)}
        title={t('deviceSync.review.ignoreTitle')}
        description={t('deviceSync.review.ignoreDescription', {
          name: ignoring?.deviceName ?? ignoring?.externalId ?? '',
        })}
        busy={action.isPending}
        error={action.error}
        confirmDisabled={!reason.trim()}
        onConfirm={() => {
          if (!ignoring || !reason.trim()) return;
          action.mutate(
            { kind: 'ignore', managedId: ignoring.id, reason: reason.trim() },
            { onSuccess: () => setIgnoring(undefined) },
          );
        }}
      >
        <div className='flex flex-col gap-2'>
          <Label htmlFor='ignore-reason'>{t('deviceSync.review.reason')}</Label>
          <Textarea
            id='ignore-reason'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('deviceSync.review.reasonPlaceholder')}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
