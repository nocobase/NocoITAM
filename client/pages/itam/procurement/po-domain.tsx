import { useTranslation } from '@nocobase/i18n/client';
import { ApproverHint } from '@/components/itam/approver-hint';
import { createApprovalDecisions } from '@/components/itam/ai/approval-decisions';
import { CellText } from '@/components/itam/cell-text';
import { PURCHASE_ORDER_CARD } from '@/components/itam/board-card-specs';
import { createStatusBoard } from '@/components/itam/status-board';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Send, ShoppingCart, Undo2, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { ReferenceLink } from '@/components/itam/cells';
import { RecordLink } from '@/components/itam/record-link';
import { DeviceStatusBadge } from '@/components/itam/status-badge';

import { PurchaseOrderLinesCard } from './lines-tab.js';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { createMyApprovalView } from '@/components/itam/my-approval-view';
import { SummaryLead } from '@/components/itam/summary-lead';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { Paged } from '@/components/itam/paged';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useApi, useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import type { DomainConfig } from '@/lib/itam/domain';
import {
  addDays,
  deviceLabel,
  formatDate,
  formatMoney,
  text,
  todayIso,
} from '@/lib/itam/format';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import {
  PO_CREATE_FIELDS,
  PO_FIELDS,
  PO_STATUS_DOT,
  PURCHASE_ORDERS_PATH,
  raisedBy,
} from '@/lib/itam/procurement';
import { referenceRoute, useReferenceNames } from '@/lib/itam/references';
import { STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';
import { useConfirm } from '@/lib/itam/use-confirm';
import { PurchaseOrderCreateDialog } from './create-dialog.js';
import { DateField } from '@/components/itam/date-field';

// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export const purchaseOrderDomain: DomainConfig = {
  name: 'purchaseOrders',
  path: PURCHASE_ORDERS_PATH,
  route: 'procurement',
  i18n: 'procurement',
  fields: PO_FIELDS,
  createFields: PO_CREATE_FIELDS,
  // The same rule the service applies: the statuses it edits in
  // (`EDITABLE_STATUSES` in `procurement.ts`) and only for the side that
  // raised the order. A rejected order is open again, fields and lines both,
  // because resubmitting one nothing can change asks the approver to
  // reconsider the very thing they refused.
  editable: (record, currentUserId) =>
    raisedBy(record, currentUserId) &&
    ['draft', 'rejected', 'approved', 'ordered', 'partiallyReceived'].includes(
      text(record.status),
    ),
  // Anyone may hand an open order over (`OPEN_PURCHASE_ORDER_STATUSES` in
  // `recovery.ts`), including while it waits for a decision.
  handover: {
    field: 'ownerId',
    open: (record) =>
      [
        'draft',
        'pendingApproval',
        'approved',
        'rejected',
        'ordered',
        'partiallyReceived',
      ].includes(text(record.status)),
  },
  // Opens on a board by status; the list is one click away.
  Board: createStatusBoard({
    path: PURCHASE_ORDERS_PATH,
    route: 'procurement',
    ...PURCHASE_ORDER_CARD,
    dots: PO_STATUS_DOT,
    statuses: [
      'draft',
      'pendingApproval',
      'approved',
      'ordered',
      'partiallyReceived',
      'completed',
      'rejected',
      'cancelled',
    ],
    defaultSort: 'createdAt',
  }),
  nameField: 'orderNo',
  // What the service allows: anything submitted keeps its approval trail.
  deletable: (record) => ['draft', 'cancelled'].includes(text(record.status)),
  defaultSort: 'createdAt',
  tabs: [
    // No approvals tab: requested, withdrawn and decided are history events,
    // and the comment reads with the decision there.
    { key: 'generated', label: 'tabs.generated' },
    { key: 'attachments', label: 'tabs.attachments' },
  ],
  summaryTimestamps: false,
  deleteInMenu: true,
  // Header, lines and approver in one dialog: saved as a draft or
  // submitted for approval straight away.
  Create: PurchaseOrderCreateDialog,
  // The lines are the order itself, so they read above its tabs.
  Aside: PurchaseOrderLinesCard,
  Views: createMyApprovalView({
    collection: 'purchaseOrders',
    path: PURCHASE_ORDERS_PATH,
    label: 'procurement.myApproval',
  }),
  Actions: PurchaseOrderActions,
  // 等你决定: 审批审阅's review for the approver (2026-10-16).
  Decisions: createApprovalDecisions('purchaseOrders', PURCHASE_ORDERS_PATH),
  // Status, approver and the estimate lead 基本信息 (2026-10-16), as a
  // device's status does; no summary strip.
  BasicLead: ({ record }) => (
    <SummaryLead record={record} summary={RECORD_SUMMARIES.purchaseOrders} />
  ),
};

/** What the decision is about: the lines, as the order states them. */
function DecidedLines({ orderId }: { readonly orderId: string }): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const lines = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, 'lines', orderId],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/lines`,
        })
      ).data,
    enabled: Boolean(orderId),
  });
  const rows = lines.data ?? [];
  const names = useReferenceNames([
    { collection: 'models', ids: rows.map((row) => row.modelId as string) },
    {
      collection: 'softwareProducts',
      ids: rows.map((row) => row.softwareProductId as string),
    },
  ]);
  if (rows.length === 0) return <></>;
  const amountOf = (row: ItamRecord) =>
    Number(row.quantity) * Number(row.unitPrice ?? 0);
  // A reader without cost access gets the lines without their unit price:
  // no amounts and no total then, rather than a total of nothing.
  const priced = rows.some((row) => row.unitPrice !== undefined);
  return (
    <div className='overflow-hidden rounded-lg border border-border text-sm'>
      <ul className='divide-y divide-border'>
        {rows.map((row) => (
          <li key={text(row.id)} className='flex items-center gap-3 px-3 py-2'>
            <span className='min-w-0 flex-1 truncate'>
              {row.modelId
                ? (names.models?.get(text(row.modelId)) ?? '…')
                : (names.softwareProducts?.get(text(row.softwareProductId)) ??
                  '…')}
            </span>
            <span className='shrink-0 tabular-nums text-muted-foreground'>
              × {text(row.quantity)}
            </span>
            {priced ? (
              <span className='w-24 shrink-0 text-right tabular-nums'>
                {row.unitPrice === undefined ? '—' : formatMoney(amountOf(row))}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {priced ? (
        <div className='flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-2'>
          <span className='text-muted-foreground'>
            {t('fields.estimatedTotal')}
          </span>
          <span className='font-medium tabular-nums'>
            {formatMoney(rows.reduce((sum, row) => sum + amountOf(row), 0))}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function PurchaseOrderActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('purchaseOrders', [
    'submit',
    'approve',
    'order',
    'receive',
    'update',
  ]);
  // An order with no lines has nothing to approve, so submitting is refused
  // by the service ('NO_LINES'); the button says so before it is pressed.
  // Same query key as the lines card, so this costs no extra request.
  const lines = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, 'lines', text(record.id)],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${text(record.id)}/lines`,
        })
      ).data,
    enabled: Boolean(record.id),
  });
  const hasLines = (lines.data ?? []).length > 0;
  const [dialog, setDialog] = useState<
    'submit' | 'decide' | 'order' | 'cancel'
  >();
  // Who is being asked: one person who holds the approval.
  const [approverId, setApproverId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [orderedAt, setOrderedAt] = useState('');
  const run = useMutation({
    mutationFn: async (input: {
      operation: string;
      body?: Record<string, unknown>;
    }) =>
      api.request({
        path: `${PURCHASE_ORDERS_PATH}/${record.id}/${input.operation}`,
        method: 'POST',
        json: input.body ?? {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['itam', PURCHASE_ORDERS_PATH],
      });
      await queryClient.invalidateQueries({
        queryKey: ['itam', 'itam/approvals'],
      });
      setDialog(undefined);
      setComment('');
    },
  });
  const confirm = useConfirm();
  const status = text(record.status);
  const currentUserId = useCurrentUserId();
  // Who may decide is not "who holds approve": the requester never decides
  // their own order, and a named approver is the only one asked. The server
  // refuses the rest; the button should not offer them.
  // The approval trail: who was asked, and who decided. Needed past the
  // pending one, because cancelling is also theirs. A draft never had one.
  const approvalTrail = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, 'approvals', record.id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${record.id}/approvals`,
        })
      ).data,
    enabled: status !== 'draft',
  });
  const asked = approvalTrail.data?.find(
    (entry) => text(entry.status) === 'pending',
  );
  /** Was this reader asked to decide this order, or did they decide it? */
  const decider =
    currentUserId !== undefined &&
    (approvalTrail.data ?? []).some(
      (entry) =>
        text(entry.decidedById) === currentUserId ||
        (Array.isArray(entry.approverIds) &&
          (entry.approverIds as unknown[]).includes(currentUserId)),
    );
  const askedIds = Array.isArray(asked?.approverIds)
    ? (asked.approverIds as string[])
    : [];
  // The 负责人 may be the person named — a deployment with a single
  // Asset Manager has nobody else to ask (2026-09-27), so the page no
  // longer hides what the service allows.
  const mayDecide =
    Boolean(permissions.approve) &&
    status === 'pendingApproval' &&
    (askedIds.length === 0 ||
      (currentUserId !== undefined && askedIds.includes(currentUserId)));
  const buttons: ReactElement[] = [];
  // Asking for approval, and taking the request back, belong to its 负责人,
  // or to whoever wrote it before handing it over. The service refuses
  // everyone else ('NOT_OWNER').
  const mine = raisedBy(record, currentUserId);
  if (
    permissions.submit &&
    mine &&
    (status === 'draft' || status === 'rejected')
  ) {
    buttons.push(
      <Button
        key='submit'
        disabled={!hasLines}
        title={hasLines ? undefined : t('procurement.submitNeedsLines')}
        onClick={() => {
          run.reset();
          setApproverId(null);
          setDialog('submit');
        }}
      >
        <Send data-icon='inline-start' />
        {/* A rejected order is being asked again, with whatever was fixed. */}
        {t(
          status === 'rejected' ? 'procurement.resubmit' : 'procurement.submit',
        )}
      </Button>,
    );
  }
  // Withdrawing belongs to the side that submitted: an approver decides.
  if (permissions.submit && mine && status === 'pendingApproval') {
    buttons.push(
      <Button
        key='withdraw'
        variant='outline'
        onClick={() =>
          confirm.ask({
            title: t('procurement.withdraw'),
            description: t('confirmations.withdraw'),
            confirmLabel: t('procurement.withdraw'),
            action: () => run.mutateAsync({ operation: 'withdraw' }),
          })
        }
      >
        <Undo2 data-icon='inline-start' />
        {t('procurement.withdraw')}
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
  if (permissions.order && status === 'approved') {
    buttons.push(
      <Button
        key='order'
        onClick={() => {
          run.reset();
          // Placed today, promised a week out: the usual answer, there to
          // be corrected rather than typed from scratch.
          const placedOn = todayIso();
          setOrderedAt(placedOn);
          setExpectedAt(addDays(placedOn, 7));
          setDialog('order');
        }}
      >
        <ShoppingCart data-icon='inline-start' />
        {t('procurement.markOrdered')}
      </Button>,
    );
  }
  if (
    permissions.update &&
    // Calling the order off is for the people it went through: the side
    // that raised it, and whoever was asked to decide or decided.
    (mine || decider) &&
    // A draft is deleted instead, an order waiting for a decision is
    // withdrawn, and a rejected one is fixed and asked again: cancelling is
    // for one that was approved and still has to be called off.
    ['approved', 'ordered'].includes(status)
  ) {
    buttons.push(
      <Button
        key='cancel'
        variant='outline'
        onClick={() => {
          run.reset();
          setDialog('cancel');
        }}
      >
        <X data-icon='inline-start' />
        {t('procurement.cancel')}
      </Button>,
    );
  }
  return (
    <>
      {confirm.dialog}
      {buttons}
      {run.error && !dialog ? (
        <span className='text-sm text-destructive'>
          {(run.error as { message?: string }).message}
        </span>
      ) : null}
      <ConfirmDialog
        open={dialog === 'submit'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('procurement.submit')}
        description={t('confirmations.submit')}
        busy={run.isPending}
        error={run.error}
        disabled={!approverId}
        confirmLabel={t('procurement.submit')}
        onConfirm={() =>
          run.mutate({
            operation: 'submit',
            body: { approverId },
          })
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='submit-approver'>
            {t('procurement.approver')}
            <span className='text-destructive'> *</span>
          </Label>
          <ReferenceSelect
            id='submit-approver'
            reference={{
              collection: 'approvers',
              filter: { subject: 'purchaseOrder' },
            }}
            value={approverId}
            onChange={setApproverId}
          />
          <ApproverHint
            subject='purchaseOrder'
            hint={t('procurement.approverHint')}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'decide'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('procurement.decide')}
        description={t('procurement.decideDescription')}
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
        <DecidedLines orderId={text(record.id)} />
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
        open={dialog === 'order'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('procurement.markOrdered')}
        busy={run.isPending}
        error={run.error}
        confirmLabel={t('procurement.markOrdered')}
        // Both dates are what this step answers, so neither is optional.
        disabled={!orderedAt || !expectedAt}
        onConfirm={() =>
          run.mutate({ operation: 'order', body: { orderedAt, expectedAt } })
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='order-placed'>{t('fields.orderedAt')}</Label>
          <DateField
            id='order-placed'
            required
            value={orderedAt}
            onChange={(next) => setOrderedAt(next ?? '')}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='order-expected'>{t('fields.expectedAt')}</Label>
          <DateField
            id='order-expected'
            min={orderedAt || todayIso()}
            value={expectedAt}
            onChange={(next) => setExpectedAt(next ?? '')}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('procurement.cancel')}
        busy={run.isPending}
        error={run.error}
        disabled={!comment.trim()}
        destructive
        confirmLabel={t('procurement.cancel')}
        onConfirm={() =>
          run.mutate({ operation: 'cancel', body: { reason: comment } })
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='cancel-reason'>
            {t('fields.reason')} <span className='text-destructive'>*</span>
          </Label>
          <Textarea
            id='cancel-reason'
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

/** Tab: the records receiving generated. */
export function PurchaseOrderGeneratedTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useApi();
  const receipts = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, 'receipts', id],
    queryFn: async () =>
      (
        await api.request<{
          data: {
            receipts: ItamRecord[];
            generated: {
              type: string;
              id: string;
              kind?: string;
              modelId?: string;
              softwareProductId?: string;
            }[];
          };
        }>({ path: `${PURCHASE_ORDERS_PATH}/${id}/receipts` })
      ).data,
  });
  const generated = receipts.data?.generated ?? [];
  const openRecord = useOpenRecord();
  const collectionOf = (type: string) =>
    type === 'device'
      ? 'devices'
      : type === 'stockItem'
        ? 'stockItems'
        : 'entitlements';
  /** The asset type a generated record is, as the category tree names it. */
  const assetTypeOf = (row: { type: string; kind?: string }) =>
    row.type === 'stockItem' ? (row.kind ?? 'accessory') : row.type;
  const names = useReferenceNames([
    {
      collection: 'devices',
      ids: generated
        .filter((row) => row.type === 'device')
        .map((row) => row.id),
    },
    {
      collection: 'entitlements',
      ids: generated
        .filter((row) => row.type === 'entitlement')
        .map((row) => row.id),
    },
    {
      collection: 'stockItems',
      ids: generated
        .filter((row) => row.type === 'stockItem')
        .map((row) => row.id),
    },
    { collection: 'models', ids: generated.map((row) => row.modelId ?? null) },
    {
      collection: 'softwareProducts',
      ids: generated.map((row) => row.softwareProductId ?? null),
    },
  ]);
  if (receipts.data && generated.length === 0)
    return (
      <p className='rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground'>
        {t('procurement.nothingGenerated')}
      </p>
    );
  // What each record came from: the receipts that produced it, so the row
  // can say how much arrived and when the last of it did.
  const receiptsOf = new Map<string, ItamRecord[]>();
  for (const receipt of receipts.data?.receipts ?? []) {
    const key = text(receipt.generatedId);
    if (key) receiptsOf.set(key, [...(receiptsOf.get(key) ?? []), receipt]);
  }
  const arrivedAt = (id: string) =>
    (receiptsOf.get(id) ?? [])
      .map((receipt) => text(receipt.createdAt))
      .sort()
      .at(-1);
  const devices = generated.filter((row) => row.type === 'device');
  const others = generated.filter((row) => row.type !== 'device');
  return (
    <div className='space-y-4'>
      {devices.length > 0 ? (
        <section className='space-y-2'>
          {others.length > 0 ? (
            <h3 className='text-sm font-medium'>
              {t('procurement.generatedDevices')}
            </h3>
          ) : null}
          <GeneratedDevices
            ids={devices.map((row) => row.id)}
            arrivedAt={arrivedAt}
          />
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className='space-y-2'>
          {devices.length > 0 ? (
            <h3 className='text-sm font-medium'>
              {t('procurement.generatedOthers')}
            </h3>
          ) : null}
          <Paged rows={others}>
            {(pageRows) => (
              <div className='overflow-x-auto rounded-lg border border-border bg-card'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-px whitespace-nowrap'>
                        {t('fields.appliesTo')}
                      </TableHead>
                      <TableHead>{t('fields.name')}</TableHead>
                      <TableHead>{t('procurement.modelOrProduct')}</TableHead>
                      <TableHead className='w-px whitespace-nowrap text-right'>
                        {t('fields.quantity')}
                      </TableHead>
                      <TableHead className='w-px whitespace-nowrap'>
                        {t('procurement.arrivedAt')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((row) => {
                      const collection = collectionOf(row.type);
                      // Stock has a page per kind: an accessory, a
                      // consumable and a component are not read in the
                      // same place.
                      const route =
                        (row.kind
                          ? STOCK_ROUTES[row.kind as StockKind]
                          : undefined) ?? referenceRoute(collection);
                      const quantity = (receiptsOf.get(row.id) ?? []).reduce(
                        (sum, receipt) => sum + Number(receipt.quantity ?? 0),
                        0,
                      );
                      const last = arrivedAt(row.id);
                      return (
                        <TableRow
                          key={`${row.type}:${row.id}`}
                          className={route ? 'cursor-pointer' : undefined}
                          // The whole row opens the record, as a list's
                          // rows do; the name stays a link of its own.
                          onClick={
                            route
                              ? () => openRecord(`/${route}/${row.id}`)
                              : undefined
                          }
                        >
                          <TableCell className='w-px whitespace-nowrap'>
                            <AssetTypeBadge value={assetTypeOf(row)} />
                          </TableCell>
                          <TableCell>
                            <CellText>
                              <ReferenceLink
                                collection={collection}
                                route={route}
                                id={row.id}
                                names={names[collection]}
                              />
                            </CellText>
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            <CellText>
                              {(row.modelId
                                ? names.models?.get(row.modelId)
                                : row.softwareProductId
                                  ? names.softwareProducts?.get(
                                      row.softwareProductId,
                                    )
                                  : undefined) ?? '—'}
                            </CellText>
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {quantity || '—'}
                          </TableCell>
                          <TableCell className='whitespace-nowrap tabular-nums text-muted-foreground'>
                            {last ? formatDate(last, true) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Paged>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The devices an order brought in, as a receiver checks a delivery: each
 * by its number and name, its serial, and where it stands now — its status
 * and place, read live from the device. The model is in the name and every
 * row is one device, so neither has a column of its own (2026-10-05).
 */
function GeneratedDevices({
  ids,
  arrivedAt,
}: {
  readonly ids: readonly string[];
  readonly arrivedAt: (id: string) => string | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const list = useItamList(DEVICES_PATH, { ids, pageSize: ids.length });
  const rows = new Map(
    (list.data?.data ?? []).map((device) => [text(device.id), device]),
  );
  const places = useReferenceNames([
    {
      collection: 'locations',
      ids: [...rows.values()].map(
        (device) => (device.locationId as string | null) ?? null,
      ),
    },
  ]);
  return (
    <Paged rows={ids}>
      {(pageIds) => (
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('devices.noAndName')}</TableHead>
                <TableHead>{t('fields.serialNo')}</TableHead>
                <TableHead className='w-px whitespace-nowrap'>
                  {t('fields.status')}
                </TableHead>
                <TableHead>{t('fields.location')}</TableHead>
                <TableHead className='w-px whitespace-nowrap'>
                  {t('procurement.arrivedAt')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageIds.map((id) => {
                const device = rows.get(id);
                const last = arrivedAt(id);
                return (
                  <TableRow
                    key={id}
                    className='cursor-pointer'
                    onClick={() => openRecord(`/devices/${id}`)}
                  >
                    <TableCell>
                      <CellText>
                        <RecordLink
                          to={`/devices/${id}`}
                          className='font-medium text-link underline-offset-4 hover:underline'
                        >
                          {device ? deviceLabel(device) : '…'}
                        </RecordLink>
                      </CellText>
                    </TableCell>
                    <TableCell>{text(device?.serialNo) || '—'}</TableCell>
                    <TableCell className='w-px whitespace-nowrap'>
                      <DeviceStatusBadge status={device?.status} />
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      <CellText className='max-w-56'>
                        {places.locations?.get(text(device?.locationId)) ?? '—'}
                      </CellText>
                    </TableCell>
                    <TableCell className='whitespace-nowrap tabular-nums text-muted-foreground'>
                      {last ? formatDate(last, true) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Paged>
  );
}

export function PurchaseOrderAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='purchaseOrders' ownerId={id} />;
}
