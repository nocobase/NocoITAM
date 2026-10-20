import { useTranslation } from '@nocobase/i18n/client';
import { ApproverHint } from '@/components/itam/approver-hint';
import { createApprovalDecisions } from '@/components/itam/ai/approval-decisions';
import { DISPOSAL_CARD } from '@/components/itam/board-card-specs';
import { createStatusBoard } from '@/components/itam/status-board';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Recycle, Send, Trash2, Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { DisposalCreateDialog } from './create-dialog.js';

import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { EmptyState } from '@/components/itam/empty-state';
import { FieldInput } from '@/components/itam/field-input';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { RecipientInput } from '@/components/itam/recipient-input';
import { MineView } from '@/components/itam/mine-view';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { SummaryLead } from '@/components/itam/summary-lead';
import { DataTable } from '@/components/itam/data-table';
import { RecordLink } from '@/components/itam/record-link';
import { TreePath } from '@/components/itam/tree-path';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorBody, useApi, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import type { DomainConfig } from '@/lib/itam/domain';
import {
  deviceLabel,
  errorMessage,
  formatDate,
  formatMoney,
  text,
} from '@/lib/itam/format';
import {
  DATA_WIPE_OPTIONS,
  DISPOSALS_PATH,
  DISPOSAL_CREATE_FIELDS,
  DISPOSAL_FIELDS,
  DISPOSAL_STATUS_DOT,
  WIPE_METHODS,
} from '@/lib/itam/operations';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { usePagedRows } from '@/lib/itam/paging';
import { useReferenceNames } from '@/lib/itam/references';
import { useConfirm } from '@/lib/itam/use-confirm';

// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export const disposalDomain: DomainConfig = {
  name: 'disposals',
  path: DISPOSALS_PATH,
  route: 'disposals',
  i18n: 'disposals',
  fields: DISPOSAL_FIELDS,
  createFields: DISPOSAL_CREATE_FIELDS,
  // A draft or a rejected request is edited in full; an approved one only
  // where the decision did not reach — what happens to the data.
  // The recipient is one row: the vendor it names, or the name typed in.
  fieldDisplay: (field, record) =>
    field.key === 'recipientVendorId' && !record.recipientVendorId
      ? text(record.recipientName) || '—'
      : undefined,
  editable: (record) =>
    ['draft', 'rejected', 'approved'].includes(text(record.status)),
  // Anyone may hand an open disposal over (`OPEN_DISPOSAL_STATUSES` in
  // `recovery.ts`), including while it waits for a decision.
  handover: {
    field: 'ownerId',
    open: (record) =>
      ['draft', 'pendingApproval', 'approved', 'rejected'].includes(
        text(record.status),
      ),
  },
  // Opens on a board by status; the list is one click away.
  Board: createStatusBoard({
    path: DISPOSALS_PATH,
    route: 'disposals',
    ...DISPOSAL_CARD,
    dots: DISPOSAL_STATUS_DOT,
    statuses: ['draft', 'pendingApproval', 'approved', 'executed', 'rejected'],
    defaultSort: 'createdAt',
  }),
  nameField: 'disposalNo',
  defaultSort: 'createdAt',
  deletable: (record) => text(record.status) === 'draft',
  // Beside 提交审批 and the other steps in the header; deletion goes in the
  // "more" menu.
  deleteInMenu: true,
  tabs: [
    // No devices tab: the list reads in its own card above the tabs. No
    // approvals tab: submitted, withdrawn and decided are history events.
    { key: 'attachments', label: 'tabs.attachments' },
  ],
  summaryTimestamps: false,
  // 全部 | 我的 (2026-10-20).
  Views: MineView,
  Aside: DisposalDevicesCard,
  Create: DisposalCreateDialog,
  Actions: DisposalActions,
  // 等你决定: 审批审阅's review for the approver (2026-10-16).
  Decisions: createApprovalDecisions('disposals', DISPOSALS_PATH),
  // The summary leads 基本信息 (2026-10-16); no summary strip.
  BasicLead: ({ record }) => (
    <SummaryLead record={record} summary={RECORD_SUMMARIES.disposals} />
  ),
};

/**
 * What the approver is deciding on: the devices this disposal lists and the
 * book value that leaves the books with them. Without cost access the rows
 * carry no book value, so the total is left out rather than shown as zero.
 */
function DecidedDevices({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const id = text(record.id);
  const devices = useQuery({
    queryKey: ['itam', DISPOSALS_PATH, 'devices', id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${DISPOSALS_PATH}/${id}/devices`,
        })
      ).data,
    enabled: Boolean(id),
  });
  const rows = devices.data ?? [];
  if (rows.length === 0) return <></>;
  const currency = text(record.currency);
  const priced = rows.some((row) => 'bookValue' in row);
  return (
    <div className='overflow-hidden rounded-lg border border-border text-sm'>
      <ul className='max-h-48 divide-y divide-border overflow-y-auto'>
        {rows.map((row) => (
          <li key={text(row.id)} className='flex items-center gap-3 px-3 py-2'>
            <span className='min-w-0 flex-1 truncate'>{deviceLabel(row)}</span>
            {priced ? (
              <span className='min-w-24 shrink-0 whitespace-nowrap text-right tabular-nums'>
                {formatMoney(row.bookValue, currency) || '—'}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {priced ? (
        <div className='flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-2'>
          <span className='text-muted-foreground'>
            {t('fields.bookValueTotal')}
          </span>
          <span className='whitespace-nowrap font-medium tabular-nums'>
            {formatMoney(record.bookValueTotal, currency) || '—'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DisposalActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('disposals', [
    'submit',
    'approve',
    'execute',
  ]);
  const [dialog, setDialog] = useState<'submit' | 'decide' | 'execute'>();
  // Who is being asked: one person who may approve a disposal.
  const [approverId, setApproverId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  // The execution confirms what the request already said about where the
  // devices go and what happens to the data on them, so the dialog opens on
  // those answers rather than on an empty form that would overwrite them.
  const [execution, setExecution] = useState<Record<string, unknown>>(() => ({
    recipientVendorId: record.recipientVendorId ?? null,
    recipientName: record.recipientName ?? null,
    dataWipe: record.dataWipe ?? 'notRequired',
    wipeMethod: record.wipeMethod ?? null,
  }));
  const run = useMutation({
    mutationFn: async (input: {
      operation: string;
      body?: Record<string, unknown>;
    }) =>
      api.request({
        path: `${DISPOSALS_PATH}/${record.id}/${input.operation}`,
        method: 'POST',
        json: input.body ?? {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      setDialog(undefined);
      setComment('');
    },
  });
  const confirm = useConfirm();
  const status = text(record.status);
  const currentUserId = useCurrentUserId();
  // The approval trail answers two questions: who is being asked now, and
  // who the request went through — carrying it out belongs to them.
  const approvalTrail = useQuery({
    queryKey: ['itam', DISPOSALS_PATH, 'approvals', text(record.id)],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${DISPOSALS_PATH}/${text(record.id)}/approvals`,
        })
      ).data,
    enabled: ['pendingApproval', 'approved'].includes(status),
  });
  const asked = approvalTrail.data?.find(
    (entry) => text(entry.status) === 'pending',
  );
  const askedIds = Array.isArray(asked?.approverIds)
    ? (asked.approverIds as string[])
    : [];
  // Either nobody was named or it is this reader. The 负责人 may be the
  // one named — a deployment with a single Asset Manager has nobody else to
  // ask (2026-09-27), so the page no longer hides what the service allows.
  const mayDecide =
    Boolean(permissions.approve) &&
    status === 'pendingApproval' &&
    (askedIds.length === 0 ||
      (currentUserId !== undefined && askedIds.includes(currentUserId)));
  const involved = (approvalTrail.data ?? []).some(
    (entry) =>
      text(entry.decidedById) === currentUserId ||
      (Array.isArray(entry.approverIds) &&
        currentUserId !== undefined &&
        (entry.approverIds as unknown[]).includes(currentUserId)),
  );
  const buttons: ReactElement[] = [];
  // Asking for approval, and taking the request back, belong to its 负责人,
  // or to whoever wrote it before handing it over. The service refuses
  // everyone else ('NOT_OWNER').
  const mine =
    currentUserId !== undefined &&
    (text(record.ownerId) === currentUserId ||
      text(record.createdById) === currentUserId);
  // An empty disposal has nothing to approve, so the service refuses it
  // ('NO_DEVICES'); the button says so before it is pressed, the way the
  // purchase order's does about its lines.
  const hasDevices = Number(record.deviceCount ?? 0) > 0;
  if (permissions.submit && mine && ['draft', 'rejected'].includes(status)) {
    buttons.push(
      <Button
        key='submit'
        disabled={!hasDevices}
        title={hasDevices ? undefined : t('disposals.submitNeedsDevices')}
        onClick={() => {
          run.reset();
          setApproverId(null);
          setDialog('submit');
        }}
      >
        <Send data-icon='inline-start' />
        {/* Withdrawn or rejected, it is being asked again. */}
        {t(status === 'draft' ? 'disposals.submit' : 'disposals.resubmit')}
      </Button>,
    );
  }
  if (permissions.submit && mine && status === 'pendingApproval') {
    buttons.push(
      <Button
        key='withdraw'
        variant='outline'
        onClick={() =>
          confirm.ask({
            title: t('disposals.withdraw'),
            description: t('confirmations.withdraw'),
            confirmLabel: t('disposals.withdraw'),
            action: () => run.mutateAsync({ operation: 'withdraw' }),
          })
        }
      >
        <Undo2 data-icon='inline-start' />
        {t('disposals.withdraw')}
      </Button>,
    );
  }
  if (mayDecide) {
    buttons.push(
      <Button
        key='decide'
        onClick={() => {
          run.reset();
          setDialog('decide');
        }}
      >
        <Check data-icon='inline-start' />
        {t('procurement.decide')}
      </Button>,
    );
  }
  // Carrying it out is for the people the request went through, the way
  // the service has it ('NOT_INVOLVED').
  if (permissions.execute && status === 'approved' && (mine || involved)) {
    buttons.push(
      <Button
        key='execute'
        onClick={() => {
          run.reset();
          setDialog('execute');
        }}
      >
        <Recycle data-icon='inline-start' />
        {t('disposals.execute')}
      </Button>,
    );
  }
  // What the execution answers, in the order it happens; the amounts carry
  // the disposal's currency beside them.
  const executionValue = (key: string): unknown =>
    key === 'executedById' && !(key in execution)
      ? currentUserId
      : execution[key];
  const executionFields: FieldDefinition[] = [
    {
      key: 'executedById',
      label: 'fields.executedBy',
      type: 'reference',
      reference: { collection: 'users' },
    },
    // The recipient is one question with two kinds of answer; it has its
    // own control, rendered where it sits in this list.
    { key: 'recipient', label: 'fields.recipient', type: 'text' },
    { key: 'disposedAt', label: 'fields.disposedAt', type: 'date' },
    {
      key: 'proceeds',
      label: 'fields.proceeds',
      type: 'money',
      currencyField: 'currency',
    },
    {
      key: 'expenses',
      label: 'fields.expenses',
      type: 'money',
      currencyField: 'currency',
    },
    {
      key: 'dataWipe',
      label: 'fields.dataWipe',
      type: 'select',
      required: true,
      options: DATA_WIPE_OPTIONS.map((value) => ({
        value,
        label: `enums.dataWipe.${value}`,
      })),
      // Something wiped has to say how: one cascading answer, one save.
      dependent: {
        key: 'wipeMethod',
        label: 'fields.wipeMethod',
        required: true,
        options: WIPE_METHODS.map((value) => ({
          value,
          label: `enums.wipeMethod.${value}`,
        })),
        when: (value: unknown) => value === 'wiped',
      },
    },
  ];
  return (
    <>
      {confirm.dialog}
      {buttons}
      {run.error && !dialog ? (
        <span className='text-sm text-destructive'>
          {apiErrorBody(run.error)?.message ?? errorMessage(run.error)}
        </span>
      ) : null}
      <ConfirmDialog
        open={dialog === 'submit'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('disposals.submit')}
        description={t('confirmations.submit')}
        busy={run.isPending}
        error={run.error}
        disabled={!approverId}
        confirmLabel={t('disposals.submit')}
        onConfirm={() =>
          run.mutate({
            operation: 'submit',
            body: { approverId },
          })
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='disposal-approver'>
            {t('procurement.approver')}
            <span className='text-destructive'> *</span>
          </Label>
          <ReferenceSelect
            id='disposal-approver'
            reference={{
              collection: 'approvers',
              filter: { subject: 'disposal' },
            }}
            value={approverId}
            onChange={setApproverId}
          />
          <ApproverHint
            subject='disposal'
            hint={t('procurement.approverHint')}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'decide'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('procurement.decide')}
        description={t('disposals.decideDescription')}
        busy={run.isPending}
        error={run.error}
        confirmLabel={t('procurement.approve')}
        onConfirm={() =>
          run.mutate({
            operation: 'decide',
            body: { decision: 'approved', comment: comment || undefined },
          })
        }
        // Rejecting is the other outcome of the same decision, so it belongs
        // beside 批准 in the footer, not among the inputs above it.
        secondaryLabel={t('procurement.reject')}
        secondaryDestructive
        onSecondary={() =>
          run.mutate({
            operation: 'decide',
            body: { decision: 'rejected', comment: comment || undefined },
          })
        }
      >
        <DecidedDevices record={record} />
        <div className='grid gap-1.5'>
          <Label htmlFor='decide-comment'>{t('procurement.comment')}</Label>
          <Textarea
            id='decide-comment'
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'execute'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('disposals.execute')}
        description={t('disposals.executeDescription')}
        busy={run.isPending}
        error={run.error}
        disabled={
          !execution.dataWipe ||
          (execution.dataWipe === 'wiped' && !execution.wipeMethod)
        }
        destructive
        confirmLabel={t('disposals.execute')}
        onConfirm={() =>
          run.mutate({
            operation: 'execute',
            body: Object.fromEntries(
              Object.entries({
                ...execution,
                executedById: executionValue('executedById'),
              }).filter(
                ([, value]) =>
                  value !== null && value !== undefined && value !== '',
              ),
            ),
          })
        }
      >
        {executionFields.map((field) =>
          field.key === 'recipient' ? (
            <RecipientInput
              key={field.key}
              id='execute-recipient'
              vendorId={text(execution.recipientVendorId) || null}
              name={text(execution.recipientName)}
              onChange={(value) =>
                setExecution((current) => ({
                  ...current,
                  recipientVendorId: value.vendorId,
                  recipientName: value.name,
                }))
              }
            />
          ) : (
            <div key={field.key} className='grid gap-1.5'>
              <Label htmlFor={`execute-${field.key}`}>
                {t(field.label)}
                {field.required ? (
                  <span className='text-destructive'> *</span>
                ) : null}
              </Label>
              <FieldInput
                id={`execute-${field.key}`}
                field={field}
                value={
                  field.currencyField
                    ? {
                        amount: execution[field.key] ?? null,
                        currency: execution.currency ?? record.currency ?? null,
                      }
                    : field.dependent
                      ? {
                          value: execution[field.key] ?? null,
                          dependent: execution[field.dependent.key] ?? null,
                        }
                      : executionValue(field.key)
                }
                onChange={(value) => {
                  const pair = (value ?? {}) as Record<string, unknown>;
                  if (field.currencyField) {
                    setExecution((current) => ({
                      ...current,
                      [field.key]: pair.amount ?? null,
                      currency: pair.currency ?? null,
                    }));
                    return;
                  }
                  if (field.dependent) {
                    const dependentKey = field.dependent.key;
                    setExecution((current) => ({
                      ...current,
                      [field.key]: pair.value ?? null,
                      [dependentKey]: pair.dependent ?? null,
                    }));
                    return;
                  }
                  setExecution((current) => ({
                    ...current,
                    [field.key]: value,
                  }));
                }}
              />
            </div>
          ),
        )}
      </ConfirmDialog>
    </>
  );
}

/**
 * The devices listed on the disposal, editable while it is a draft. They are
 * what the disposal is, so they read in a card of their own above the tabs,
 * the way a purchase order's lines do.
 */
function DisposalDevicesCard({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const id = text(record.id);
  const api = useApi();
  const queryClient = useQueryClient();
  const disposal = { data: record };
  const permissions = useCollectionPermissions('disposals', ['update']);
  const devices = useQuery({
    queryKey: ['itam', DISPOSALS_PATH, 'devices', id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${DISPOSALS_PATH}/${id}/devices`,
        })
      ).data,
  });
  const rows = devices.data ?? [];
  const names = useReferenceNames([
    { collection: 'models', ids: rows.map((row) => text(row.modelId)) },
  ]);
  const [adding, setAdding] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (deviceIds: readonly string[]) =>
      api.request({
        path: `${DISPOSALS_PATH}/${id}/devices`,
        method: 'POST',
        json: { deviceIds },
      }),
    onSuccess: async () => {
      setAdding(null);
      await queryClient.invalidateQueries({
        queryKey: ['itam', DISPOSALS_PATH],
      });
    },
  });
  const confirmRemove = useConfirm();
  const editable =
    Boolean(permissions.update) &&
    ['draft', 'rejected'].includes(text(disposal.data?.status));
  const currentIds = rows.map((row) => text(row.deviceId));
  const currency = text(disposal.data?.currency);
  const paged = usePagedRows(rows);

  return (
    <Card className='@container py-0'>
      <CardContent className='space-y-3 p-4'>
        {confirmRemove.dialog}
        <div className='flex min-h-9 flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2'>
          <h2 className='font-heading text-sm font-semibold'>
            {t('disposals.devices')}
          </h2>
          {editable ? (
            <div className='flex flex-wrap items-center justify-end gap-2'>
              <div className='min-w-56'>
                <FieldInput
                  id='disposal-add-device'
                  field={{
                    key: 'deviceId',
                    label: 'disposals.addDevice',
                    type: 'reference',
                    reference: { collection: 'devices' },
                    placeholder: 'disposals.addDevice',
                  }}
                  value={adding}
                  onChange={(value) => setAdding(value ? text(value) : null)}
                />
              </div>
              <Button
                size='sm'
                disabled={
                  !adding || currentIds.includes(adding) || save.isPending
                }
                onClick={() => adding && save.mutate([...currentIds, adding])}
              >
                <Plus data-icon='inline-start' />
                {t('actions.add')}
              </Button>
            </div>
          ) : null}
        </div>
        {save.error ? (
          <p className='text-sm text-destructive'>
            {apiErrorBody(save.error)?.message ?? errorMessage(save.error)}
          </p>
        ) : null}
        {/* A table like the other device lists: 编号 / 名称 opens the device,
          the book value is the one frozen when it was listed. */}
        <DataTable
          columns={[
            {
              key: 'device',
              header: t('devices.noAndName'),
              render: (row: ItamRecord) => (
                <RecordLink
                  to={`/devices/${text(row.deviceId)}`}
                  className='font-medium text-link underline-offset-4 hover:underline'
                >
                  {deviceLabel(row)}
                </RecordLink>
              ),
            },
            {
              key: 'modelId',
              header: t('fields.model'),
              className: 'w-px whitespace-nowrap',
              render: (row: ItamRecord) =>
                names.models?.get(text(row.modelId)) ?? '—',
            },
            {
              key: 'categoryId',
              header: t('fields.category'),
              className: 'w-px whitespace-nowrap',
              render: (row: ItamRecord) =>
                row.categoryId ? (
                  <TreePath
                    collection='categories'
                    nodeId={row.categoryId}
                    show='leaf'
                  />
                ) : (
                  '—'
                ),
            },
            {
              key: 'status',
              header: t('fields.status'),
              className: 'w-px whitespace-nowrap',
              render: (row: ItamRecord) => (
                <DeviceStatusBadge status={row.status} />
              ),
            },
            {
              key: 'purchaseDate',
              header: t('fields.purchaseDate'),
              className: 'w-px whitespace-nowrap',
              render: (row: ItamRecord) => formatDate(row.purchaseDate) || '—',
            },
            // Without cost access the rows carry no book value, and so no
            // column.
            ...(rows.some((row) => 'bookValue' in row)
              ? [
                  {
                    key: 'bookValue',
                    header: t('fields.bookValue'),
                    className: 'w-px whitespace-nowrap text-right',
                    render: (row: ItamRecord) =>
                      formatMoney(row.bookValue, currency) || '—',
                  },
                ]
              : []),
          ]}
          rows={paged.rows}
          loading={devices.isLoading}
          error={devices.error}
          empty={<EmptyState title={t('disposals.noAssets')} />}
          pagination={paged.pagination}
          rowActions={
            editable
              ? (row: ItamRecord) => (
                  <Button
                    size='icon-sm'
                    variant='ghost'
                    aria-label={t('actions.remove')}
                    disabled={save.isPending}
                    onClick={() =>
                      confirmRemove.ask({
                        title: t('actions.remove'),
                        description: t('confirmations.removeDisposalDevice', {
                          name: deviceLabel(row),
                        }),
                        confirmLabel: t('actions.remove'),
                        destructive: true,
                        action: () =>
                          save.mutateAsync(
                            currentIds.filter(
                              (deviceId) => deviceId !== text(row.deviceId),
                            ),
                          ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )
              : undefined
          }
        />
      </CardContent>
    </Card>
  );
}

export function DisposalAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='disposals' ownerId={id} />;
}
