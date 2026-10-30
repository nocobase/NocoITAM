import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { createUuid } from '@nocobase/app-client';
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
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { QuickCreateDialog } from '@/components/itam/quick-create-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { ReviewMark } from '@/components/itam/review-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useApi, useItamSettings, type ItamRecord } from '@/lib/itam/api';
import { errorMessage, formatMoney, text } from '@/lib/itam/format';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import {
  PURCHASE_ORDERS_PATH,
  raisedBy,
  type LineItemType,
} from '@/lib/itam/procurement';
import { useAiPageContext } from '@/lib/itam/ai-chat';
import {
  blankLine as isBlankLine,
  captureLine,
  captureLines,
  keyedUnmatched,
  type PurchaseCapture,
} from '@/lib/itam/purchase-capture';
import { usePurchaseOrderCapture } from '@/lib/itam/use-purchase-capture';
import { cn } from '@/lib/utils';
import { useReferenceNames, type ReferenceNames } from '@/lib/itam/references';
import { DOCUMENT_ACCEPT } from '@/lib/itam/receipt';

import { CaptureNotice } from './po-capture';
import { ReceiptDialog } from './receipt-dialog';
import { CellText } from '@/components/itam/cell-text';

export interface LineDraft {
  readonly key: string;
  readonly id?: string;
  readonly itemType: LineItemType;
  readonly modelId: string | null;
  readonly softwareProductId: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly receivedQuantity: number;
  /** 解析单据 was not sure of its item: 请核对 until it is changed. */
  readonly uncertain?: boolean;
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
  // 到货入库, opened empty or on a delivery document already picked.
  const [batch, setBatch] = useState<{ readonly file?: File }>();
  const documentInputRef = useRef<HTMLInputElement>(null);
  // The lines under edit, read by AI 整理's form when it asks.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  // The order is the chat's page context while its lines are shown, so the
  // assistant reads it with its commands.
  const { available: aiAvailable } = useAiPageContext({
    kind: 'purchaseOrders',
    id,
    label: text(record.orderNo) || id,
  });
  const status = text(order.data?.status);
  const rows = lines.data ?? [];

  // 解析单据 (2026-10-06): the AI 整理 reading, lines only. What it read
  // joins the lines under edit, marked 请核对 where it was unsure; what it
  // could not place is listed above them to pick or create.
  const [captured, setCaptured] = useState<PurchaseCapture>();
  const [parsingFile, setParsingFile] = useState<string>();
  const parseInputRef = useRef<HTMLInputElement>(null);
  // The rows the last reading added: an adjustment hands its lines back
  // whole, so these are what it replaces.
  const addedRef = useRef<ReadonlySet<string>>(new Set());
  const capture = usePurchaseOrderCapture({
    orderId: id,
    form: () => {
      const current = draftsRef.current ?? [];
      const plain = (line: LineDraft) => ({
        itemType: line.itemType,
        modelId: line.modelId,
        softwareProductId: line.softwareProductId,
        quantity: line.quantity,
        unitPrice: line.unitPrice === '' ? null : Number(line.unitPrice),
      });
      return {
        header: {
          reason: record.reason ?? null,
          description: record.description ?? null,
          vendorId: record.vendorId ?? null,
          currency: record.currency ?? null,
        },
        lines: current
          .filter((line) => addedRef.current.has(line.key))
          .map(plain),
        existingLines: current
          .filter(
            (line) => !addedRef.current.has(line.key) && !isBlankLine(line),
          )
          .map(plain),
      };
    },
    onFill: (next, mode) => {
      const added = captureLines(next);
      const replaced = addedRef.current;
      addedRef.current = new Set(added.map((line) => line.key));
      setDrafts((current) => {
        const kept = (current ?? []).filter(
          (line) => !replaced.has(line.key) && !isBlankLine(line),
        );
        const all = [...kept, ...added];
        return all.length > 0 ? all : [blankLine()];
      });
      // A line the first reading could not place is still unplaced after
      // an adjustment, which hands back only what is on the form; a new
      // reading of the material starts over (2026-10-28: the lines of an
      // earlier paste stayed listed under the next one).
      setCaptured((previous) => ({
        ...next,
        unmatched: keyedUnmatched(
          previous && mode === 'adjust'
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
    },
  });
  const failedOrganise = capture.mode === 'organise' && capture.failure;
  const parseFailure = failedOrganise ? capture.failure : undefined;
  const parse = (file: File) => {
    // The editor opens on the lines as saved, before the reading starts,
    // so what it hands back has somewhere to go.
    if (!draftsRef.current) {
      save.reset();
      const opened = rows.length > 0 ? rows.map(draftOf) : [blankLine()];
      draftsRef.current = opened;
      setDrafts(opened);
    }
    // A second document adds to what the first one added.
    addedRef.current = new Set();
    setCaptured(undefined);
    setParsingFile(file.name);
    capture.organise('', file);
  };
  const endCapture = () => {
    setCaptured(undefined);
    addedRef.current = new Set();
    capture.release();
  };
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
      endCapture();
    },
  });

  // Editing an order is its 负责人's, like submitting it; the service
  // refuses everyone else ('NOT_OWNER').
  const canEdit =
    Boolean(permissions.update) &&
    EDITABLE.has(status) &&
    raisedBy(record, currentUserId);
  const canReceive = Boolean(permissions.receive) && RECEIVABLE.has(status);
  // Whether anything is still to arrive.
  const batchable =
    canReceive &&
    rows.some((row) => Number(row.receivedQuantity) < Number(row.quantity));
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
      current?.map((row) =>
        row.key === key ? { ...line, uncertain: false } : row,
      ),
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
    key: createUuid(),
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
  const settings = useItamSettings();
  const priced =
    rows.length > 0
      ? rows.some((row) => row.unitPrice !== undefined)
      : order.data?.estimatedTotal !== undefined;
  // The order's one currency (2026-10-30), on the price columns' headings
  // and the total rather than on every cell; an order without one is in the
  // deployment's.
  const currency =
    text(order.data?.currency ?? record.currency) ||
    settings.data?.general.currency ||
    null;
  const withCurrency = (label: string) =>
    currency ? `${label} (${currency})` : label;
  const incomplete = (drafts ?? []).some((line) => lineIncomplete(line));
  // item + quantity + received + actions, the unit price when the reader may
  // see it, and the subtotal only outside the editor (which drops it).
  const columns =
    5 + (priced ? 1 : 0) + (priced && !drafts ? 1 : 0) + (drafts ? 1 : 0);
  // Nothing to save until something changed, as the extended-field card does.
  const dirty =
    drafts !== undefined &&
    JSON.stringify(
      drafts.map(({ key: _key, uncertain: _uncertain, ...line }) => line),
    ) !==
      JSON.stringify(rows.map(draftOf).map(({ key: _key, ...line }) => line));

  return (
    <Card className='@container py-0'>
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
              <Button variant='outline' onClick={() => setBatch({})}>
                <Truck data-icon='inline-start' />
                {t('procurement.receive')}
              </Button>
            </div>
          ) : null}
          {canEdit ? (
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {/* Offered whether or not the lines are being edited: it opens
                  the editor itself, since the lines it reads are added there
                  for the reader to save (2026-10-06). */}
              {capture.available ? (
                <>
                  <input
                    ref={parseInputRef}
                    type='file'
                    accept={DOCUMENT_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) parse(file);
                    }}
                  />
                  {/* The picker opens from the click itself. */}
                  <AiShortcut
                    disabled={capture.busy}
                    title={parseFailure}
                    className={parseFailure ? 'text-destructive' : undefined}
                    onClick={() => parseInputRef.current?.click()}
                  >
                    {capture.busy && capture.mode === 'organise'
                      ? t('procurement.readingDocument', {
                          file: parsingFile,
                        })
                      : parseFailure
                        ? t('procurement.readDocumentFailed')
                        : t('ai.parseDocument')}
                  </AiShortcut>
                </>
              ) : null}
              {drafts ? (
                <>
                  <Button
                    variant='ghost'
                    disabled={save.isPending}
                    onClick={() => {
                      setDrafts(undefined);
                      endCapture();
                      save.reset();
                    }}
                  >
                    <X data-icon='inline-start' />
                    {t('actions.cancel')}
                  </Button>
                  <Button
                    disabled={save.isPending || incomplete || !dirty}
                    onClick={() => commit(drafts)}
                  >
                    <Save data-icon='inline-start' />
                    {t('actions.save')}
                  </Button>
                </>
              ) : (
                <Button
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
        {/* What 解析单据 said, the lines it could not place — each with
            its picker and 创建型号 — and where to adjust, as in AI 整理. */}
        {captured && drafts ? (
          <CaptureNotice
            capture={capture}
            result={captured}
            currency={text(record.currency) || null}
            priced={priced}
            onPlace={async (line, pick) => {
              const placed = await capture.place(line, pick);
              if (!placed)
                throw new Error(t('procurement.capture.stillUnmatched'));
              const added = captureLine(placed);
              addedRef.current = new Set([...addedRef.current, added.key]);
              setDrafts((current) => [
                ...(current ?? []).filter((row) => !isBlankLine(row)),
                added,
              ]);
              setCaptured((previous) =>
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
        ) : failedOrganise ? (
          <p className='text-sm text-destructive'>{parseFailure}</p>
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
                    {withCurrency(t('fields.unitPrice'))}
                  </TableHead>
                ) : null}
                {/* While editing, the row's own subtotal is the multiplication
                  the editor is about to do and the footer already totals: the
                  column only costs the number inputs the width they need. */}
                {priced && !drafts ? (
                  <TableHead className='w-px whitespace-nowrap text-right'>
                    {withCurrency(t('fields.subtotal'))}
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
                      review={line.uncertain}
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
                      <TableCell />
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
                      <Button variant='outline' onClick={() => insertAfter()}>
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
                        {formatMoney(total, currency)}
                      </TableCell>
                    ) : (
                      <>
                        <TableCell />
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatMoney(total, currency)}
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
          <ReceiptDialog
            orderId={id}
            order={record}
            lines={rows}
            initialFile={batch.file}
            onClose={() => setBatch(undefined)}
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
  return <CellText className='font-medium'>{item || '—'}</CellText>;
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
  review = false,
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
  /** The assistant picked this line's item without being sure (AI 整理). */
  readonly review?: boolean;
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
  // A model or product the books do not hold yet is created from the picker
  // itself, by whoever may create one, without leaving the order.
  const mayCreateModel = useCollectionPermissions('models', ['create']).create;
  const mayCreateProduct = useCollectionPermissions('softwareProducts', [
    'create',
  ]).create;
  const [creating, setCreating] = useState<string>();
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
                onCreate={
                  mayCreateModel ? (name) => setCreating(name) : undefined
                }
                createLabel={t('models.new')}
              />
            </div>
          ) : (
            <div className='min-w-0 flex-1'>
              <ReferenceSelect
                reference={{ collection: 'softwareProducts' }}
                placeholder={t('procurement.selectProduct')}
                value={draft.softwareProductId}
                onChange={(value) => patch({ softwareProductId: value })}
                onCreate={
                  mayCreateProduct ? (name) => setCreating(name) : undefined
                }
                createLabel={t('softwareProducts.new')}
              />
            </div>
          )}
          <QuickCreateDialog
            collection={
              HARDWARE.has(draft.itemType) ? 'models' : 'softwareProducts'
            }
            open={creating !== undefined}
            onOpenChange={(open) => {
              if (!open) setCreating(undefined);
            }}
            initial={creating ? { name: creating } : undefined}
            // The line already says what kind it is, and a purchase line's
            // model must be of that kind, so the category offered is too.
            narrow={(field) =>
              field.key === 'categoryId' && HARDWARE.has(draft.itemType)
                ? {
                    ...field,
                    reference: {
                      ...field.reference!,
                      filter: { appliesTo: draft.itemType },
                    },
                  }
                : field
            }
            onCreated={(record) =>
              patch(
                HARDWARE.has(draft.itemType)
                  ? { modelId: text(record.id) }
                  : { softwareProductId: text(record.id) },
              )
            }
          />
          {review ? <ReviewMark /> : null}
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
