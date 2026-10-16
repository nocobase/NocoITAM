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
import { CellText } from '@/components/itam/cell-text';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { KeepRegisterDialog } from '@/components/itam/managed-platforms';
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
  type ExemptDevice,
  type ReviewView,
  type UnmanagedDevice,
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
  // 不需要纳管 is a section of 只在台账 in the same way (2026-10-15).
  const view: (typeof TABS)[number] =
    requested === 'ignored'
      ? 'unregistered'
      : requested === 'exempted'
        ? 'unmanaged'
        : requested === 'dismissed'
          ? 'checks'
          : TABS.includes(requested as (typeof TABS)[number])
            ? (requested as (typeof TABS)[number])
            : 'checks';
  const ignoredRef = useRef<HTMLElement>(null);
  const ignoredShown = view === 'unregistered' && (counts.ignored ?? 0) > 0;
  const exemptedShown = view === 'unmanaged' && (counts.exempted ?? 0) > 0;
  // The differences a person ignored, under 信息不一致 (2026-10-16).
  const dismissedShown = view === 'checks' && (counts.dismissed ?? 0) > 0;
  useEffect(() => {
    if (
      (requested === 'ignored' && ignoredShown) ||
      (requested === 'exempted' && exemptedShown) ||
      (requested === 'dismissed' && dismissedShown)
    )
      ignoredRef.current?.scrollIntoView({ block: 'start' });
  }, [requested, ignoredShown, exemptedShown, dismissedShown]);
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
              to='/settings/mdm'
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
        <UnmanagedView view='unmanaged' />
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
      {dismissedShown ? (
        <section
          ref={ignoredRef}
          className='mt-4 flex scroll-mt-4 flex-col gap-3'
        >
          <div className='space-y-1'>
            <h2 className='font-medium'>
              {t('deviceSync.review.dismissedHeading', {
                count: counts.dismissed,
              })}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('deviceSync.review.dismissedHint')}
            </p>
          </div>
          <DismissedView />
        </section>
      ) : null}
      {exemptedShown ? (
        <section
          ref={ignoredRef}
          className='mt-4 flex scroll-mt-4 flex-col gap-3'
        >
          <div className='space-y-1'>
            <h2 className='font-medium'>
              {t('deviceSync.review.exemptedHeading', {
                count: counts.exempted,
              })}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('deviceSync.review.exemptedHint')}
            </p>
          </div>
          <UnmanagedView view='exempted' />
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
  const exempted = useDeviceReview('exempted');
  const dismissed = useDeviceReview('dismissed');
  const byRule = ignored.data?.filter((row) => row.ignoredByRule).length;
  return {
    checks: checks.data?.length,
    unregistered: unregistered.data?.length,
    unmanaged: unmanaged.data?.length,
    ignored: ignored.data?.length,
    exempted: exempted.data?.length,
    dismissed: dismissed.data?.length,
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
  // 忽略 asks first (2026-10-16): the difference is not raised again.
  const [keeping, setKeeping] = useState<DeviceCheck>();
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
    <>
      <div className='overflow-x-auto rounded-lg border border-border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('deviceSync.review.columns.device')}</TableHead>
              <TableHead>{t('deviceSync.review.columns.difference')}</TableHead>
              <TableHead>{t('deviceSync.fields.lastSync')}</TableHead>
              <TableHead>{t('deviceSync.fields.user')}</TableHead>
              <TableHead>{t('fields.owner')}</TableHead>
              <TableHead className='text-right'>
                {t('common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: DeviceCheck) => (
              <TableRow key={`${row.deviceId}:${row.kind}`}>
                <TableCell>
                  <CellText>
                    <RecordLink
                      to={`/devices/${row.deviceId}`}
                      className='font-medium text-foreground hover:underline'
                    >
                      {deviceLabel(row)}
                    </RecordLink>
                  </CellText>
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
                  <CellText className='max-w-48'>
                    {row.personId ? (
                      <HolderLink holderType='person' holderId={row.personId} />
                    ) : (
                      (row.userName ?? '—')
                    )}
                  </CellText>
                </TableCell>
                <TableCell>
                  <CellText className='max-w-48'>
                    {row.ownerId
                      ? (people.users?.get(row.ownerId) ?? '…')
                      : '—'}
                  </CellText>
                </TableCell>
                <TableCell className='text-right'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setKeeping(row)}
                  >
                    {t('deviceSync.checks.keepRegister')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <KeepRegisterDialog
        check={keeping}
        onClose={() => setKeeping(undefined)}
      />
    </>
  );
}

/**
 * The differences a person ignored that still hold (2026-10-16): who and
 * when, and 恢复, which raises the difference again.
 */
function DismissedView(): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReview('dismissed');
  const action = useDeviceReviewAction();
  const rows = review.data ?? [];
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: rows.flatMap((row) =>
        row.dismissedById ? [row.dismissedById] : [],
      ),
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
            <TableHead>{t('deviceSync.review.columns.markedBy')}</TableHead>
            <TableHead>{t('deviceSync.review.columns.markedAt')}</TableHead>
            <TableHead className='text-right'>{t('common.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.deviceId}:${row.kind}`}>
              <TableCell>
                <CellText>
                  <RecordLink
                    to={`/devices/${row.deviceId}`}
                    className='font-medium text-foreground hover:underline'
                  >
                    {deviceLabel(row)}
                  </RecordLink>
                </CellText>
              </TableCell>
              <TableCell>
                <Badge variant='outline'>
                  {t(`deviceSync.checks.kinds.${row.kind}`)}
                </Badge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                <CellText className='max-w-48'>
                  {row.dismissedById
                    ? (people.users?.get(row.dismissedById) ?? '…')
                    : '—'}
                </CellText>
              </TableCell>
              <TableCell className='text-muted-foreground tabular-nums'>
                {formatDate(row.dismissedAt ?? null)}
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      kind: 'undismiss',
                      deviceId: row.deviceId,
                      check: row.kind,
                    })
                  }
                >
                  {t('deviceSync.review.restore')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Devices in use, in a category that should be managed, on no platform —
 * with 不需要纳管 for one that rightly is (2026-10-15) — or, beneath them,
 * the ones marked so, with the reason and 恢复.
 */
function UnmanagedView({
  view,
}: {
  readonly view: 'unmanaged' | 'exempted';
}): ReactElement {
  const { t } = useTranslation();
  const review = useDeviceReview(view);
  const action = useDeviceReviewAction();
  const [exempting, setExempting] = useState<UnmanagedDevice>();
  const [reason, setReason] = useState('');
  const rows: readonly (UnmanagedDevice & Partial<ExemptDevice>)[] =
    review.data ?? [];
  const names = useReferenceNames([
    {
      collection: 'users',
      ids: rows.flatMap((row) => (row.exemptedById ? [row.exemptedById] : [])),
    },
    {
      collection: 'models',
      ids: rows.flatMap((row) => (row.modelId ? [row.modelId] : [])),
    },
  ]);
  if (review.isLoading) return <Skeleton className='h-40 w-full rounded-xl' />;
  if (rows.length === 0) return <Empty />;
  return (
    <>
      <div className='overflow-x-auto rounded-lg border border-border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('deviceSync.review.columns.device')}</TableHead>
              {/* The serial to find it by in MDM, and the model, which
                  says which platform it belongs on (2026-10-15). */}
              <TableHead>{t('fields.serialNo')}</TableHead>
              <TableHead>{t('fields.model')}</TableHead>
              <TableHead>{t('deviceSync.review.columns.holder')}</TableHead>
              {/* Who said so and when in columns of their own (2026-10-16):
                  under the reason they made the row two lines tall. */}
              {view === 'exempted' ? (
                <>
                  <TableHead>{t('deviceSync.review.columns.reason')}</TableHead>
                  <TableHead>
                    {t('deviceSync.review.columns.markedBy')}
                  </TableHead>
                  <TableHead>
                    {t('deviceSync.review.columns.markedAt')}
                  </TableHead>
                </>
              ) : null}
              <TableHead className='text-right'>
                {t('common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <CellText>
                    <RecordLink
                      to={`/devices/${row.id}`}
                      className='font-medium text-foreground hover:underline'
                    >
                      {deviceLabel(row)}
                    </RecordLink>
                  </CellText>
                </TableCell>
                <TableCell className='tabular-nums'>
                  {row.serialNo ?? '—'}
                </TableCell>
                <TableCell>
                  <CellText className='max-w-56'>
                    {row.modelId
                      ? (names.models?.get(row.modelId) ?? '…')
                      : '—'}
                  </CellText>
                </TableCell>
                <TableCell>
                  <CellText className='max-w-48'>
                    {row.assigneeType && row.assigneeId ? (
                      <HolderLink
                        holderType={row.assigneeType}
                        holderId={row.assigneeId}
                      />
                    ) : (
                      '—'
                    )}
                  </CellText>
                </TableCell>
                {view === 'exempted' ? (
                  <>
                    <TableCell>
                      <CellText className='max-w-md'>{row.reason}</CellText>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      <CellText className='max-w-48'>
                        {row.exemptedById
                          ? (names.users?.get(row.exemptedById) ?? '…')
                          : '—'}
                      </CellText>
                    </TableCell>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      {formatDate(row.exemptedAt ?? null)}
                    </TableCell>
                  </>
                ) : null}
                <TableCell>
                  <span className='flex justify-end'>
                    {view === 'exempted' ? (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ kind: 'unexempt', deviceId: row.id })
                        }
                      >
                        {t('deviceSync.review.restore')}
                      </Button>
                    ) : (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setReason('');
                          setExempting(row);
                        }}
                      >
                        {t('deviceSync.review.exempt')}
                      </Button>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={Boolean(exempting)}
        onOpenChange={(open) => !open && setExempting(undefined)}
        title={t('deviceSync.review.exemptTitle')}
        description={t('deviceSync.review.exemptDescription', {
          name: exempting ? deviceLabel(exempting) : '',
        })}
        busy={action.isPending}
        error={action.error}
        confirmDisabled={!reason.trim()}
        onConfirm={() => {
          if (!exempting || !reason.trim()) return;
          action.mutate(
            { kind: 'exempt', deviceId: exempting.id, reason: reason.trim() },
            { onSuccess: () => setExempting(undefined) },
          );
        }}
      >
        <div className='flex flex-col gap-2'>
          <Label htmlFor='exempt-reason'>{t('deviceSync.review.reason')}</Label>
          <Textarea
            id='exempt-reason'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('deviceSync.review.exemptPlaceholder')}
          />
        </div>
      </ConfirmDialog>
    </>
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
      // The serial links the new device to this record once saved, so it
      // is not to be changed here (2026-10-16); without one, it is typed.
      locked={
        registering?.serialNo
          ? { serialNo: 'deviceSync.review.serialFromPlatform' }
          : undefined
      }
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
              {view === 'ignored' ? (
                <>
                  <TableHead>{t('deviceSync.review.columns.reason')}</TableHead>
                  <TableHead>
                    {t('deviceSync.review.columns.markedBy')}
                  </TableHead>
                  <TableHead>
                    {t('deviceSync.review.columns.markedAt')}
                  </TableHead>
                </>
              ) : (
                <TableHead>{t('deviceSync.fields.lastSync')}</TableHead>
              )}
              <TableHead className='text-right'>
                {t('common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {/* The name gives way; where it is reported, its tag and
                      the console link stay. */}
                  <CellText>
                    <span className='flex min-w-0 items-center gap-2 [&>*]:shrink-0'>
                      <span className='min-w-0 shrink! truncate font-medium'>
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
                  </CellText>
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
                  <CellText className='max-w-56'>
                    {platformModel(row.manufacturer, row.model)}
                  </CellText>
                </TableCell>
                <TableCell>
                  <CellText className='max-w-48'>
                    {row.personId ? (
                      <HolderLink holderType='person' holderId={row.personId} />
                    ) : (
                      (row.userName ?? '—')
                    )}
                  </CellText>
                </TableCell>
                {view === 'ignored' ? (
                  <>
                    <TableCell>
                      <CellText className='max-w-md'>
                        {row.ignoredByRule
                          ? t('deviceSync.review.byRule')
                          : row.ignoreReason}
                      </CellText>
                    </TableCell>
                    {/* A personal device is kept off by the rule, not by
                        anybody, on no particular day. */}
                    <TableCell className='text-muted-foreground'>
                      <CellText className='max-w-48'>
                        {row.ignoredById
                          ? (people.users?.get(row.ignoredById) ?? '…')
                          : '—'}
                      </CellText>
                    </TableCell>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      {row.ignoredAt ? formatDate(row.ignoredAt) : '—'}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className='tabular-nums'>
                    {formatDate(row.lastSyncAt, true)}
                  </TableCell>
                )}
                <TableCell>
                  <span className='flex justify-end gap-1'>
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
                          variant='outline'
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
