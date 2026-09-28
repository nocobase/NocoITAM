import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type DragEvent, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useApi,
  useItamList,
  useItamSettings,
  type ItamRecord,
} from '@/lib/itam/api';
import { formatMoney, text } from '@/lib/itam/format';
import {
  PO_CREATE_FIELDS,
  PO_FIELDS,
  PURCHASE_ORDERS_PATH,
} from '@/lib/itam/procurement';
import {
  newPurchaseLine,
  purchaseLineIncomplete,
  purchaseLinePayload,
  type PurchaseLineDraft,
} from '@/lib/itam/purchase-lines';

import { LineEditor } from './lines-tab.js';

const HEADER_FIELDS = PO_CREATE_FIELDS.map((key) =>
  PO_FIELDS.find((field) => field.key === key)!,
);

/**
 * A purchase order in one go: its header, its lines and, when it is ready,
 * who approves it — then saved as a draft or submitted for approval, as the
 * disposal's create dialog does. The three steps are three calls (create,
 * lines, submit); should a later one fail, the dialog keeps the order it
 * already created and the next attempt carries on with that one instead of
 * creating another.
 */
export function PurchaseOrderCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  // A new order is in the default currency until someone says otherwise.
  const currency = useItamSettings().data?.general.currency ?? null;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [lines, setLines] = useState<readonly PurchaseLineDraft[]>(() => [
    newPurchaseLine(),
  ]);
  const [approverId, setApproverId] = useState<string | null>(null);
  const [created, setCreated] = useState<ItamRecord>();
  // Prices show only to a reader who may see them: the list returns an
  // order's totals to them alone, the same test the lines card makes.
  const probe = useItamList<ItamRecord>(PURCHASE_ORDERS_PATH, { pageSize: 1 });
  const firstOrder = probe.data?.data[0];
  const priced = !firstOrder || 'estimatedTotal' in firstOrder;

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      let order = created;
      if (!order) {
        const header = Object.fromEntries(
          Object.entries(values).filter(
            ([, value]) =>
              value !== null && value !== undefined && value !== '',
          ),
        );
        order = (
          await api.request<{ data: ItamRecord }>({
            path: PURCHASE_ORDERS_PATH,
            method: 'POST',
            json: header,
          })
        ).data;
        setCreated(order);
      }
      const id = text(order.id);
      await api.request({
        path: `${PURCHASE_ORDERS_PATH}/${id}/lines`,
        method: 'PUT',
        json: { lines: lines.map(purchaseLinePayload) },
      });
      if (submit)
        await api.request({
          path: `${PURCHASE_ORDERS_PATH}/${id}/submit`,
          method: 'POST',
          json: { approverId },
        });
      return order;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['itam', PURCHASE_ORDERS_PATH],
      });
    },
    onSuccess: (order) => onCreated(order),
  });

  const headerComplete = HEADER_FIELDS.every(
    (field) => !field.required || Boolean(values[field.key]),
  );
  const linesComplete = !lines.some((line) => purchaseLineIncomplete(line));
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * Number(line.unitPrice || 0),
    0,
  );

  // Lines are ordered by dragging the grip, as on the order's own card.
  const [dragKey, setDragKey] = useState<string>();
  const [dropAt, setDropAt] = useState<number>();
  const dropIndexFor = (event: DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? index : index + 1;
  };
  const reorder = (from: number, to: number) =>
    setLines((current) => {
      if (from === to || from + 1 === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
  const insertAfter = (key?: string) =>
    setLines((current) => {
      const at = key
        ? current.findIndex((line) => line.key === key) + 1
        : current.length;
      return [...current.slice(0, at), newPurchaseLine(), ...current.slice(at)];
    });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
      size='wide'
      title={t('procurement.new')}
      description={
        created
          ? t('procurement.createdAsDraft', { no: text(created.orderNo) })
          : t('procurement.newDescription')
      }
      busy={save.isPending}
      error={save.error}
      // A draft needs its header and complete lines; submitting needs lines
      // at all and someone to approve them.
      disabled={!headerComplete || !linesComplete}
      confirmDisabled={!approverId || lines.length === 0}
      confirmLabel={t('procurement.submit')}
      onConfirm={() => save.mutate(true)}
      secondaryLabel={t('procurement.saveDraft')}
      onSecondary={() => save.mutate(false)}
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        {HEADER_FIELDS.map((field) => (
          <div
            key={field.key}
            className={
              field.type === 'textarea'
                ? 'grid gap-1.5 sm:col-span-2'
                : 'grid gap-1.5'
            }
          >
            <Label htmlFor={`po-${field.key}`}>
              {t(field.label)}
              {field.required ? (
                <span className='text-destructive'> *</span>
              ) : null}
            </Label>
            <FieldInput
              id={`po-${field.key}`}
              field={field}
              value={values[field.key]}
              // Once created, the header is the order's; a retry only
              // finishes the lines and the submission.
              disabled={Boolean(created)}
              onChange={(value, record) =>
                setValues((current) => ({
                  ...current,
                  [field.key]: value,
                  // The department follows the requester until changed.
                  ...(field.key === 'requesterId'
                    ? { departmentId: record?.departmentId ?? null }
                    : {}),
                }))
              }
            />
          </div>
        ))}
      </div>
      <div className='grid gap-1.5'>
        <div className='flex items-center justify-between gap-2'>
          <Label>{t('tabs.lines')}</Label>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => insertAfter()}
          >
            <Plus data-icon='inline-start' />
            {t('procurement.addLine')}
          </Button>
        </div>
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-8' />
                <TableHead className='w-px whitespace-nowrap'>
                  {t('fields.appliesTo')}
                </TableHead>
                <TableHead>{t('procurement.modelOrProduct')}</TableHead>
                <TableHead className='w-px whitespace-nowrap text-right'>
                  {t('fields.quantity')}
                </TableHead>
                {priced ? (
                  <TableHead className='w-px whitespace-nowrap text-right'>
                    {t('fields.unitPrice')}
                  </TableHead>
                ) : null}
                <TableHead className='w-px' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <LineEditor
                  key={line.key}
                  draft={line}
                  priced={priced}
                  showReceived={false}
                  busy={save.isPending}
                  dragging={dragKey === line.key}
                  dropBefore={dropAt === index}
                  dropAfter={dropAt === index + 1 && index === lines.length - 1}
                  onChange={(next) =>
                    setLines((current) =>
                      current.map((row) => (row.key === line.key ? next : row)),
                    )
                  }
                  onAdd={() => insertAfter(line.key)}
                  onRemove={() =>
                    setLines((current) =>
                      current.filter((row) => row.key !== line.key),
                    )
                  }
                  onDragStart={() => setDragKey(line.key)}
                  onDragEnd={() => {
                    setDragKey(undefined);
                    setDropAt(undefined);
                  }}
                  onDragOver={(event) => {
                    if (dragKey === undefined) return;
                    event.preventDefault();
                    const at = dropIndexFor(event, index);
                    if (at !== dropAt) setDropAt(at);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = lines.findIndex((row) => row.key === dragKey);
                    if (from >= 0) reorder(from, dropIndexFor(event, index));
                    setDragKey(undefined);
                    setDropAt(undefined);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
        <p className='text-right text-xs text-muted-foreground'>
          {t('procurement.linesTotal', { count: lines.length })}
          {priced
            ? ` · ${formatMoney(total, text(values.currency) || currency)}`
            : ''}
        </p>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='po-approver'>{t('procurement.approver')}</Label>
        <ReferenceSelect
          id='po-approver'
          reference={{
            collection: 'approvers',
            filter: { subject: 'purchaseOrder' },
          }}
          value={approverId}
          onChange={setApproverId}
        />
        <p className='text-xs text-muted-foreground'>
          {t('procurement.approverForSubmit')}
        </p>
      </div>
    </ConfirmDialog>
  );
}
