import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { FieldInput } from '@/components/itam/field-input';
import { EntitlementKindBadge } from '@/components/itam/status-badge';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  useApi,
  useItamList,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { errorMessage, formatMoney, text } from '@/lib/itam/format';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { ENTITLEMENTS_PATH, ENTITLEMENT_FIELDS } from '@/lib/itam/entitlements';
import { STOCK_PATH } from '@/lib/itam/stock';
import {
  LINE_ITEM_TYPES,
  PURCHASE_ORDERS_PATH,
  raisedBy,
  type LineItemType,
} from '@/lib/itam/procurement';
import type { AIFrontendToolRegistration } from '@/extensions/nocobase-ai';
import { useAiPageContext } from '@/lib/itam/ai-context';
import { cn } from '@/lib/utils';
import { useReferenceNames, type ReferenceNames } from '@/lib/itam/references';
import { BATCH_ITEM_TYPES, DOCUMENT_ACCEPT } from '@/lib/itam/receipt';

import { BatchReceiptDialog } from './batch-receipt';

export interface LineDraft {
  readonly key: string;
  readonly id?: string;
  readonly itemType: LineItemType;
  readonly modelId: string | null;
  readonly softwareProductId: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly receivedQuantity: number;
}

/**
 * What was approved is what arrives: the lines are its 负责人's to shape
 * only while nothing has been decided. A rejected order is open again, the
 * way a draft is — resubmitting one that cannot change asks the approver to
 * reconsider the very same thing. Past that, wrong lines mean cancelling the
 * order and asking again (mirrors `UNDECIDED_STATUSES` in the service).
 */
const EDITABLE = new Set(['draft', 'rejected']);
/** What a line may be, as the reader thinks of it: the five asset types. */
const LINE_ASSET_TYPES = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
] as const;
const ENTITLEMENT_KINDS = new Set<string>(['perpetual', 'subscription']);
/** The asset type a line's `itemType` belongs to; both kinds are 授权. */
const assetTypeOf = (itemType: string): string =>
  ENTITLEMENT_KINDS.has(itemType) ? 'entitlement' : itemType;
const RECEIVABLE = new Set(['ordered', 'partiallyReceived']);
const HARDWARE = new Set(['device', 'accessory', 'consumable', 'component']);

/**
 * The order's lines, as a card above the tabs: they are the document, not one
 * of its attachments, so they read before the approvals and the receipts. The
 * card follows the category's extended-field card — a titled header carrying
 * the edit action, the table below it — and the whole set is edited at once,
 * because an order's lines are written together.
 */
export function PurchaseOrderLinesCard({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const id = text(record.id);
  const api = useApi();
  const queryClient = useQueryClient();
  const order = { data: record };
  const permissions = useCollectionPermissions('purchaseOrders', [
    'update',
    'receive',
  ]);
  const currentUserId = useCurrentUserId();
  const lines = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, 'lines', id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${id}/lines`,
        })
      ).data,
  });
  // The lines under edit; the table is in read mode until it has them.
  const [drafts, setDrafts] = useState<LineDraft[]>();
  const [receiving, setReceiving] = useState<ItamRecord>();
  // The batch form, opened empty or on a delivery document already picked.
  const [batch, setBatch] = useState<{ readonly file?: File }>();
  const documentInputRef = useRef<HTMLInputElement>(null);
  // The lines as the assistant sees them, and the one thing it may do to
  // them: add lines to the draft under edit (ALLOW — nothing is saved until
  // the user presses 保存). The tool reads the draft through a ref so it
  // sees the current one, not the render that registered it.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  // Outside editing the assistant reads the saved lines, with the ids that
  // receiving one names.
  const savedRef = useRef(lines.data);
  useEffect(() => {
    savedRef.current = lines.data;
  }, [lines.data]);
  const lineTools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: 'addDraftLines',
        title: 'Add purchase order lines',
        description:
          'Add lines to the purchase order draft on screen, which the user then reviews and saves. Each line: itemType (one of the page context itemTypes), modelId for hardware or softwareProductId for software (resolve names with itam_match_model), quantity, and unitPrice when the document states one. Only while the lines are being edited.',
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemType: { type: 'string', enum: [...LINE_ITEM_TYPES] },
                  modelId: { type: 'string' },
                  softwareProductId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                  unitPrice: { type: 'number', minimum: 0 },
                },
                required: ['itemType', 'quantity'],
              },
            },
          },
          required: ['lines'],
        },
        // The assistant supplies the arguments; read them defensively.
        execute: (args: unknown) => {
          const proposed = (
            args as { lines?: readonly Record<string, unknown>[] } | null
          )?.lines;
          if (!draftsRef.current)
            throw new Error(
              'The lines are not being edited; ask the user to press 编辑明细 first.',
            );
          const added: LineDraft[] = (proposed ?? []).map((line) => {
            const itemType = (
              (LINE_ITEM_TYPES as readonly string[]).includes(
                text(line.itemType),
              )
                ? text(line.itemType)
                : 'device'
            ) as LineItemType;
            return {
              key: crypto.randomUUID(),
              itemType,
              modelId: text(line.modelId) || null,
              softwareProductId: text(line.softwareProductId) || null,
              quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
              unitPrice: Number.isFinite(Number(line.unitPrice))
                ? String(Number(line.unitPrice))
                : '',
              receivedQuantity: 0,
            };
          });
          setDrafts((current) => [...(current ?? []), ...added]);
          return { added: added.length };
        },
      },
    ],
    [setDrafts],
  );
  const {
    ref: contextRef,
    available: aiAvailable,
    ask,
  } = useAiPageContext({
    id: 'itam-purchase-order-lines',
    title: t('tabs.lines'),
    kind: 'purchaseOrderLines',
    getContext: () => ({
      orderNo: record.orderNo,
      vendorId: record.vendorId,
      currency: record.currency,
      editing: draftsRef.current !== undefined,
      itemTypes: LINE_ITEM_TYPES,
      lines: draftsRef.current
        ? draftsRef.current.map(({ key: _key, ...line }) => line)
        : (savedRef.current ?? []).map((line) => ({
            lineId: line.id,
            itemType: line.itemType,
            modelId: line.modelId,
            softwareProductId: line.softwareProductId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            receivedQuantity: line.receivedQuantity,
          })),
    }),
    tools: lineTools,
  });
  const status = text(order.data?.status);
  const rows = lines.data ?? [];
  const names = useReferenceNames([
    {
      collection: 'models',
      ids: rows.map((row) => row.modelId as string | null),
    },
    {
      collection: 'softwareProducts',
      ids: rows.map((row) => row.softwareProductId as string | null),
    },
  ]);
  const save = useMutation({
    mutationFn: async (input: { lines: LineDraft[] }) =>
      api.request({
        path: `${PURCHASE_ORDERS_PATH}/${id}/lines`,
        method: 'PUT',
        json: {
          lines: input.lines.map((line) => ({
            id: line.id,
            itemType: line.itemType,
            modelId: HARDWARE.has(line.itemType) ? line.modelId : null,
            softwareProductId:
              line.itemType === 'perpetual' || line.itemType === 'subscription'
                ? line.softwareProductId
                : null,
            quantity: line.quantity,
            unitPrice: line.unitPrice === '' ? null : Number(line.unitPrice),
          })),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['itam', PURCHASE_ORDERS_PATH],
      });
      setDrafts(undefined);
    },
  });

  // Editing an order is its 负责人's, like submitting it; the service
  // refuses everyone else ('NOT_OWNER').
  const canEdit =
    Boolean(permissions.update) &&
    EDITABLE.has(status) &&
    raisedBy(record, currentUserId);
  const canReceive = Boolean(permissions.receive) && RECEIVABLE.has(status);
  // Devices and stock still to arrive are what the batch form receives.
  const batchable =
    canReceive &&
    rows.some(
      (row) =>
        BATCH_ITEM_TYPES.has(text(row.itemType)) &&
        Number(row.receivedQuantity) < Number(row.quantity),
    );
  const draftOf = (row: ItamRecord): LineDraft => ({
    key: text(row.id),
    id: text(row.id),
    itemType: text(row.itemType) as LineItemType,
    modelId: (row.modelId as string | null) ?? null,
    softwareProductId: (row.softwareProductId as string | null) ?? null,
    quantity: Number(row.quantity),
    unitPrice:
      row.unitPrice === null || row.unitPrice === undefined
        ? ''
        : text(row.unitPrice),
    receivedQuantity: Number(row.receivedQuantity),
  });
  const patchDraft = (key: string, line: LineDraft) =>
    setDrafts((current) =>
      current?.map((row) => (row.key === key ? line : row)),
    );
  /** Adds a blank line after `key`, or at the end when it names none. */
  const insertAfter = (key?: string) =>
    setDrafts((current) => {
      const lines_ = current ?? [];
      const at = key
        ? lines_.findIndex((line) => line.key === key) + 1
        : lines_.length;
      return [...lines_.slice(0, at), blankLine(), ...lines_.slice(at)];
    });
  // Lines are ordered by dragging the grip; the order they stand in is the
  // order they are saved in (`sort` follows the array).
  const [dragKey, setDragKey] = useState<string>();
  const [dropAt, setDropAt] = useState<number>();
  const reorder = (from: number, to: number) =>
    setDrafts((current) => {
      if (!current || from === to || from + 1 === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
  const dropIndexFor = (event: DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? index : index + 1;
  };
  const blankLine = (): LineDraft => ({
    key: crypto.randomUUID(),
    itemType: 'device',
    modelId: null,
    softwareProductId: null,
    quantity: 1,
    unitPrice: '',
    receivedQuantity: 0,
  });
  /** Saves the whole set; the order's lines are written together. */
  const commit = (next: LineDraft[]) => {
    save.reset();
    save.mutate({ lines: next });
  };

  // The totals follow what is on screen, so an edit is costed before it is
  // saved.
  const shown = drafts ?? rows.map(draftOf);
  const total = shown.reduce(
    (sum, line) => sum + line.quantity * Number(line.unitPrice || 0),
    0,
  );
  const quantities = shown.reduce((sum, line) => sum + line.quantity, 0);
  const received = shown.reduce((sum, line) => sum + line.receivedQuantity, 0);
  // Whether this reader sees money here. The lines answer it when there are
  // any — the service omits `unitPrice` from a reader who may not read it —
  // but a new order has none, and deciding "no prices" from an empty list
  // left the column out of the editor, so a first line could never be
  // priced. The order's own estimate answers the same question: the grants
  // hold it and the line price together as the cost fields.
  const priced =
    rows.length > 0
      ? rows.some((row) => row.unitPrice !== undefined)
      : order.data?.estimatedTotal !== undefined;
  const incomplete = (drafts ?? []).some((line) => lineIncomplete(line));
  // item + quantity + received + actions, the unit price when the reader may
  // see it, and the subtotal only outside the editor (which drops it).
  const columns =
    5 + (priced ? 1 : 0) + (priced && !drafts ? 1 : 0) + (drafts ? 1 : 0);
  // Nothing to save until something changed, as the extended-field card does.
  const dirty =
    drafts !== undefined &&
    JSON.stringify(drafts.map(({ key: _key, ...line }) => line)) !==
      JSON.stringify(rows.map(draftOf).map(({ key: _key, ...line }) => line));

  return (
    <Card ref={contextRef} className='@container py-0'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex min-h-9 items-center justify-between gap-3 border-b border-border/60 pb-2'>
          <h2 className='font-heading text-sm font-semibold'>
            {t('tabs.lines')}
          </h2>
          {batchable && !drafts ? (
            <div className='flex flex-wrap items-center justify-end gap-3'>
              {aiAvailable ? (
                <>
                  <input
                    ref={documentInputRef}
                    type='file'
                    accept={DOCUMENT_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) setBatch({ file });
                    }}
                  />
                  {/* The picker opens from the click itself; the form opens
                      on the document already being read. */}
                  <AiShortcut onClick={() => documentInputRef.current?.click()}>
                    {t('receipt.fromDocument')}
                  </AiShortcut>
                </>
              ) : null}
              <Button size='sm' variant='outline' onClick={() => setBatch({})}>
                <Truck data-icon='inline-start' />
                {t('receipt.batch')}
              </Button>
            </div>
          ) : null}
          {canEdit ? (
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {drafts ? (
                <>
                  {aiAvailable ? (
                    <AiShortcut
                      onClick={() =>
                        ask(t('ai.prompts.parseDocument'), {
                          autoSend: false,
                        })
                      }
                    >
                      {t('ai.parseDocument')}
                    </AiShortcut>
                  ) : null}
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={save.isPending}
                    onClick={() => {
                      setDrafts(undefined);
                      save.reset();
                    }}
                  >
                    <X data-icon='inline-start' />
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    size='sm'
                    disabled={save.isPending || incomplete || !dirty}
                    onClick={() => commit(drafts)}
                  >
                    <Save data-icon='inline-start' />
                    {t('actions.save')}
                  </Button>
                </>
              ) : (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    save.reset();
                    setDrafts(
                      rows.length > 0 ? rows.map(draftOf) : [blankLine()],
                    );
                  }}
                >
                  <Pencil data-icon='inline-start' />
                  {t('actions.edit')}
                </Button>
              )}
            </div>
          ) : null}
        </div>
        {save.error ? (
          <p className='text-sm text-destructive'>{errorMessage(save.error)}</p>
        ) : null}
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                {drafts ? <TableHead className='w-8' /> : null}
                {/* What it is, then which one. The name takes the slack;
                  the numbers keep the width they need, or the editor's
                  selects squeeze them to nothing. */}
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
                {/* While editing, the row's own subtotal is the multiplication
                  the editor is about to do and the footer already totals: the
                  column only costs the number inputs the width they need. */}
                {priced && !drafts ? (
                  <TableHead className='w-px whitespace-nowrap text-right'>
                    {t('fields.subtotal')}
                  </TableHead>
                ) : null}
                <TableHead className='w-px whitespace-nowrap text-right'>
                  {t('fields.received')}
                </TableHead>
                <TableHead className='w-px' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts
                ? drafts.map((line, index) => (
                    <LineEditor
                      key={line.key}
                      draft={line}
                      priced={priced}
                      busy={save.isPending}
                      dragging={dragKey === line.key}
                      dropBefore={dropAt === index}
                      dropAfter={
                        dropAt === index + 1 && index === drafts.length - 1
                      }
                      onChange={(next) => patchDraft(line.key, next)}
                      onAdd={() => insertAfter(line.key)}
                      onRemove={() =>
                        setDrafts(drafts.filter((row) => row.key !== line.key))
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
                        const from = drafts.findIndex(
                          (row) => row.key === dragKey,
                        );
                        if (from >= 0)
                          reorder(from, dropIndexFor(event, index));
                        setDragKey(undefined);
                        setDropAt(undefined);
                      }}
                    />
                  ))
                : rows.map((row) => (
                    <TableRow key={text(row.id)}>
                      <TableCell className='w-px whitespace-nowrap'>
                        <LineType itemType={row.itemType} />
                      </TableCell>
                      <TableCell>
                        <LineItem row={row} names={names} />
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {text(row.quantity)}
                      </TableCell>
                      {priced ? (
                        <>
                          <TableCell className='text-right tabular-nums'>
                            {row.unitPrice === undefined
                              ? '—'
                              : formatMoney(row.unitPrice)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {row.unitPrice === undefined
                              ? '—'
                              : formatMoney(
                                  Number(row.quantity) *
                                    Number(row.unitPrice ?? 0),
                                )}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className='text-right tabular-nums'>
                        <ReceivedCell row={row} />
                      </TableCell>
                      <TableCell>
                        <div className='flex items-center justify-end gap-1'>
                          {canReceive &&
                          Number(row.receivedQuantity) <
                            Number(row.quantity) ? (
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => setReceiving(row)}
                            >
                              <Truck data-icon='inline-start' />
                              {t('procurement.receive')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              {drafts?.length === 0 ||
              (lines.data && rows.length === 0 && !drafts) ? (
                <TableRow>
                  <TableCell
                    colSpan={columns}
                    className='py-8 text-center text-muted-foreground'
                  >
                    {drafts ? (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => insertAfter()}
                      >
                        <Plus data-icon='inline-start' />
                        {t('procurement.addLine')}
                      </Button>
                    ) : (
                      t('procurement.noLines')
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            {shown.length > 0 ? (
              <TableFooter>
                <TableRow>
                  {drafts ? <TableCell /> : null}
                  <TableCell />
                  <TableCell />
                  <TableCell className='text-right font-medium tabular-nums'>
                    {quantities}
                  </TableCell>
                  {/* Editing drops the per-row subtotal column, so the total
                    sits under the unit price there and under 小计 otherwise. */}
                  {priced ? (
                    drafts ? (
                      <TableCell className='text-right font-medium tabular-nums'>
                        {formatMoney(total)}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell />
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatMoney(total)}
                        </TableCell>
                      </>
                    )
                  ) : null}
                  <TableCell className='text-right font-medium tabular-nums'>
                    {received} / {quantities}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
        {/* Past the draft, a change to the lines states why: the approval was
          given for what the order said then. */}
        {batch ? (
          <BatchReceiptDialog
            orderId={id}
            order={record}
            lines={rows}
            initialFile={batch.file}
            onClose={() => setBatch(undefined)}
          />
        ) : null}
        {receiving ? (
          <ReceiveDialog
            orderId={id}
            order={record}
            line={receiving}
            onClose={() => setReceiving(undefined)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** What the line is for: its kind, the model or product, and the note. */
/**
 * What the line buys, as a type: one of the five asset types, and for an
 * entitlement the kind tag its own page uses, so the two say the same thing.
 */
function LineType({ itemType }: { readonly itemType: unknown }): ReactElement {
  const { t } = useTranslation();
  const value = text(itemType);
  return (
    <div className='flex items-center gap-2'>
      <AssetTypeBadge
        value={ENTITLEMENT_KINDS.has(value) ? 'entitlement' : itemType}
        label={t(`enums.appliesTo.${assetTypeOf(value)}`, {
          defaultValue: value,
        })}
      />
      {ENTITLEMENT_KINDS.has(value) ? (
        <EntitlementKindBadge kind={itemType} />
      ) : null}
    </div>
  );
}

/** Which one: the model, or the software product an entitlement is of. */
function LineItem({
  row,
  names,
}: {
  readonly row: ItamRecord;
  readonly names: Readonly<Record<string, ReferenceNames | undefined>>;
}): ReactElement {
  const item = row.modelId
    ? (names.models?.get(text(row.modelId)) ?? '…')
    : row.softwareProductId
      ? (names.softwareProducts?.get(text(row.softwareProductId)) ?? '…')
      : '';
  return <span className='font-medium'>{item || '—'}</span>;
}

/** How much of the line has arrived, muted until something has. */
function ReceivedCell({ row }: { readonly row: ItamRecord }): ReactElement {
  const done = Number(row.receivedQuantity);
  const wanted = Number(row.quantity);
  // `--warning` is the fill a warning badge sits on, not a text colour; its
  // readable partner is `--warning-foreground`. There is no `--success`
  // token at all, so `text-success` painted nothing — what is fully in
  // reads in the positive tone the rest of the application uses, primary.
  return (
    <span
      className={
        done === 0
          ? 'text-muted-foreground'
          : done >= wanted
            ? 'text-primary'
            : 'text-warning-foreground'
      }
    >
      {done} / {wanted}
    </span>
  );
}

/** What the server would refuse, said before the save rather than after. */
function lineIncomplete(line: LineDraft): boolean {
  return (
    (HARDWARE.has(line.itemType) && !line.modelId) ||
    ((line.itemType === 'perpetual' || line.itemType === 'subscription') &&
      !line.softwareProductId) ||
    line.quantity < 1
  );
}

/**
 * One line of the set under edit; the whole table saves together. The
 * create-order dialog uses it too, without the received column (a new order
 * has received nothing).
 */
export function LineEditor({
  draft,
  priced,
  showReceived = true,
  busy,
  dragging,
  dropBefore,
  dropAfter,
  onChange,
  onAdd,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  readonly draft: LineDraft;
  readonly priced: boolean;
  readonly showReceived?: boolean;
  readonly busy: boolean;
  readonly dragging: boolean;
  readonly dropBefore: boolean;
  readonly dropAfter: boolean;
  readonly onChange: (draft: LineDraft) => void;
  readonly onAdd: () => void;
  readonly onRemove: () => void;
  readonly onDragStart: () => void;
  readonly onDragEnd: () => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}): ReactElement {
  const { t } = useTranslation();
  // The line picks one of the five asset types; an entitlement then says
  // which kind, because receiving one creates a perpetual entitlement or a
  // subscription and they are not the same record. `itemType` still stores
  // the kind, as the server expects.
  const assetType = ENTITLEMENT_KINDS.has(draft.itemType)
    ? 'entitlement'
    : draft.itemType;
  const typeItems = LINE_ASSET_TYPES.map((value) => ({
    value,
    label: t(`enums.appliesTo.${value}`),
  }));
  const kindItems = (['perpetual', 'subscription'] as const).map((value) => ({
    value,
    label: t(`enums.entitlementKind.${value}`),
  }));
  const patch = (values: Partial<LineDraft>) =>
    onChange({ ...draft, ...values });
  return (
    <TableRow
      className={cn(
        'bg-muted/40 align-top',
        dragging && 'opacity-40',
        dropBefore && 'shadow-[inset_0_2px_0_0_var(--color-primary)]',
        dropAfter && 'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <TableCell className='pr-0'>
        <span
          draggable
          aria-label={t('procurement.reorderLine')}
          title={t('procurement.reorderLine')}
          className='inline-flex cursor-grab text-muted-foreground/60 active:cursor-grabbing'
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draft.key);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical className='size-4' />
        </span>
      </TableCell>
      {/* The type is its own column, so it keeps the width of a word. */}
      <TableCell className='w-px whitespace-nowrap'>
        <div className='flex items-center gap-2'>
          <Select
            items={typeItems}
            value={assetType}
            onValueChange={(value) =>
              patch({
                // An entitlement line starts perpetual; the kind select says so.
                itemType: (value === 'entitlement'
                  ? 'perpetual'
                  : value) as LineItemType,
                modelId: null,
                softwareProductId: null,
              })
            }
            disabled={draft.receivedQuantity > 0}
          >
            <SelectTrigger className='w-auto shrink-0'>
              <SelectValue>
                <AssetTypeBadge
                  value={assetType}
                  label={
                    typeItems.find((item) => item.value === assetType)?.label
                  }
                />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {typeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  <AssetTypeBadge value={item.value} label={item.label} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assetType === 'entitlement' ? (
            <Select
              items={kindItems}
              value={draft.itemType}
              onValueChange={(value) =>
                patch({ itemType: value as LineItemType })
              }
              disabled={draft.receivedQuantity > 0}
            >
              <SelectTrigger className='w-auto shrink-0'>
                <SelectValue
                  placeholder={t('fields.entitlementKind')}
                ></SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kindItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className='flex min-w-32 items-center gap-2'>
          {HARDWARE.has(draft.itemType) ? (
            <div className='min-w-0 flex-1'>
              {/* Only the models of the type the line says it is: a
                    配件 line picks from accessory models, not every model
                    in the catalogue. */}
              <ReferenceSelect
                reference={{
                  collection: 'models',
                  filter: { appliesTo: draft.itemType },
                }}
                placeholder={t('procurement.selectModel')}
                value={draft.modelId}
                onChange={(value) => patch({ modelId: value })}
              />
            </div>
          ) : (
            <div className='min-w-0 flex-1'>
              <ReferenceSelect
                reference={{ collection: 'softwareProducts' }}
                placeholder={t('procurement.selectProduct')}
                value={draft.softwareProductId}
                onChange={(value) => patch({ softwareProductId: value })}
              />
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className='w-px'>
        <Input
          className='w-16 text-right'
          type='number'
          min={Math.max(1, draft.receivedQuantity)}
          value={draft.quantity}
          onChange={(event) =>
            patch({ quantity: Number(event.target.value) || 1 })
          }
        />
      </TableCell>
      {priced ? (
        <TableCell className='w-px'>
          <Input
            className='w-24 text-right'
            type='number'
            min={0}
            step={0.01}
            value={draft.unitPrice}
            onChange={(event) => patch({ unitPrice: event.target.value })}
          />
        </TableCell>
      ) : null}
      {showReceived ? (
        <TableCell className='w-px whitespace-nowrap text-right tabular-nums text-muted-foreground'>
          {draft.receivedQuantity} / {draft.quantity}
        </TableCell>
      ) : null}
      <TableCell>
        <div className='flex items-center justify-end gap-1'>
          <Button
            size='icon-xs'
            variant='ghost'
            aria-label={t('procurement.addLineBelow')}
            title={t('procurement.addLineBelow')}
            disabled={busy}
            onClick={onAdd}
          >
            <Plus />
          </Button>
          <Button
            size='icon-xs'
            variant='ghost'
            aria-label={t('actions.delete')}
            title={
              draft.receivedQuantity > 0
                ? t('procurement.lineReceived')
                : t('actions.delete')
            }
            disabled={busy || draft.receivedQuantity > 0}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ReceiveDialog({
  orderId,
  order,
  line,
  onClose,
}: {
  readonly orderId: string;
  /** The order: what a received device inherits from it. */
  readonly order: ItamRecord;
  readonly line: ItamRecord;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  // Someone answers for every record this creates, and the person
  // receiving it is that someone until they say otherwise.
  const receiverId = useCurrentUserId();
  const remaining = Number(line.quantity) - Number(line.receivedQuantity);
  const itemType = text(line.itemType) as LineItemType;
  const [quantity, setQuantity] = useState(remaining);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [stockItemId, setStockItemId] = useState<string | null>(null);
  // Joining an existing item or starting a new one are different acts, so
  // the dialog asks which rather than inferring it from an empty picker.
  const [stockMode, setStockMode] = useState<'join' | 'create'>();
  const [entitlementId, setEntitlementId] = useState<string | null>(null);
  const [seatMode, setSeatMode] = useState<'join' | 'create'>();
  // The terms a new entitlement is opened on, held as a record and rendered
  // from the entitlement's own field metadata: the labels, options and
  // controls then say the same thing here as on its page.
  const [terms, setTerms] = useState<Record<string, unknown>>({});
  /**
   * A term's starting value: the receiver, the line's own price, and for
   * the required choices the same default the service would apply — a
   * required select opening on 无 only invites the error it then raises.
   */
  const TERM_DEFAULTS: Readonly<Record<string, unknown>> = {
    licensingModel: 'perUser',
    billingModel: 'perSeat',
    billingCycle: 'year',
  };
  const termValue = (key: string) =>
    key in terms
      ? terms[key]
      : key === 'ownerId'
        ? receiverId
        : key === 'unitPrice'
          ? (line.unitPrice ?? null)
          : (TERM_DEFAULTS[key] ?? null);
  const isStock =
    itemType === 'accessory' ||
    itemType === 'consumable' ||
    itemType === 'component';
  const isEntitlement = itemType === 'perpetual' || itemType === 'subscription';
  // A device, and a stock item started here, are named after their model
  // unless the receiver says otherwise:
  // the same name the service would fall back to, shown so it can be edited
  // rather than discovered afterwards. `undefined` means untouched.
  const lineNames = useReferenceNames([
    { collection: 'models', ids: [text(line.modelId) || null] },
    {
      collection: 'softwareProducts',
      ids: [text(line.softwareProductId) || null],
    },
  ]);
  const modelName = lineNames.models?.get(text(line.modelId)) ?? '';
  const productName =
    lineNames.softwareProducts?.get(text(line.softwareProductId)) ?? '';
  const [name, setName] = useState<string | undefined>(undefined);
  const shownName = name ?? (isEntitlement ? productName : modelName) ?? '';
  // What a new entitlement of this kind is opened on. The seat count comes
  // from the receipt, the name has its own input above, and the product,
  // category and maker follow the line — the rest is asked here.
  const termKeys =
    itemType === 'perpetual'
      ? [
          'licensingModel',
          'maintenanceExpiryDate',
          'productKey',
          'reassignable',
          'ownerId',
        ]
      : [
          'billingModel',
          'billingCycle',
          'unitPrice',
          'expiryDate',
          'autoRenew',
          'ownerId',
        ];
  const termFields = termKeys.flatMap((key) => {
    const field = ENTITLEMENT_FIELDS.find((entry) => entry.key === key);
    return field ? [field] : [];
  });
  // A device is received one at a time: each one is its own record, with
  // its own serial, place and keeper. What the order already settled — the
  // model, the vendor, that it is owned — is shown but not asked again.
  const [serialNo, setSerialNo] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(() =>
    order.departmentId ? text(order.departmentId) : null,
  );
  // Left empty on purpose: the model states its own 保修月数, and an empty
  // field is what lets the service work the date out from the purchase date
  // and that term instead of a guess overwriting it.
  const [warrantyEndDate, setWarrantyEndDate] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(receiverId ?? null);
  // Stock of this very model is where this batch belongs unless the
  // receiver says otherwise, so it starts chosen and can be cleared.
  const sameModelStock = useItamList(
    STOCK_PATH,
    {
      pageSize: 1,
      filter: { kind: itemType, modelId: text(line.modelId) },
    },
    { enabled: isStock && Boolean(line.modelId) },
  );
  const suggestedStockId = text(sameModelStock.data?.data[0]?.id) || null;
  // Stock of this very model is where a batch usually belongs, so that is
  // the mode it opens in — and the only stock it may join. With no such
  // item there is nothing to add to, so a new record is the only answer
  // and the other option is not offered.
  const canJoinStock = sameModelStock.isPending || Boolean(suggestedStockId);
  const mode = canJoinStock ? (stockMode ?? 'join') : 'create';
  const joining = mode === 'join' ? (stockItemId ?? suggestedStockId) : null;
  // Joining an existing item puts the goods where that item already is.
  const joinedItem = useItamRecord(STOCK_PATH, joining ?? undefined);
  const joinedLocationId = text(joinedItem.data?.locationId) || null;
  // Creating a second item for the same model in the same place is almost
  // always a slip: the two would split one stock between them, and nothing
  // downstream could tell which one to issue from. Said, not blocked —
  // two boxes of the same thing kept apart is somebody's real answer.
  const twin = useItamList(
    STOCK_PATH,
    {
      pageSize: 1,
      filter: {
        kind: itemType,
        modelId: text(line.modelId),
        locationId: locationId ?? '',
      },
    },
    {
      enabled:
        isStock &&
        mode === 'create' &&
        Boolean(line.modelId) &&
        Boolean(locationId),
    },
  );
  const twinName = text(twin.data?.data[0]?.name);
  // The same choice for an entitlement: a further batch usually adds seats
  // to the one already on the books for that product.
  const sameProductEntitlement = useItamList(
    ENTITLEMENTS_PATH,
    {
      pageSize: 1,
      filter: {
        kind: itemType,
        softwareProductId: text(line.softwareProductId),
      },
    },
    { enabled: isEntitlement && Boolean(line.softwareProductId) },
  );
  const suggestedEntitlementId =
    text(sameProductEntitlement.data?.data[0]?.id) || null;
  const canJoinEntitlement =
    sameProductEntitlement.isPending || Boolean(suggestedEntitlementId);
  const entitlementMode = canJoinEntitlement ? (seatMode ?? 'join') : 'create';
  const joiningEntitlement =
    entitlementMode === 'join'
      ? (entitlementId ?? suggestedEntitlementId)
      : null;
  // What the seats will inherit, read from the record they join: shown so
  // the receiver sees the terms before adding to them, and not editable —
  // changing them is the entitlement's own page's business.
  const joinedEntitlement = useItamRecord(
    ENTITLEMENTS_PATH,
    joiningEntitlement ?? undefined,
  );
  const receive = useMutation({
    mutationFn: async () => {
      const extra: Record<string, unknown> = {};
      if (isEntitlement && entitlementMode === 'create') {
        if (shownName) extra.name = shownName;
        for (const field of termFields) {
          const value = termValue(field.key);
          if (value !== null && value !== undefined && value !== '')
            extra[field.key] = value;
        }
      }
      if (isStock && mode === 'create') {
        if (shownName.trim()) extra.name = shownName.trim();
        if (minimumQuantity.trim())
          extra.minimumQuantity = Number(minimumQuantity);
        if (ownerId) extra.ownerId = ownerId;
      }
      if (itemType === 'device') {
        if (shownName.trim()) extra.name = shownName.trim();
        extra.departmentId = departmentId;
        extra.warrantyEndDate = warrantyEndDate || null;
        if (ownerId) extra.ownerId = ownerId;
      }
      return api.request({
        path: `${PURCHASE_ORDERS_PATH}/${orderId}/receive`,
        method: 'POST',
        json: {
          lineId: line.id,
          quantity: itemType === 'device' ? 1 : quantity,
          ...(itemType === 'device'
            ? {
                serialNos: serialNo.trim() ? [serialNo.trim()] : [],
                locationId: locationId ?? undefined,
              }
            : {}),
          ...(isEntitlement ? { entitlementId: joiningEntitlement } : {}),
          ...(isStock
            ? { stockItemId: joining, locationId: locationId ?? undefined }
            : {}),
          ...(Object.keys(extra).length > 0 ? { extra } : {}),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onClose();
    },
  });
  const needsLocation =
    (itemType === 'device' || (isStock && mode === 'create')) && !locationId;
  // Joining needs something to join.
  const needsStockItem = isStock && mode === 'join' && !joining;
  const needsEntitlement =
    isEntitlement && entitlementMode === 'join' && !joiningEntitlement;
  // A subscription is dated by its next renewal; the service refuses one
  // without it, so the button says no before the request does.
  const needsRenewalDate =
    itemType === 'subscription' &&
    entitlementMode === 'create' &&
    !terms.expiryDate;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('procurement.receiveTitle', {
        item: modelName || productName || t(`enums.lineItemType.${itemType}`),
      })}
      description={t('procurement.remaining', { count: remaining })}
      busy={receive.isPending}
      error={receive.error}
      // A device is received one at a time, so only the others state how
      // many; what they may not do is exceed what is left on the line.
      disabled={
        needsLocation ||
        needsStockItem ||
        needsEntitlement ||
        needsRenewalDate ||
        (itemType === 'device' && !ownerId) ||
        (itemType !== 'device' && (quantity < 1 || quantity > remaining))
      }
      confirmLabel={t('procurement.receive')}
      onConfirm={() => receive.mutate()}
    >
      {itemType === 'device' ? (
        <>
          {/* What the order settled: shown so the record being created is
              legible, disabled because this is not where it changes. */}
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-model'>{t('fields.model')}</Label>
            <ReferenceSelect
              id='receive-model'
              reference={{ collection: 'models' }}
              value={line.modelId ? text(line.modelId) : null}
              onChange={() => undefined}
              disabled
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-serial'>{t('fields.serialNo')}</Label>
            <Input
              id='receive-serial'
              value={serialNo}
              onChange={(event) => setSerialNo(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-name'>{t('fields.name')}</Label>
            <Input
              id='receive-name'
              value={shownName}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-location'>
              {t('fields.location')} <span className='text-destructive'>*</span>
            </Label>
            <ReferenceSelect
              id='receive-location'
              reference={{ collection: 'locations' }}
              value={locationId}
              onChange={setLocationId}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-department'>
              {t('fields.owningDepartment')}
            </Label>
            <ReferenceSelect
              id='receive-department'
              reference={{ collection: 'departments' }}
              value={departmentId}
              onChange={setDepartmentId}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-ownership'>{t('fields.ownership')}</Label>
            <Input
              id='receive-ownership'
              value={t('enums.ownership.owned')}
              readOnly
              disabled
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-vendor'>{t('fields.vendor')}</Label>
            <ReferenceSelect
              id='receive-vendor'
              reference={{ collection: 'vendors' }}
              value={order.vendorId ? text(order.vendorId) : null}
              onChange={() => undefined}
              disabled
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-warranty'>
              {t('fields.warrantyEndDate')}
            </Label>
            <Input
              id='receive-warranty'
              type='date'
              max='9999-12-31'
              value={warrantyEndDate}
              onChange={(event) => setWarrantyEndDate(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-owner'>
              {t('fields.owner')} <span className='text-destructive'>*</span>
            </Label>
            <ReferenceSelect
              id='receive-owner'
              reference={{ collection: 'users' }}
              value={ownerId}
              onChange={setOwnerId}
            />
          </div>
        </>
      ) : null}
      {isStock ? (
        <>
          <div className='grid gap-1.5'>
            <Label>{t('procurement.stockTarget')}</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value: unknown) => {
                if (value === 'join' || value === 'create') setStockMode(value);
              }}
              className='flex flex-wrap gap-x-6 gap-y-2'
            >
              {(['join', 'create'] as const).map((value) => (
                <Label
                  key={value}
                  htmlFor={`receive-mode-${value}`}
                  className={cn(
                    'flex items-center gap-2 font-normal',
                    value === 'join' &&
                      !canJoinStock &&
                      'text-muted-foreground',
                  )}
                >
                  <RadioGroupItem
                    value={value}
                    id={`receive-mode-${value}`}
                    disabled={value === 'join' && !canJoinStock}
                  />
                  {t(
                    value === 'join'
                      ? 'procurement.joinStockItem'
                      : 'procurement.newStockItem',
                  )}
                </Label>
              ))}
            </RadioGroup>
          </div>
          {mode === 'join' ? (
            <div className='grid gap-1.5'>
              <Label htmlFor='receive-stock'>
                {t('procurement.existingStockItem')}{' '}
                <span className='text-destructive'>*</span>
              </Label>
              <ReferenceSelect
                id='receive-stock'
                reference={{
                  collection: 'stockItems',
                  // Only stock of this line's model: a batch of docks does
                  // not join the keyboards.
                  filter: { kind: itemType, modelId: text(line.modelId) },
                }}
                value={joining}
                onChange={setStockItemId}
              />
            </div>
          ) : null}
          <div className='grid gap-1.5'>
            <Label htmlFor='receive-location'>
              {t('fields.location')}
              {mode === 'join' ? null : (
                <span className='text-destructive'> *</span>
              )}
            </Label>
            {/* Where it goes is the item's own place once it joins one. */}
            <ReferenceSelect
              id='receive-location'
              reference={{ collection: 'locations' }}
              value={mode === 'join' ? joinedLocationId : locationId}
              onChange={setLocationId}
              disabled={mode === 'join'}
            />
            {mode === 'create' && twinName ? (
              <p className='text-xs text-warning-foreground'>
                {t('procurement.stockTwin', { name: twinName })}
              </p>
            ) : null}
          </div>
          {/* A new item is a record of its own: it needs what the stock page
              would have asked for. Joining one needs none of it. */}
          {mode === 'create' ? (
            <>
              <div className='grid gap-1.5'>
                <Label htmlFor='receive-stock-name'>{t('fields.name')}</Label>
                <Input
                  id='receive-stock-name'
                  value={shownName}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='receive-minimum'>
                  {t('fields.minimumQuantity')}
                </Label>
                <Input
                  id='receive-minimum'
                  type='number'
                  min={0}
                  value={minimumQuantity}
                  placeholder={t('stock.minimumFromSettings')}
                  onChange={(event) => setMinimumQuantity(event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='receive-stock-owner'>{t('fields.owner')}</Label>
                <ReferenceSelect
                  id='receive-stock-owner'
                  reference={{ collection: 'users' }}
                  value={ownerId}
                  onChange={setOwnerId}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}
      {isEntitlement ? (
        <>
          <div className='grid gap-1.5'>
            <Label>{t('procurement.seatTarget')}</Label>
            <RadioGroup
              value={entitlementMode}
              onValueChange={(value: unknown) => {
                if (value === 'join' || value === 'create') setSeatMode(value);
              }}
              className='flex flex-wrap gap-x-6 gap-y-2'
            >
              {(['join', 'create'] as const).map((value) => (
                <Label
                  key={value}
                  htmlFor={`receive-seat-${value}`}
                  className={cn(
                    'flex items-center gap-2 font-normal',
                    value === 'join' &&
                      !canJoinEntitlement &&
                      'text-muted-foreground',
                  )}
                >
                  <RadioGroupItem
                    value={value}
                    id={`receive-seat-${value}`}
                    disabled={value === 'join' && !canJoinEntitlement}
                  />
                  {t(
                    value === 'join'
                      ? 'procurement.joinEntitlement'
                      : 'procurement.newEntitlement',
                  )}
                </Label>
              ))}
            </RadioGroup>
          </div>
          {entitlementMode === 'join' ? (
            <div className='grid gap-1.5'>
              <Label htmlFor='receive-entitlement'>
                {t('procurement.existingEntitlement')}{' '}
                <span className='text-destructive'>*</span>
              </Label>
              <ReferenceSelect
                id='receive-entitlement'
                reference={{
                  collection: 'entitlements',
                  filter: {
                    kind: itemType,
                    softwareProductId: text(line.softwareProductId),
                  },
                }}
                value={joiningEntitlement}
                onChange={setEntitlementId}
              />
            </div>
          ) : (
            <div className='grid gap-1.5'>
              <Label htmlFor='receive-name'>{t('fields.name')}</Label>
              <Input
                id='receive-name'
                value={shownName}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          {/* The terms: asked for when opening an entitlement, shown as
              they stand when adding seats to one. Adding seats changes
              none of them — renewing is its own act, on its own page. */}
          {entitlementMode === 'create' || joinedEntitlement.data ? (
            // One field per row: the dialog is a column of questions, and a
            // two-up grid put unrelated answers side by side.
            <div className='grid gap-3'>
              {termFields
                .filter(
                  (field) =>
                    !field.visibleWhen || field.visibleWhen({ kind: itemType }),
                )
                .map((field) => (
                  <div key={field.key} className='grid gap-1.5'>
                    <Label htmlFor={`receive-term-${field.key}`}>
                      {t(field.label)}
                      {entitlementMode === 'create' &&
                      field.requiredWhen?.({ kind: itemType }) ? (
                        <span className='text-destructive'> *</span>
                      ) : null}
                    </Label>
                    <FieldInput
                      id={`receive-term-${field.key}`}
                      field={field}
                      value={
                        entitlementMode === 'create'
                          ? termValue(field.key)
                          : (joinedEntitlement.data?.[field.key] ?? null)
                      }
                      disabled={entitlementMode === 'join'}
                      onChange={(value) =>
                        setTerms((current) => ({
                          ...current,
                          [field.key]: value,
                        }))
                      }
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </>
      ) : null}
      {itemType !== 'device' ? (
        <div className='grid gap-1.5'>
          <Label htmlFor='receive-quantity'>{t('fields.quantity')}</Label>
          <Input
            id='receive-quantity'
            type='number'
            min={1}
            max={remaining}
            value={quantity}
            // What is left is the ceiling: less may arrive, never more.
            onChange={(event) =>
              setQuantity(
                Math.min(
                  remaining,
                  Math.max(1, Number(event.target.value) || 1),
                ),
              )
            }
          />
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
