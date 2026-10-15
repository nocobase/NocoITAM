import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { DeviceCreateDialog } from '@/components/itam/device-create-dialog';
import { EmptyState } from '@/components/itam/empty-state';
import { HistoryBackButton } from '@/components/itam/history-back-button';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { HolderLink } from '@/components/itam/holder-link';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
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
  DEVICE_SYNC_PATH,
  useDeviceReview,
  useDeviceReviewAction,
  type DeviceCheck,
  type ReviewView,
  type UnregisteredDevice,
} from '@/lib/itam/device-sync';
import type { ItamRecord } from '@/lib/itam/api';
import { useItamAi } from '@/lib/itam/ai-chat';
import { formatDate } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';
import { cn } from '@/lib/utils';

/**
 * MDM 核对 (device sync, step 2, 2026-10-15): where the device management
 * platforms and the register disagree, one view at a time — the devices
 * whose platform record says otherwise, the platform records nobody put on
 * the register, the devices in use no platform reports, and the records a
 * person kept off the register. Opened from 待办 (设备核对, 需要关注) and
 * from 设置 → MDM, so it has no menu entry and no page grant; its
 * endpoint answers whoever may read devices.
 */
export default function DeviceSyncReviewPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const ai = useItamAi();
  // MDM settings (connections, runs, the rules behind these lists)
  // for whoever may change them, the grant its API asks for.
  const { can: canSettle } = useCan({
    resource: { type: 'settings', id: 'itam.settings' },
    action: 'update',
  });
  const counts = useReviewCounts();
  const requested = params.get('view');
  // 已忽略 is a section of 只在 MDM: a link to it (the settings page's)
  // opens that tab and scrolls down to it.
  const view: (typeof TABS)[number] =
    requested === 'ignored'
      ? 'unregistered'
      : TABS.includes(requested as (typeof TABS)[number])
        ? (requested as (typeof TABS)[number])
        : 'checks';
  const ignoredRef = useRef<HTMLElement>(null);
  const ignoredShown = view === 'unregistered' && (counts.ignored ?? 0) > 0;
  useEffect(() => {
    if (requested === 'ignored' && ignoredShown)
      ignoredRef.current?.scrollIntoView({ block: 'start' });
  }, [requested, ignoredShown]);
  return (
    <Page>
      <HistoryBackButton fallback='/' />
      <PageHeader
        title={t('deviceSync.review.title')}
        description={t('deviceSync.review.description')}
        actions={
          canSettle ? (
            // A link drawn as a button: it goes to another page. Filled in
            // the foreground colour, as asked (2026-10-15).
            <Link
              to='/settings/itam?tab=deviceSync'
              className={cn(
                buttonVariants(),
                'bg-foreground text-background hover:bg-foreground/85',
              )}
            >
              <Settings2 data-icon='inline-start' />
              {t('deviceSync.review.settingsLink')}
            </Link>
          ) : undefined
        }
      />
      {/* Three ways the two lists disagree (2026-10-15): both have the
          device but say otherwise, only MDM has it, only the register has
          it — each with its count. What was kept off is not a fourth to-do:
          it is listed under 只在 MDM, beneath what still waits. */}
      <Tabs
        value={view}
        onValueChange={(next) =>
          setParams({ view: String(next) }, { replace: true })
        }
      >
        <TabsList variant='line'>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`deviceSync.review.views.${key}`)}
              {counts[key] === undefined ? null : (
                <span className='text-xs text-muted-foreground tabular-nums'>
                  {counts[key]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-sm text-muted-foreground'>
          {t(`deviceSync.review.hints.${view}`)}
        </p>
        {/* Noco explains the differences, or sorts out the records the
            register lacks into one plan (device-sync skill, step 4). */}
        {ai.available &&
        (view === 'checks' || view === 'unregistered') &&
        (counts[view] ?? 0) > 0 ? (
          <AiShortcut onClick={() => ai.ask(t(`deviceSync.prompts.${view}`))}>
            {t(`deviceSync.prompts.${view}Action`)}
          </AiShortcut>
        ) : null}
      </div>
      {view === 'checks' ? (
        <ChecksView />
      ) : view === 'unmanaged' ? (
        <UnmanagedView />
      ) : (
        <RecordsView view='unregistered' />
      )}
      {ignoredShown ? (
        <section
          ref={ignoredRef}
          className='mt-4 flex scroll-mt-4 flex-col gap-3'
        >
          <div className='space-y-1'>
            <h2 className='font-medium'>
              {t('deviceSync.review.ignoredHeading', {
                count: counts.ignored,
              })}
            </h2>
            {/* Each kind said once, and only the kinds there are. */}
            {(counts.ignoredManual ?? 0) > 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('deviceSync.review.ignoredManual', {
                  count: counts.ignoredManual,
                })}
              </p>
            ) : null}
            {(counts.ignoredByRule ?? 0) > 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('deviceSync.review.ignoredPersonal', {
                  count: counts.ignoredByRule,
                })}
              </p>
            ) : null}
          </div>
          <RecordsView view='ignored' />
        </section>
      ) : null}
    </Page>
  );
}

/** The views shown as tabs; 已忽略 is listed under 只在 MDM. */
const TABS = ['checks', 'unregistered', 'unmanaged'] as const;

/** Each view's count, as its own list reads it (undefined while loading). */
function useReviewCounts(): Partial<
  Record<ReviewView | 'ignoredManual' | 'ignoredByRule', number>
> {
  const checks = useDeviceReview('checks');
  const unregistered = useDeviceReview('unregistered');
  const unmanaged = useDeviceReview('unmanaged');
  const ignored = useDeviceReview('ignored');
  const byRule = ignored.data?.filter((row) => row.ignoredByRule).length;
  return {
    checks: checks.data?.length,
    unregistered: unregistered.data?.length,
    unmanaged: unmanaged.data?.length,
    ignored: ignored.data?.length,
    // 已忽略's two kinds: kept off by a person, or by 忽略个人设备.
    ignoredByRule: byRule,
    ignoredManual:
      ignored.data && byRule !== undefined
        ? ignored.data.length - byRule
        : undefined,
  };
}

/** The record lists' own empty state. */
function Empty(): ReactElement {
  const { t } = useTranslation();
  return <EmptyState title={t('deviceSync.review.empty')} />;
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
    <div className='overflow-x-auto rounded-lg border border-border bg-card'>
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
    </div>
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
    <div className='overflow-x-auto rounded-lg border border-border bg-card'>
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
    </div>
  );
}

/**
 * Platform records off the register: the ones nobody has decided on, with
 * 补登记 / 关联到已有设备 / 不纳入台账, or the ones kept off, with 恢复.
 */
/**
 * The platform's maker and model, the maker left out when the model already
 * starts with it, as Intune's often does ("HP ZHAN66 16+ G1i").
 */
function platformModel(
  manufacturer: string | null,
  model: string | null,
): string {
  if (!model) return manufacturer ?? '—';
  if (
    !manufacturer ||
    model.toLowerCase().startsWith(manufacturer.toLowerCase())
  )
    return model;
  return `${manufacturer} ${model}`;
}

function RecordsView({
  view,
}: {
  readonly view: 'unregistered' | 'ignored';
}): ReactElement {
  const { t } = useTranslation();
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
  // 补登记 opens 创建设备 here (2026-10-15), filled with all the platform
  // record gives: serial, name, model and with it category and maker, the
  // maker by name otherwise, the user's department, and a note of where it
  // came from. Saved, the device is linked by its serial and the row goes.
  const [registering, setRegistering] = useState<UnregisteredDevice>();
  const [registered, setRegistered] = useState<ItamRecord>();
  const queryClient = useQueryClient();
  const registerValues = (row: UnregisteredDevice) => {
    const notes = [
      t('deviceSync.review.registerNotes.source', {
        source: t(`deviceSync.sources.${row.source}`),
      }),
      row.userName
        ? t('deviceSync.review.registerNotes.user', { user: row.userName })
        : null,
      row.osName
        ? t('deviceSync.review.registerNotes.os', {
            os: [row.osName, row.osVersion].filter(Boolean).join(' '),
          })
        : null,
    ]
      .filter(Boolean)
      .join(t('deviceSync.review.registerNotes.separator'));
    return Object.fromEntries(
      Object.entries({
        serialNo: row.serialNo,
        name: row.deviceName,
        modelId: row.suggestedModelId,
        categoryId: row.suggestedCategoryId,
        manufacturerId: row.suggestedManufacturerId,
        departmentId: row.suggestedDepartmentId,
        notes,
      }).filter(([, value]) => Boolean(value)),
    );
  };
  if (review.isLoading) return <Skeleton className='h-40 w-full rounded-xl' />;
  const registerDialog = (
    <DeviceCreateDialog
      open={Boolean(registering)}
      onOpenChange={(open) => !open && setRegistering(undefined)}
      initial={registering ? registerValues(registering) : undefined}
      onCreated={async (created) => {
        setRegistered(created);
        await queryClient.invalidateQueries({
          queryKey: ['itam', DEVICE_SYNC_PATH],
        });
      }}
    />
  );
  // What was just registered, with the way to it: the row itself is gone.
  const notice = registered ? (
    <p className='text-sm'>
      {t('deviceSync.review.registered')}{' '}
      <RecordLink to={`/devices/${String(registered.id)}`}>
        {[registered.deviceNo, registered.name]
          .filter(Boolean)
          .map(String)
          .join(' / ')}
      </RecordLink>
    </p>
  ) : null;
  if (rows.length === 0)
    return (
      <>
        {notice}
        <Empty />
        {registerDialog}
      </>
    );
  return (
    <>
      {notice}
      {registerDialog}
      <div className='overflow-x-auto rounded-lg border border-border bg-card'>
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
                  {platformModel(row.manufacturer, row.model)}
                </TableCell>
                <TableCell>
                  {row.personId ? (
                    <HolderLink holderType='person' holderId={row.personId} />
                  ) : (
                    (row.userName ?? '—')
                  )}
                </TableCell>
                <TableCell className='text-sm'>
                  {view === 'ignored' && row.ignoredByRule ? (
                    <span>{t('deviceSync.review.byRule')}</span>
                  ) : view === 'ignored' ? (
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
                    {/* The rule brings a personal device back, not a row. */}
                    {view === 'ignored' && row.ignoredByRule ? null : view ===
                      'ignored' ? (
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
                            onClick={() => {
                              setRegistered(undefined);
                              setRegistering(row);
                            }}
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
      </div>

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
