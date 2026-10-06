import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftRight,
  Bookmark,
  BookmarkX,
  CheckCheck,
  Hammer,
  Handshake,
  MoreHorizontal,
  PowerOff,
  Recycle,
  Search,
  SearchX,
  Trash2,
  Undo2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import {
  Fragment,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Link,
  matchPath,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from 'react-router';

import {
  AssignDialog,
  type AssignValues,
} from '@/components/itam/assign-dialog';
import { FieldValue } from '@/components/itam/cells';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { DeviceReturnDialog } from '@/components/itam/device-return-dialog';
import { DeleteDialog } from '@/components/itam/delete-dialog';
import {
  DetailPage,
  InfoCard,
  InfoSection,
  InfoRow,
} from '@/components/itam/detail-page';
import { EmptyState } from '@/components/itam/empty-state';
import { FieldLabel } from '@/components/itam/field-label';
import { InlineField } from '@/components/itam/inline-field';
import { RepairCompleteButton } from '@/components/itam/repair-complete';
import { RepairCreateDialog } from '@/components/itam/repair-create-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { ReplacementDate, WarrantyDate } from '@/components/itam/warranty-date';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAnnounce } from '@/lib/itam/announce';
import {
  apiErrorBody,
  masterDataPath,
  useDeleteImpact,
  useItamMutations,
  useItamRecord,
  useRelatedCounts,
  type ItamRecord,
} from '@/lib/itam/api';
import {
  DEVICES_PATH,
  useDeviceOperation,
  type DeviceOperation,
} from '@/lib/itam/device-api';
import {
  ASSIGNEE_TYPES,
  DEVICE_FIELDS,
  DEVICE_STATUSES,
  OPERATION_FROM,
  type AssigneeType,
} from '@/lib/itam/devices';
import { attachmentCount, useAttachmentGroups } from '@/lib/itam/attachments';
import { useDeviceRelatedCount } from '@/lib/itam/holdings';
import type { FieldDefinition } from '@/lib/itam/fields';
import {
  defaultLoanReturnDate,
  deviceLabel,
  errorMessage,
  text,
  todayIso,
} from '@/lib/itam/format';
import { REPAIRS_PATH } from '@/lib/itam/operations';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';
import { AiQuickEntries } from '@/components/itam/ai/quick-entries';

import { DisposalCreateDialog } from '../disposals/create-dialog.js';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { useDeviceDisposals } from '@/lib/itam/device-disposals';

type DialogKind =
  | 'assign'
  | 'loan'
  | 'transfer'
  | 'return'
  | 'reserve'
  | 'unreserve'
  | 'restore'
  | 'reactivate'
  | 'requestDisposal'
  | 'createRepair'
  | 'markLost'
  | 'retire'
  | 'correctStatus'
  | 'delete';

interface TemplateField {
  readonly key: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly hidden?: boolean;
}

export default function DeviceDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const parentPath = useResolvedPath('.');
  const device = useItamRecord<ItamRecord>(DEVICES_PATH, id);
  const attachments = useAttachmentGroups('devices', id);
  const relatedCount = useDeviceRelatedCount(id);
  const [repairCount, openRepairCount] = useRelatedCounts([
    { path: REPAIRS_PATH, query: { filter: { deviceId: id } } },
    // One repair in progress at a time: a second one is not offered.
    {
      path: REPAIRS_PATH,
      query: { filter: { deviceId: id, result: 'inProgress' } },
    },
  ]);
  const repairPermissions = useCollectionPermissions('repairs', ['create']);
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    device.data?.categoryId as string | undefined,
  );
  const mutations = useItamMutations<ItamRecord>(DEVICES_PATH);
  const operation = useDeviceOperation();
  const announce = useAnnounce();
  const disposalPermissions = useCollectionPermissions('disposals', [
    'create',
    'read',
  ]);
  // Every disposal the device was on, for the 报废单 tab count.
  const disposalList = useDeviceDisposals(
    id,
    Boolean(disposalPermissions.read),
  );
  const permissions = useCollectionPermissions('devices', [
    'update',
    'delete',
    'assign',
    'return',
    'transfer',
    'loan',
    'reserve',
    'correctStatus',
  ]);
  const [dialog, setDialog] = useState<DialogKind>();
  const [showHidden, setShowHidden] = useState(false);
  const impact = useDeleteImpact(
    DEVICES_PATH,
    dialog === 'delete' ? id : undefined,
  );

  const data = device.data;
  // The same strip the record drawer shows for a device. Its hooks run on
  // every render, so it sits with the other hooks, above the early returns.
  const summary = RECORD_SUMMARIES.devices.items(data ?? { id }, t);
  const referenceRequests = useMemo(
    () => [
      ...DEVICE_FIELDS.filter(
        (field) => field.type === 'reference' && field.reference,
      ).map((field) => ({
        collection: field.reference!.collection,
        ids: [data?.[field.key] as string | null],
      })),
      {
        collection: 'people',
        ids: [
          data?.assigneeType === 'person' ? (data.assigneeId as string) : null,
          data?.reservedForType === 'person'
            ? (data.reservedForId as string)
            : null,
        ],
      },
      {
        collection: 'locations',
        ids: [
          data?.assigneeType === 'location'
            ? (data.assigneeId as string)
            : null,
          data?.reservedForType === 'location'
            ? (data.reservedForId as string)
            : null,
        ],
      },
      {
        collection: 'devices',
        ids: [
          data?.assigneeType === 'device' ? (data.assigneeId as string) : null,
          data?.reservedForType === 'device'
            ? (data.reservedForId as string)
            : null,
        ],
      },
      { collection: 'users', ids: [data?.ownerId as string | null] },
    ],
    [data],
  );
  const names = useReferenceNames(referenceRequests);

  const isParentEntry = matchPath(
    { path: parentPath.pathname, end: true },
    location.pathname,
  );
  if (isParentEntry) {
    return (
      <Navigate to={{ pathname: 'history', search: location.search }} replace />
    );
  }
  if (device.isLoading) {
    return (
      <section className='mx-auto w-full max-w-7xl space-y-4 p-6'>
        <Skeleton className='h-8 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </section>
    );
  }
  if (device.error || !data) {
    return (
      <section className='mx-auto w-full max-w-7xl p-6'>
        <EmptyState
          title={t('common.notFound')}
          action={
            <Button variant='outline' onClick={() => void navigate('/devices')}>
              {t('common.backToList')}
            </Button>
          }
        />
      </section>
    );
  }

  const status = text(data.status);
  const disposed = status === 'disposed';
  const editable = !disposed && Boolean(permissions.update);
  const run = async (op: DeviceOperation, body?: Record<string, unknown>) => {
    // Who held it, read before the return clears it: if they have left, the
    // toast says how much of their handover is left.
    const holder =
      text(data.assigneeType) === 'person' ? text(data.assigneeId) : '';
    await operation.mutateAsync({ id, operation: op, body });
    setDialog(undefined);
    operation.reset();
    if (op === 'return')
      await announce(
        t('people.recovery.toast.returned', {
          label: [text(data.deviceNo), text(data.name)]
            .filter(Boolean)
            .join(' / '),
        }),
        [holder],
      );
  };

  const fullTemplate = (
    Array.isArray(category.data?.fieldTemplate)
      ? category.data.fieldTemplate
      : []
  ) as TemplateField[];
  // Hidden template fields stay out of the way unless the reader asks.
  const hiddenCount = fullTemplate.filter((entry) => entry.hidden).length;
  const template = showHidden
    ? fullTemplate
    : fullTemplate.filter((entry) => !entry.hidden);
  const attributes = (
    data.attributes && typeof data.attributes === 'object'
      ? data.attributes
      : {}
  ) as Record<string, unknown>;

  const groups = new Map<string, FieldDefinition[]>();
  for (const field of DEVICE_FIELDS) {
    // The name is the title; `detail: false` fields live in the title or
    // the summary strip (the record drawer skips them the same way).
    if (field.key === 'name' || field.detail === false) continue;
    // 负责人 is the first row of 基本信息 (2026-10-05): who answers for the
    // device is read before what it is, and handed over in place.
    if (field.key === 'ownerId') {
      groups.set('groups.basic', [
        ...(groups.get('groups.basic') ?? []),
        { ...field, group: 'groups.basic', detailOrder: -1000 },
      ]);
      continue;
    }
    const group = field.group ?? 'groups.basic';
    groups.set(group, [...(groups.get(group) ?? []), field]);
  }

  const saveFields = async (input: Record<string, unknown>) => {
    try {
      await mutations.update.mutateAsync({ id, input });
    } catch (error) {
      throw new Error(apiErrorBody(error)?.message ?? errorMessage(error), {
        cause: error,
      });
    }
  };
  const saveField = async (field: string, value: unknown) => {
    try {
      await mutations.update.mutateAsync({ id, input: { [field]: value } });
    } catch (error) {
      throw new Error(apiErrorBody(error)?.message ?? errorMessage(error), {
        cause: error,
      });
    }
  };

  const actionButtons: ReactNode[] = [];
  const push = (
    key: string,
    allowed: boolean | undefined,
    icon: ReactNode,
    label: string,
    onClick: () => void,
    variant: 'default' | 'outline' = 'outline',
  ) => {
    if (!allowed) return;
    actionButtons.push(
      <Button key={key} variant={variant} onClick={onClick}>
        {icon}
        {label}
      </Button>,
    );
  };
  if (status === 'inStock') {
    push(
      'assign',
      permissions.assign,
      <UserPlus data-icon='inline-start' />,
      t('deviceActions.assign.title'),
      () => setDialog('assign'),
      'default',
    );
    push(
      'loan',
      permissions.loan,
      <Handshake data-icon='inline-start' />,
      t('deviceActions.loan.title'),
      () => setDialog('loan'),
    );
    if (data.reservedForId) {
      push(
        'unreserve',
        permissions.reserve,
        <BookmarkX data-icon='inline-start' />,
        t('deviceActions.unreserve.title'),
        () => setDialog('unreserve'),
      );
    } else {
      push(
        'reserve',
        permissions.reserve,
        <Bookmark data-icon='inline-start' />,
        t('deviceActions.reserve.title'),
        () => setDialog('reserve'),
      );
    }
  }
  if (status === 'inRepair') {
    // The open repair record drives the device out of repair.
    actionButtons.push(<RepairCompleteButton key='repairDone' deviceId={id} />);
  }
  if (status === 'inUse' || status === 'onLoan') {
    push(
      'return',
      permissions.return,
      // The same icon as every other "take it back": stock, seats and the
      // leaver's recovery all use it.
      <Undo2 data-icon='inline-start' />,
      t('deviceActions.return.title'),
      () => setDialog('return'),
      'default',
    );
  }
  if (status === 'inUse') {
    push(
      'transfer',
      permissions.transfer,
      <ArrowLeftRight data-icon='inline-start' />,
      t('deviceActions.transfer.title'),
      () => setDialog('transfer'),
    );
  }
  if (status === 'lost') {
    push(
      'restore',
      permissions.update,
      <Search data-icon='inline-start' />,
      t('deviceActions.restore.title'),
      () => setDialog('restore'),
      'default',
    );
  }
  if (status === 'retired') {
    push(
      'reactivate',
      permissions.update,
      <CheckCheck data-icon='inline-start' />,
      t('deviceActions.reactivate.title'),
      () => setDialog('reactivate'),
      'default',
    );
  }

  const tabs = [
    { key: 'history', label: t('tabs.history'), to: 'history' },
    {
      key: 'attachments',
      label: t('tabs.attachments'),
      to: 'attachments',
      count: attachmentCount(attachments.data),
    },
    {
      key: 'related',
      label: t('tabs.relatedAssets'),
      to: 'related',
      count: relatedCount,
    },
    {
      key: 'documents',
      label: t('tabs.documents'),
      to: 'documents',
      // The order it came in on, its repairs and its disposals; a list the
      // reader may not see counts as none.
      count:
        data && repairCount !== undefined
          ? (data.purchaseOrderId ? 1 : 0) +
            repairCount +
            (disposalList.data?.length ?? 0)
          : undefined,
    },
  ];

  return (
    <>
      <DetailPage
        layout='narrow'
        breadcrumb={
          // Only the way back to the list; category, model and serial are
          // in the information column.
          <Link to='/devices' className='hover:text-foreground'>
            {t('devices.title')}
          </Link>
        }
        title={text(data.name)}
        // The number reads under the breadcrumb, like other numbered records.
        subtitle={text(data.deviceNo)}
        titleEdit={{
          // "编号 / 名称", like a model's "制造商 / 名称".
          value: text(data.name),
          editable,
          onSave: (value) => saveField('name', value),
        }}
        notice={
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <AiQuickEntries
              entries={[
                {
                  key: 'inspectDevice',
                  prompt: t('ai.prompts.inspectDevice', {
                    device: text(data.deviceNo),
                  }),
                },
                {
                  key: 'repairOrReplace',
                  prompt: t('ai.prompts.repairOrReplace', {
                    device: text(data.deviceNo),
                  }),
                },
                {
                  key: 'lifecycleInfo',
                  prompt: t('ai.prompts.lifecycleInfo', {
                    model: names.models?.get(text(data.modelId)) ?? '',
                  }),
                },
              ]}
            />
          </div>
        }
        actions={
          <>
            {actionButtons}
            {!disposed &&
            (permissions.update ||
              permissions.correctStatus ||
              permissions.delete) ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon'
                      aria-label={t('common.more')}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  {/* Repair / disposal open their forms with this device
                      filled in. */}
                  {repairPermissions.create &&
                  (OPERATION_FROM.createRepair as readonly string[]).includes(
                    status,
                  ) &&
                  openRepairCount === 0 ? (
                    <DropdownMenuItem onClick={() => setDialog('createRepair')}>
                      <Hammer />
                      {t('repairs.new')}
                    </DropdownMenuItem>
                  ) : null}
                  {disposalPermissions.create &&
                  status !== 'pendingDisposal' ? (
                    <DropdownMenuItem
                      onClick={() => setDialog('requestDisposal')}
                    >
                      <Recycle />
                      {t('deviceActions.requestDisposal')}
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.update &&
                  ['inUse', 'onLoan', 'inStock', 'retired'].includes(status) ? (
                    <DropdownMenuItem onClick={() => setDialog('markLost')}>
                      <SearchX />
                      {t('deviceActions.markLost.title')}
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.update && status === 'inStock' ? (
                    <DropdownMenuItem onClick={() => setDialog('retire')}>
                      <PowerOff />
                      {t('deviceActions.retire.title')}
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.correctStatus ? (
                    <DropdownMenuItem
                      onClick={() => setDialog('correctStatus')}
                    >
                      <Wrench />
                      {t('deviceActions.correctStatus.title')}
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.delete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant='destructive'
                        onClick={() => setDialog('delete')}
                      >
                        <Trash2 />
                        {t('actions.deleteObject', {
                          object: t('devices.object'),
                        })}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
        summary={summary}
        info={
          <InfoCard>
            {[...groups.entries()].map(([group, fields], index) => (
              <Fragment key={group}>
                <InfoSection title={t(group)}>
                  {fields
                    .filter((field) => field.visibleWhen?.(data) ?? true)
                    .toSorted(
                      (a, b) => (a.detailOrder ?? 0) - (b.detailOrder ?? 0),
                    )
                    .map((field) => (
                      <InfoRow
                        key={field.key}
                        label={
                          <FieldLabel
                            label={t(field.label)}
                            hint={
                              field.readonlyHint &&
                              (field.form === false ||
                                field.readonlyWhen?.(data))
                                ? field.readonlyHint
                                : undefined
                            }
                          />
                        }
                      >
                        <InlineField
                          field={field}
                          value={
                            field.currencyField
                              ? {
                                  amount: data[field.key],
                                  currency: data[field.currencyField],
                                }
                              : data[field.key]
                          }
                          editable={
                            editable &&
                            field.form !== false &&
                            !field.readonlyWhen?.(data)
                          }
                          recordId={id}
                          display={
                            <span className='inline-flex flex-wrap items-baseline gap-x-3'>
                              {field.key === 'warrantyEndDate' ? (
                                <WarrantyDate value={data.warrantyEndDate} />
                              ) : field.key === 'plannedReplacementDate' ? (
                                <ReplacementDate
                                  value={data.plannedReplacementDate}
                                />
                              ) : (
                                <FieldValue
                                  field={field}
                                  value={data[field.key]}
                                  names={names}
                                  currency={text(data.currency)}
                                  plainEnums
                                />
                              )}
                            </span>
                          }
                          onSave={(value) =>
                            field.currencyField
                              ? saveFields({
                                  [field.key]: (value as { amount?: unknown })
                                    .amount,
                                  [field.currencyField]: (
                                    value as { currency?: unknown }
                                  ).currency,
                                })
                              : saveField(field.key, value)
                          }
                        />
                      </InfoRow>
                    ))}
                </InfoSection>
                {/* A category's extended fields belong with the basics. */}
                {index === 0 ? (
                  <>
                    {fullTemplate.length > 0 ? (
                      <InfoSection
                        title={t('groups.extended')}
                        action={
                          hiddenCount > 0 ? (
                            <label className='flex items-center gap-2 text-xs text-muted-foreground'>
                              {t('devices.showHiddenFields', {
                                count: hiddenCount,
                              })}
                              <Switch
                                checked={showHidden}
                                onCheckedChange={setShowHidden}
                                aria-label={t('devices.showHiddenFields', {
                                  count: hiddenCount,
                                })}
                              />
                            </label>
                          ) : undefined
                        }
                      >
                        {template.map((entry) => {
                          const field: FieldDefinition = {
                            key: entry.key,
                            label: entry.label,
                            type: entry.type,
                            required: entry.required,
                            options: entry.options?.map((option) => ({
                              value: option,
                              label: option,
                            })),
                          };
                          return (
                            <InfoRow
                              key={entry.key}
                              label={
                                entry.hidden ? (
                                  <span className='text-muted-foreground line-through'>
                                    {entry.label}
                                  </span>
                                ) : (
                                  entry.label
                                )
                              }
                            >
                              <InlineField
                                field={field}
                                value={attributes[entry.key]}
                                editable={editable && !entry.hidden}
                                display={
                                  <span>
                                    {attributes[entry.key] === undefined ||
                                    attributes[entry.key] === null ||
                                    attributes[entry.key] === '' ? (
                                      <span className='text-muted-foreground'>
                                        —
                                      </span>
                                    ) : (
                                      text(attributes[entry.key])
                                    )}
                                  </span>
                                }
                                onSave={(value) =>
                                  saveField('attributes', {
                                    ...attributes,
                                    [entry.key]: value,
                                  })
                                }
                              />
                            </InfoRow>
                          );
                        })}
                      </InfoSection>
                    ) : null}
                  </>
                ) : null}
              </Fragment>
            ))}
          </InfoCard>
        }
        tabs={tabs}
      >
        <Outlet
          context={{
            // The category's extended-field labels, for the change log.
            keyLabels: Object.fromEntries(
              fullTemplate.map((entry) => [entry.key, entry.label]),
            ),
          }}
        />
      </DetailPage>

      {dialog === 'assign' || dialog === 'loan' || dialog === 'transfer' ? (
        <AssignDialog
          open
          mode={dialog}
          excludeDeviceId={id}
          // A reserved device is meant for its reservation's target.
          initialTarget={
            dialog !== 'transfer' &&
            typeof data.reservedForType === 'string' &&
            typeof data.reservedForId === 'string' &&
            (dialog === 'assign' || data.reservedForType === 'person')
              ? {
                  type: data.reservedForType as AssigneeType,
                  id: data.reservedForId,
                }
              : undefined
          }
          // A reservation locks the dialog to its target; cancelling it
          // from here frees the picker without leaving the dialog.
          lockedTarget={
            dialog !== 'transfer' &&
            typeof data.reservedForType === 'string' &&
            typeof data.reservedForId === 'string'
              ? {
                  type: data.reservedForType as AssigneeType,
                  id: data.reservedForId,
                  until: data.reservedUntil,
                }
              : undefined
          }
          onUnlock={async () => {
            await operation.mutateAsync({ id, operation: 'unreserve' });
            operation.reset();
          }}
          onOpenChange={(open) => !open && setDialog(undefined)}
          submitting={operation.isPending}
          error={operation.error}
          onSubmit={(values: AssignValues) => run(dialog, { ...values })}
        />
      ) : null}
      {dialog === 'return' ? (
        <DeviceReturnDialog
          currentLocationId={text(data.locationId) || null}
          busy={operation.isPending}
          error={operation.error}
          onClose={() => setDialog(undefined)}
          onConfirm={(body) => void run('return', body)}
        />
      ) : null}
      {dialog === 'reserve' ? (
        <ReserveDialog
          excludeDeviceId={id}
          busy={operation.isPending}
          error={operation.error}
          onClose={() => setDialog(undefined)}
          onConfirm={(body) => void run('reserve', body)}
        />
      ) : null}
      {dialog === 'unreserve' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(undefined)}
          title={t('deviceActions.unreserve.title')}
          description={t('deviceActions.unreserve.description', {
            name:
              (data.reservedForType === 'person'
                ? names.people
                : data.reservedForType === 'location'
                  ? names.locations
                  : names.devices
              )?.get(text(data.reservedForId)) ?? '…',
          })}
          busy={operation.isPending}
          error={operation.error}
          confirmLabel={t('deviceActions.unreserve.confirm')}
          onConfirm={() => void run('unreserve')}
        />
      ) : null}
      {dialog === 'restore' ||
      dialog === 'reactivate' ||
      dialog === 'retire' ? (
        // Plain state changes: confirm, no explanation needed.
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(undefined)}
          title={t(`deviceActions.${dialog}.title`)}
          description={t(`deviceActions.${dialog}.description`)}
          busy={operation.isPending}
          error={operation.error}
          confirmLabel={t(`deviceActions.${dialog}.title`)}
          onConfirm={() => void run(dialog)}
        />
      ) : null}
      {dialog === 'createRepair' ? (
        <RepairCreateDialog
          deviceId={id}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        />
      ) : null}
      {dialog === 'requestDisposal' ? (
        <DisposalCreateDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
          deviceIds={[id]}
          onCreated={(created) => {
            setDialog(undefined);
            void navigate(`/disposals/${created.id}`);
          }}
        />
      ) : null}
      {dialog === 'markLost' ? (
        <NotesDialog
          busy={operation.isPending}
          error={operation.error}
          onClose={() => setDialog(undefined)}
          onConfirm={(notes) => void run('mark-lost', { notes })}
        />
      ) : null}
      {dialog === 'correctStatus' ? (
        <CorrectStatusDialog
          current={status}
          busy={operation.isPending}
          error={operation.error}
          onClose={() => setDialog(undefined)}
          onConfirm={(body) => void run('correct-status', body)}
        />
      ) : null}
      <DeleteDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(undefined);
            mutations.remove.reset();
          }
        }}
        objectLabel={t('devices.object')}
        recordName={deviceLabel(data)}
        impact={impact.data}
        loadingImpact={impact.isLoading}
        deleting={mutations.remove.isPending}
        error={
          mutations.remove.error
            ? (apiErrorBody(mutations.remove.error)?.message ??
              errorMessage(mutations.remove.error))
            : undefined
        }
        collectionLabel={(name) =>
          t(`references.${name}`, { defaultValue: name })
        }
        onConfirm={() => {
          void mutations.remove
            .mutateAsync(id)
            .then(() => navigate('/devices'));
        }}
      />
    </>
  );
}

function ReserveDialog({
  excludeDeviceId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  readonly excludeDeviceId: string;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onConfirm: (body: Record<string, unknown>) => void;
}): ReactElement {
  const { t } = useTranslation();
  // Reserved for whoever it will be assigned to — the same three targets
  // as the assign dialog.
  const [targetType, setTargetType] = useState<AssigneeType>('person');
  const [targetId, setTargetId] = useState<string | null>(null);
  // Two weeks out, like a loan's return date; the user may change it.
  const [until, setUntil] = useState(() => defaultLoanReturnDate());
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('deviceActions.reserve.title')}
      description={t('deviceActions.reserve.description')}
      busy={busy}
      error={error}
      disabled={!targetId || !until || until < todayIso()}
      confirmLabel={t('deviceActions.reserve.confirm')}
      onConfirm={() =>
        onConfirm({
          reservedForType: targetType,
          reservedForId: targetId,
          reservedUntil: until,
        })
      }
    >
      <Tabs
        value={targetType}
        onValueChange={(value) => {
          setTargetType(value as AssigneeType);
          setTargetId(null);
        }}
      >
        <TabsList>
          {ASSIGNEE_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {t(`enums.assigneeType.${type}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className='grid gap-1.5'>
        <Label htmlFor='reserve-target'>
          {t(`enums.assigneeType.${targetType}`)}
        </Label>
        <ReferenceSelect
          id='reserve-target'
          reference={{
            collection:
              targetType === 'person'
                ? 'people'
                : targetType === 'location'
                  ? 'locations'
                  : 'devices',
            ...(targetType === 'person'
              ? { filter: { 'employmentStatus:ne': 'left' } }
              : {}),
          }}
          value={targetId}
          onChange={setTargetId}
          excludeId={excludeDeviceId}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='reserve-until'>{t('fields.reservedUntil')}</Label>
        <Input
          id='reserve-until'
          type='date'
          max='9999-12-31'
          min={todayIso()}
          value={until}
          onChange={(event) => setUntil(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

function NotesDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  readonly busy: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onConfirm: (notes: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('deviceActions.markLost.title')}
      description={t('deviceActions.markLost.description')}
      busy={busy}
      error={error}
      destructive
      confirmLabel={t('deviceActions.markLost.confirm')}
      onConfirm={() => onConfirm(notes)}
    >
      <div className='grid gap-1.5'>
        {/* What happened is worth writing down, but a device is lost
            whether or not anyone can say why. */}
        <Label htmlFor='notes-dialog'>{t('fields.notes')}</Label>
        <Textarea
          id='notes-dialog'
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

function CorrectStatusDialog({
  current,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  readonly current: string;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onConfirm: (body: Record<string, unknown>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string>(current);
  const [reason, setReason] = useState('');
  const items = DEVICE_STATUSES.filter((value) => value !== 'disposed').map(
    (value) => ({ value, label: t(`enums.deviceStatus.${value}`) }),
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('deviceActions.correctStatus.title')}
      description={t('deviceActions.correctStatus.description')}
      busy={busy}
      error={error}
      disabled={!reason.trim() || status === current}
      confirmLabel={t('deviceActions.correctStatus.confirm')}
      onConfirm={() => onConfirm({ status, reason })}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor='correct-status'>{t('fields.status')}</Label>
        <Select
          items={items}
          value={status}
          onValueChange={(value) => setStatus(String(value))}
        >
          <SelectTrigger id='correct-status' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='correct-reason'>
          {t('deviceActions.correctStatus.reason')}{' '}
          <span className='text-destructive'>*</span>
        </Label>
        <Textarea
          id='correct-reason'
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

/** The create form of another domain: its field definitions in create order. */
