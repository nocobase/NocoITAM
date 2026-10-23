import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import {
  useMemo,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { ApproverHint } from '@/components/itam/approver-hint';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { ReviewMark } from '@/components/itam/review-mark';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useApi,
  useItamList,
  useItamMutations,
  useItamSettings,
  type ItamRecord,
} from '@/lib/itam/api';
import { formatMoney, text } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import {
  PO_CREATE_FIELDS,
  PO_FIELDS,
  PURCHASE_ORDERS_PATH,
} from '@/lib/itam/procurement';
import {
  applyCaptureValues,
  blankLine,
  captureLine,
  captureLines,
  keyedUnmatched,
  type PurchaseCapture,
} from '@/lib/itam/purchase-capture';
import {
  newPurchaseLine,
  purchaseLineIncomplete,
  purchaseLinePayload,
  type PurchaseLineDraft,
} from '@/lib/itam/purchase-lines';
import { referencePath, useReferenceNames } from '@/lib/itam/references';
import {
  usePurchaseOrderCapture,
  type CaptureForm,
} from '@/lib/itam/use-purchase-capture';

import { LineEditor } from './lines-tab.js';
import { CaptureNotice, CapturePane } from './po-capture.js';

/** A line as the dialog edits it: AI 整理 may mark its item 请核对. */
type DialogLine = PurchaseLineDraft & { readonly uncertain?: boolean };

const HEADER_FIELDS = PO_CREATE_FIELDS.map((key) =>
  PO_FIELDS.find((field) => field.key === key)!,
);

const VENDOR_FIELDS = masterDataByName('vendors')!.fields.filter(
  (field) => field.form !== false,
);

/**
 * A purchase order in one go: its header, its lines and, when it is ready,
 * who approves it — then saved as a draft or submitted for approval, as the
 * disposal's create dialog does. The three steps are three calls (create,
 * lines, submit); should a later one fail, the dialog keeps the order it
 * already created and the next attempt carries on with that one instead of
 * creating another.
 *
 * With the assistant available it opens on AI 整理 (2026-10-06): the
 * requester pastes what they have or uploads a quote, the assistant fills
 * the form (`po-capture.tsx`), and the form tab shows it with 请核对 on what
 * it was not sure of, the lines it could not place, and a line to tell it
 * what to change. Nothing is saved until the requester saves.
 */
export function PurchaseOrderCreateDialog({
  open,
  onOpenChange,
  onCreated,
  initialValues,
  initialLines,
  header,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
  /**
   * An order proposed rather than started empty (2026-10-22, 起草采购单 for
   * joiners): the form opens filled, on the form tab, to be checked.
   */
  readonly initialValues?: Readonly<Record<string, unknown>>;
  readonly initialLines?: readonly Pick<
    PurchaseLineDraft,
    'itemType' | 'modelId' | 'softwareProductId' | 'quantity'
  >[];
  /**
   * Above the form: several proposed orders to switch between (2026-10-22,
   * 起草采购单 for every joiner's shortfall).
   */
  readonly header?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  // A new order is in the default currency until someone says otherwise.
  const currency = useItamSettings().data?.general.currency ?? null;
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    ...initialValues,
  }));
  const [lines, setLines] = useState<readonly DialogLine[]>(() =>
    initialLines && initialLines.length > 0
      ? initialLines.map((line) => ({ ...newPurchaseLine(), ...line }))
      : [newPurchaseLine()],
  );
  const [tab, setTab] = useState<'ai' | 'form' | undefined>(
    initialValues ? 'form' : undefined,
  );
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<PurchaseCapture>();
  // Header fields the assistant filled without being sure; a field leaves
  // the set when somebody changes it.
  const [review, setReview] = useState<ReadonlySet<string>>(() => new Set());
  const unmark = (key: string) =>
    setReview((keys) => {
      if (!keys.has(key)) return keys;
      const next = new Set(keys);
      next.delete(key);
      return next;
    });
  // A vendor the books lack is created from the vendor field, or from the
  // note under it naming the one the text gave, without leaving the dialog.
  const [creatingVendor, setCreatingVendor] = useState<string>();
  const vendors = useItamMutations(referencePath('vendors'));
  const mayCreateVendor = useCollectionPermissions('vendors', [
    'create',
  ]).create;
  const names = useReferenceNames(
    useMemo(
      () => [
        { collection: 'vendors', ids: [text(values.vendorId)] },
        { collection: 'departments', ids: [text(values.departmentId)] },
        { collection: 'models', ids: lines.map((line) => line.modelId) },
        {
          collection: 'softwareProducts',
          ids: lines.map((line) => line.softwareProductId),
        },
      ],
      [values.vendorId, values.departmentId, lines],
    ),
  );
  const form = (): CaptureForm => ({
    header: {
      reason: values.reason ?? null,
      description: values.description ?? null,
      neededBy: values.neededBy ?? null,
      vendorId: values.vendorId ?? null,
      vendor: names.vendors?.get(text(values.vendorId)) ?? null,
      department: names.departments?.get(text(values.departmentId)) ?? null,
    },
    lines: lines.map((line) => ({
      itemType: line.itemType,
      item:
        (line.modelId
          ? names.models?.get(line.modelId)
          : line.softwareProductId
            ? names.softwareProducts?.get(line.softwareProductId)
            : undefined) ?? null,
      modelId: line.modelId,
      softwareProductId: line.softwareProductId,
      quantity: line.quantity,
      unitPrice: line.unitPrice === '' ? null : Number(line.unitPrice),
    })),
  });
  const capture = usePurchaseOrderCapture({
    form,
    onFill: (next) => {
      setValues((current) => applyCaptureValues(current, next));
      const captured = captureLines(next);
      setLines(captured.length > 0 ? captured : [newPurchaseLine()]);
      setReview(new Set(next.uncertain));
      // A line the first reading could not place is still unplaced after
      // an adjustment, which hands back only what is on the form.
      setResult((previous) => ({
        ...next,
        unmatched: keyedUnmatched(
          previous
            ? [
                ...previous.unmatched,
                ...next.unmatched.filter(
                  (line) =>
                    !previous.unmatched.some(
                      (known) => known.description === line.description,
                    ),
                ),
              ]
            : next.unmatched,
        ),
      }));
      setTab('form');
    },
  });
  // The dialog opens on AI 整理 whenever the assistant can do it.
  const current = tab ?? (capture.available ? 'ai' : 'form');
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
        // The document AI 整理 read is kept on the order it became.
        if (capture.fileId)
          await api
            .request({
              path: `itam/attachments/purchaseOrders/${text(order.id)}`,
              method: 'POST',
              json: { fileIds: [capture.fileId] },
            })
            .catch(() => undefined);
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
        if (!next) {
          save.reset();
          capture.release();
        }
        onOpenChange(next);
      }}
      // The form with AI 整理's column beside it needs the room.
      size={result && current === 'form' ? 'wider' : 'wide'}
      // AI 整理 only organises; the order is saved from the form it fills.
      actions={current === 'form'}
      title={t('procurement.new')}
      titleAside={
        capture.available ? (
          <Tabs
            value={current}
            onValueChange={(value) => setTab(value as 'ai' | 'form')}
          >
            <TabsList>
              <TabsTrigger
                value='ai'
                className='text-primary data-active:text-primary'
              >
                <Sparkles data-icon='inline-start' />
                {t('procurement.capture.aiTab')}
              </TabsTrigger>
              <TabsTrigger value='form'>
                {t('procurement.capture.formTab')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : undefined
      }
      description={
        created
          ? t('procurement.createdAsDraft', { no: text(created.orderNo) })
          : // AI 整理 says what to give it in its box (2026-10-23).
            current === 'ai'
            ? undefined
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
      <div className='grid gap-3'>
        {header}
        {current === 'ai' ? (
          <CapturePane
            capture={capture}
            pasted={pasted}
            onPasted={setPasted}
            file={file}
            onFile={setFile}
          />
        ) : (
          <>
            {/* Once AI 整理 has filled the form, what the assistant said,
                what it could not place and where to adjust it stand in a
                column of their own beside the form (2026-10-06). */}
            <div
              className={
                result
                  ? 'grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start'
                  : 'grid'
              }
            >
              <div className='grid min-w-0 gap-3'>
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
                      <div className='flex items-center gap-2'>
                        <Label htmlFor={`po-${field.key}`}>
                          {t(field.label)}
                          {field.required ? (
                            <span className='text-destructive'> *</span>
                          ) : null}
                        </Label>
                        {review.has(field.key) ? <ReviewMark /> : null}
                      </div>
                      <FieldInput
                        id={`po-${field.key}`}
                        field={field}
                        value={
                          field.key === 'currency'
                            ? (values.currency ?? currency)
                            : values[field.key]
                        }
                        // Once created, the header is the order's; a retry only
                        // finishes the lines and the submission.
                        disabled={Boolean(created)}
                        onChange={(value) => {
                          setValues((values) => ({
                            ...values,
                            [field.key]: value,
                          }));
                          unmark(field.key);
                        }}
                        onCreate={
                          field.key === 'vendorId' && mayCreateVendor
                            ? (name) =>
                                setCreatingVendor(
                                  name || text(result?.vendorName),
                                )
                            : undefined
                        }
                        createLabel={t('vendors.new')}
                      />
                      <UnplacedNote
                        field={field.key}
                        name={
                          field.key === 'vendorId' && !values.vendorId
                            ? result?.vendorName
                            : field.key === 'departmentId' &&
                                !values.departmentId
                              ? result?.departmentName
                              : null
                        }
                        onCreate={
                          mayCreateVendor && !created
                            ? setCreatingVendor
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className='grid gap-1.5'>
                  <div className='flex items-center justify-between gap-2'>
                    <Label>{t('tabs.lines')}</Label>
                    {/* Each row adds the next one after it; this is only the
                        way back once every row has been removed. */}
                    {lines.length === 0 ? (
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => insertAfter()}
                      >
                        <Plus data-icon='inline-start' />
                        {t('procurement.addLine')}
                      </Button>
                    ) : null}
                  </div>
                  <div className='overflow-x-auto rounded-lg border border-border bg-card'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-8' />
                          <TableHead className='w-px whitespace-nowrap'>
                            {t('fields.appliesTo')}
                          </TableHead>
                          <TableHead>
                            {t('procurement.modelOrProduct')}
                          </TableHead>
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
                            review={line.uncertain}
                            busy={save.isPending}
                            dragging={dragKey === line.key}
                            dropBefore={dropAt === index}
                            dropAfter={
                              dropAt === index + 1 && index === lines.length - 1
                            }
                            onChange={(next) =>
                              setLines((rows) =>
                                rows.map((row) =>
                                  row.key === line.key
                                    ? { ...next, uncertain: false }
                                    : row,
                                ),
                              )
                            }
                            onAdd={() => insertAfter(line.key)}
                            onRemove={() =>
                              setLines((rows) =>
                                rows.filter((row) => row.key !== line.key),
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
                              const from = lines.findIndex(
                                (row) => row.key === dragKey,
                              );
                              if (from >= 0)
                                reorder(from, dropIndexFor(event, index));
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
                  <Label htmlFor='po-approver'>
                    {t('procurement.approver')}
                  </Label>
                  <ReferenceSelect
                    id='po-approver'
                    reference={{
                      collection: 'approvers',
                      filter: { subject: 'purchaseOrder' },
                    }}
                    value={approverId}
                    onChange={setApproverId}
                  />
                  <ApproverHint
                    subject='purchaseOrder'
                    hint={t('procurement.approverForSubmit')}
                  />
                </div>
              </div>
              {result ? (
                <aside className='md:sticky md:top-0'>
                  <CaptureNotice
                    capture={capture}
                    result={result}
                    currency={text(values.currency) || currency}
                    priced={priced}
                    onPlace={async (line, pick) => {
                      const placed = await capture.place(line, pick);
                      if (!placed)
                        throw new Error(
                          t('procurement.capture.stillUnmatched'),
                        );
                      // It joins the lines, taking the place of the blank
                      // row an order with nothing placed yet opens on.
                      setLines((rows) => [
                        ...rows.filter((row) => !blankLine(row)),
                        captureLine(placed),
                      ]);
                      setResult((previous) =>
                        previous
                          ? {
                              ...previous,
                              unmatched: previous.unmatched.filter(
                                (row) => row.key !== line.key,
                              ),
                            }
                          : previous,
                      );
                    }}
                  />
                </aside>
              ) : null}
            </div>
            <RecordFormDialog
              key={creatingVendor ?? 'vendor-closed'}
              open={creatingVendor !== undefined}
              onOpenChange={(next) => {
                if (next) return;
                vendors.create.reset();
                setCreatingVendor(undefined);
              }}
              title={t('vendors.new')}
              fields={VENDOR_FIELDS}
              initial={{ name: creatingVendor ?? '' }}
              submitting={vendors.create.isPending}
              error={vendors.create.error}
              onSubmit={async (payload) => {
                const vendor = await vendors.create.mutateAsync(payload);
                setValues((values) => ({
                  ...values,
                  vendorId: text(vendor.id),
                }));
                unmark('vendorId');
                setCreatingVendor(undefined);
              }}
            />
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}

/**
 * Under the vendor or department field, while it is still empty: what the
 * text called it, which matched nothing on the books — said where it is
 * chosen rather than in the column beside the form (2026-10-06). A vendor
 * may be created from here; a department is the organisation's and is only
 * chosen.
 */
function UnplacedNote({
  field,
  name,
  onCreate,
}: {
  readonly field: string;
  readonly name: string | null | undefined;
  readonly onCreate?: (name: string) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!name) return null;
  const vendor = field === 'vendorId';
  return (
    <p className='text-xs text-warning-foreground wrap-anywhere'>
      {t(
        vendor
          ? 'procurement.capture.vendorNotFound'
          : 'procurement.capture.departmentNotFound',
        { name },
      )}
      {vendor && onCreate ? (
        <>
          {' · '}
          <button
            type='button'
            className='text-info-foreground hover:underline'
            onClick={() => onCreate(name)}
          >
            {t('vendors.new')}
          </button>
        </>
      ) : null}
    </p>
  );
}
