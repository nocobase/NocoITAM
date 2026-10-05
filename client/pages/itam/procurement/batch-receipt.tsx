import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactElement,
} from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useAI,
  useAIPageElementHandle,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';
import { useHiddenChat, useItamAi } from '@/lib/itam/ai-chat';
import { useApi, useItamList, type ItamRecord } from '@/lib/itam/api';
import { errorMessage, text } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import {
  BATCH_ITEM_TYPES,
  chatAttachmentOf,
  DOCUMENT_ACCEPT,
  splitSerials,
  type ReceiptIssue,
  type ReceiptPlan,
} from '@/lib/itam/receipt';
import { useReferenceNames } from '@/lib/itam/references';
import { readSearchTurn } from '@/lib/itam/search-turn';
import { STOCK_PATH } from '@/lib/itam/stock';
import { cn } from '@/lib/utils';

/** One device being received; `source` while it holds what the document said. */
interface UnitDraft {
  readonly key: string;
  readonly serialNo: string;
  readonly source?: string;
  /**
   * Added by a scan rather than by 添加一台: the row waiting for the next
   * code. Left empty it is no device — the scan after the last one never
   * came — so it is not received.
   */
  readonly awaiting?: boolean;
}

/** The units a line receives: every row but one still waiting for a scan. */
const unitsOf = (draft: DeviceDraft): readonly UnitDraft[] =>
  draft.units.filter((unit) => !(unit.awaiting && !unit.serialNo.trim()));

/** A device line: one row per unit, and what every unit of it shares. */
interface DeviceDraft {
  readonly units: readonly UnitDraft[];
  readonly locationId: string | null;
  readonly departmentId: string | null;
  readonly ownerId: string | null;
  readonly warrantyEndDate: string;
}

/** A stock line: how many arrived, and where a new stock record goes. */
interface StockDraft {
  readonly quantity: string;
  readonly source?: string;
  readonly locationId: string | null;
}

/** Where reading a delivery document stands. */
interface DocumentSession {
  readonly file: File;
  readonly phase: 'uploading' | 'reading' | 'done' | 'failed';
  readonly runId?: string;
  readonly prompt?: string;
  readonly plan?: ReceiptPlan;
  readonly conversationId?: string;
  /** What the assistant said when it finished. */
  readonly summary?: string;
  /** Why it failed. */
  readonly message?: string;
}

/** What the batch carries for one line, as the service receives it. */
interface ReceiptInput {
  readonly lineId: string;
  readonly quantity: number;
  readonly serialNos?: readonly string[];
  readonly locationId?: string;
  readonly stockItemId?: string | null;
  readonly extra?: Readonly<Record<string, unknown>>;
}

const outstandingOf = (line: ItamRecord): number =>
  Math.max(0, Number(line.quantity) - Number(line.receivedQuantity));

const newUnit = (serialNo = '', source?: string): UnitDraft => ({
  key: crypto.randomUUID(),
  serialNo,
  ...(source ? { source } : {}),
});

/** A value of a delivery document field as the strict draft schema takes it. */
const clip = (value: unknown, length: number): string =>
  typeof value === 'string' ? value.trim().slice(0, length) : '';

/**
 * The order's outstanding device and stock lines received together, in one
 * transaction (2026-10-05). A device is still a record of its own, so each
 * is a row with its own serial — pasted as a column from a spreadsheet,
 * scanned one after another, or read by the assistant from the delivery
 * document — while what every unit of a line shares (place, department,
 * keeper, warranty) is asked once. Entitlements keep their own dialog: a
 * batch of seats asks which entitlement to join and on what terms, which is
 * not a column of serials.
 *
 * Reading a document is the assistant's work and the receiver's decision:
 * it fills the form (marking each value it filled with where in the document
 * it came from), the rules on the server check it, and nothing is received
 * until the receiver presses 入库. The run is recorded either way.
 */
export function BatchReceiptDialog({
  orderId,
  order,
  lines,
  initialFile,
  onClose,
}: {
  readonly orderId: string;
  readonly order: ItamRecord;
  readonly lines: readonly ItamRecord[];
  /** A delivery document picked before the dialog opened, read at once. */
  readonly initialFile?: File;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const receiverId = useCurrentUserId() ?? null;
  const receivable = useMemo(
    () =>
      lines.filter(
        (line) =>
          BATCH_ITEM_TYPES.has(text(line.itemType)) && outstandingOf(line) > 0,
      ),
    [lines],
  );
  const modelIds = [
    ...new Set(receivable.map((line) => text(line.modelId)).filter(Boolean)),
  ];
  const models = useItamList(
    'itam/master/models',
    { ids: modelIds, pageSize: 100 },
    { enabled: modelIds.length > 0 },
  );
  const modelById = new Map(
    (models.data?.data ?? []).map((model) => [text(model.id), model]),
  );
  const makers = useReferenceNames([
    {
      collection: 'manufacturers',
      ids: [...modelById.values()].map(
        (model) => (model.manufacturerId as string | null) ?? null,
      ),
    },
  ]);
  const modelName = (line: ItamRecord): string =>
    text(modelById.get(text(line.modelId))?.name);
  // Stock of the very model a stock line buys is where its batch goes, as
  // in the single receipt dialog; without one a new record is started.
  const stockModelIds = receivable
    .filter((line) => text(line.itemType) !== 'device')
    .map((line) => text(line.modelId));
  const sameModelStock = useItamList(
    STOCK_PATH,
    { filter: { modelId: stockModelIds }, pageSize: 100 },
    { enabled: stockModelIds.length > 0 },
  );
  const stockFor = (line: ItamRecord): ItamRecord | undefined =>
    sameModelStock.data?.data.find(
      (item) =>
        text(item.modelId) === text(line.modelId) &&
        text(item.kind) === text(line.itemType),
    );

  const [devices, setDevices] = useState<Record<string, DeviceDraft>>(() =>
    Object.fromEntries(
      receivable
        .filter((line) => text(line.itemType) === 'device')
        .map((line) => [
          text(line.id),
          {
            units: [],
            locationId: null,
            // The order says which department asked for it, and the person
            // receiving answers for what arrives until they say otherwise.
            departmentId: text(order.departmentId) || null,
            ownerId: receiverId,
            warrantyEndDate: '',
          },
        ]),
    ),
  );
  const [stocks, setStocks] = useState<Record<string, StockDraft>>(() =>
    Object.fromEntries(
      receivable
        .filter((line) => text(line.itemType) !== 'device')
        .map((line) => [text(line.id), { quantity: '', locationId: null }]),
    ),
  );
  const patchDevice = (lineId: string, patch: Partial<DeviceDraft>) =>
    setDevices((current) => {
      const draft = current[lineId];
      return draft ? { ...current, [lineId]: { ...draft, ...patch } } : current;
    });
  const patchStock = (lineId: string, patch: Partial<StockDraft>) =>
    setStocks((current) => {
      const draft = current[lineId];
      return draft ? { ...current, [lineId]: { ...draft, ...patch } } : current;
    });

  /** Opens the form on what the assistant read, line by line. */
  const applyPlan = (plan: ReceiptPlan) => {
    setDevices((current) => {
      const next = { ...current };
      for (const planned of plan.lines) {
        const draft = next[planned.lineId];
        if (draft)
          next[planned.lineId] = {
            ...draft,
            units: planned.units.map((unit) =>
              newUnit(unit.serialNo, unit.source ?? planned.sources[0]),
            ),
          };
      }
      return next;
    });
    setStocks((current) => {
      const next = { ...current };
      for (const planned of plan.lines) {
        const draft = next[planned.lineId];
        if (draft)
          next[planned.lineId] = {
            ...draft,
            quantity: String(planned.quantity),
            source: planned.sources[0] ?? '',
          };
      }
      return next;
    });
  };

  const receipts: ReceiptInput[] = receivable.flatMap(
    (line): ReceiptInput[] => {
      const lineId = text(line.id);
      const device = devices[lineId];
      if (device) {
        const units = unitsOf(device);
        if (units.length === 0) return [];
        return [
          {
            lineId,
            quantity: units.length,
            serialNos: units.map((unit) => unit.serialNo.trim()),
            locationId: device.locationId ?? undefined,
            extra: {
              ...(modelName(line) ? { name: modelName(line) } : {}),
              departmentId: device.departmentId,
              warrantyEndDate: device.warrantyEndDate || null,
              ...(device.ownerId ? { ownerId: device.ownerId } : {}),
            },
          },
        ];
      }
      const stock = stocks[lineId];
      const quantity = Number.parseInt(stock?.quantity ?? '', 10);
      if (!stock || !Number.isFinite(quantity) || quantity < 1) return [];
      const joined = stockFor(line);
      return [
        joined
          ? { lineId, quantity, stockItemId: text(joined.id) }
          : {
              lineId,
              quantity,
              stockItemId: null,
              locationId: stock.locationId ?? undefined,
              extra: {
                ...(modelName(line) ? { name: modelName(line) } : {}),
                ...(receiverId ? { ownerId: receiverId } : {}),
              },
            },
      ];
    },
  );

  // The rules, asked while the form is edited: what would stop the batch
  // is said before 入库 is offered rather than by a refusal afterwards.
  const batch = receipts.map((receipt) => ({
    lineId: receipt.lineId,
    quantity: receipt.quantity,
    serialNos: receipt.serialNos,
  }));
  const batchKey = useDebounced(JSON.stringify(batch), 300);
  const check = useQuery({
    queryKey: [
      'itam',
      PURCHASE_ORDERS_PATH,
      'receipt-check',
      orderId,
      batchKey,
    ],
    enabled: batch.length > 0,
    queryFn: async () =>
      (
        await api.request<{ data: ReceiptIssue[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/receipt-check`,
          method: 'POST',
          json: { lines: JSON.parse(batchKey) as unknown },
        })
      ).data,
    placeholderData: (previous) => previous,
  });
  const issues = batch.length > 0 ? (check.data ?? []) : [];
  const blocking = issues.some((entry) => entry.blocking);

  const {
    available: canRead,
    busy: reading,
    session,
    read,
    release,
    contextRef,
  } = useDeliveryDocument({
    orderId,
    order,
    lines,
    modelById,
    makers: makers.manufacturers,
    onPlan: applyPlan,
  });

  // 按送货单入库 picks the file before the dialog opens (a file picker
  // opens only from the click itself), and reading starts with the dialog.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !initialFile) return;
    startedRef.current = true;
    read(initialFile);
  });

  const [saved, setSaved] = useState(false);
  const receive = useMutation({
    mutationFn: () =>
      api.request({
        path: `${PURCHASE_ORDERS_PATH}/${orderId}/receive-batch`,
        method: 'POST',
        json: {
          // Only a run whose plan is on the form is closed by this batch.
          runId: session?.phase === 'done' ? session.runId : null,
          receipts,
        },
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onClose();
    },
  });
  const close = () => {
    if (!saved) release();
    onClose();
  };

  const incomplete = receivable.some((line) => {
    const lineId = text(line.id);
    const device = devices[lineId];
    if (device)
      return (
        unitsOf(device).length > 0 && (!device.locationId || !device.ownerId)
      );
    const stock = stocks[lineId];
    const quantity = Number.parseInt(stock?.quantity ?? '', 10);
    return (
      Number.isFinite(quantity) &&
      quantity > 0 &&
      !stockFor(line) &&
      !stock?.locationId
    );
  });
  const count = receipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
  const plan = session?.plan;
  // What the rules found in the document itself; what would stop the batch
  // is said on the line it concerns, from the live check.
  const documentIssues = (plan?.issues ?? []).filter(
    (entry) => !entry.blocking,
  );

  return (
    <ConfirmDialog
      open
      size='wide'
      onOpenChange={(open) => !open && close()}
      title={t('receipt.title')}
      description={t('receipt.description')}
      busy={receive.isPending}
      error={receive.error}
      disabled={
        count === 0 || incomplete || blocking || check.isFetching || reading
      }
      confirmLabel={t('receipt.confirm', { count })}
      onConfirm={() => receive.mutate()}
    >
      <div ref={contextRef} hidden />
      {canRead ? (
        <DocumentStrip session={session} busy={reading} read={read} />
      ) : null}
      {plan && documentIssues.length > 0 ? (
        <div className='grid gap-1 rounded-md border border-warning/60 bg-warning/10 p-3 text-sm'>
          <p className='font-medium'>{t('receipt.documentChecks')}</p>
          <ul className='grid list-disc gap-0.5 pl-5 text-muted-foreground'>
            {documentIssues.map((entry) => (
              <li key={issueKey(entry)}>
                <IssueText issue={entry} lines={receivable} names={modelName} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {receivable.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('receipt.nothing')}</p>
      ) : null}
      {receivable.map((line) => {
        const lineId = text(line.id);
        const lineIssues = issues.filter(
          (entry) => entry.lineId === lineId && !entry.serialNo,
        );
        const device = devices[lineId];
        const stock = stocks[lineId];
        return (
          <section
            key={lineId}
            className='grid gap-3 rounded-lg border border-border p-3'
          >
            <header className='flex flex-wrap items-baseline justify-between gap-2'>
              <h3 className='font-medium'>
                {modelName(line) ||
                  t(`enums.lineItemType.${text(line.itemType)}`)}
              </h3>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {t('receipt.outstanding', { count: outstandingOf(line) })}
                {device
                  ? ` · ${t('receipt.units', { count: unitsOf(device).length })}`
                  : null}
              </span>
            </header>
            {lineIssues.map((entry) => (
              <p key={issueKey(entry)} className='text-xs text-destructive'>
                <IssueText issue={entry} lines={receivable} names={modelName} />
              </p>
            ))}
            {device ? (
              <DeviceLine
                lineId={lineId}
                draft={device}
                issues={issues}
                onChange={(patch) => patchDevice(lineId, patch)}
              />
            ) : stock ? (
              <StockLine
                lineId={lineId}
                draft={stock}
                joined={stockFor(line)}
                outstanding={outstandingOf(line)}
                onChange={(patch) => patchStock(lineId, patch)}
              />
            ) : null}
          </section>
        );
      })}
      {lines.some((line) => !BATCH_ITEM_TYPES.has(text(line.itemType))) ? (
        <p className='text-xs text-muted-foreground'>
          {t('receipt.entitlementsSeparately')}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

/** The shared answers of a device line, then one row per unit. */
function DeviceLine({
  lineId,
  draft,
  issues,
  onChange,
}: {
  readonly lineId: string;
  readonly draft: DeviceDraft;
  readonly issues: readonly ReceiptIssue[];
  readonly onChange: (patch: Partial<DeviceDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const setUnits = (units: readonly UnitDraft[]) => onChange({ units });
  /**
   * A paste of several serials — a column from a spreadsheet — fills this
   * row and adds one after it for each of the rest.
   */
  const paste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const serials = splitSerials(event.clipboardData.getData('text'));
    if (serials.length < 2) return;
    event.preventDefault();
    setUnits([
      ...draft.units.slice(0, index),
      ...serials.map((serial) => newUnit(serial)),
      ...draft.units.slice(index + 1),
    ]);
  };
  const hasUnits = draft.units.length > 0;
  return (
    <div className='grid gap-3'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='grid gap-1.5'>
          <Label htmlFor={`batch-location-${lineId}`}>
            {t('fields.location')}
            {hasUnits ? <span className='text-destructive'> *</span> : null}
          </Label>
          <ReferenceSelect
            id={`batch-location-${lineId}`}
            reference={{ collection: 'locations' }}
            value={draft.locationId}
            onChange={(locationId) => onChange({ locationId })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={`batch-owner-${lineId}`}>
            {t('fields.owner')}
            {hasUnits ? <span className='text-destructive'> *</span> : null}
          </Label>
          <ReferenceSelect
            id={`batch-owner-${lineId}`}
            reference={{ collection: 'users' }}
            value={draft.ownerId}
            onChange={(ownerId) => onChange({ ownerId })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={`batch-department-${lineId}`}>
            {t('fields.owningDepartment')}
          </Label>
          <ReferenceSelect
            id={`batch-department-${lineId}`}
            reference={{ collection: 'departments' }}
            value={draft.departmentId}
            onChange={(departmentId) => onChange({ departmentId })}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={`batch-warranty-${lineId}`}>
            {t('fields.warrantyEndDate')}
          </Label>
          {/* Empty lets the service work it out from the model's 保修月数. */}
          <Input
            id={`batch-warranty-${lineId}`}
            type='date'
            max='9999-12-31'
            value={draft.warrantyEndDate}
            onChange={(event) =>
              onChange({ warrantyEndDate: event.target.value })
            }
          />
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label>{t('fields.serialNo')}</Label>
        {draft.units.map((unit, index) => {
          const problem = unit.serialNo.trim()
            ? issues.find(
                (entry) =>
                  entry.lineId === lineId &&
                  entry.serialNo === unit.serialNo.trim(),
              )
            : undefined;
          return (
            <div key={unit.key} className='grid gap-1'>
              <div className='flex items-center gap-2'>
                <span className='w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums'>
                  {index + 1}
                </span>
                <Input
                  value={unit.serialNo}
                  placeholder={t('receipt.serialPlaceholder')}
                  aria-label={t('receipt.serialOf', { index: index + 1 })}
                  aria-invalid={problem ? true : undefined}
                  className={cn('font-mono', problem && 'border-destructive')}
                  onPaste={(event) => paste(index, event)}
                  // Typing over what the document said makes it the
                  // receiver's value: the AI mark goes with it.
                  onChange={(event) =>
                    setUnits(
                      draft.units.map((entry) =>
                        entry.key === unit.key
                          ? { key: entry.key, serialNo: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  // A scanner in keyboard mode types the code and ends it
                  // with Enter — or Tab, as some are set up: the next row
                  // is where the next scan goes. Shift+Tab still leaves.
                  onKeyDown={(event) => {
                    if (
                      (event.key !== 'Enter' &&
                        (event.key !== 'Tab' || event.shiftKey)) ||
                      event.nativeEvent.isComposing ||
                      !unit.serialNo.trim()
                    )
                      return;
                    event.preventDefault();
                    if (index === draft.units.length - 1)
                      setUnits([
                        ...draft.units,
                        { ...newUnit(), awaiting: true },
                      ]);
                    focusNext(event.currentTarget);
                  }}
                />
                {unit.source !== undefined ? (
                  <AiMark source={unit.source} />
                ) : (
                  <span className='size-4 shrink-0' />
                )}
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('actions.delete')}
                  onClick={() =>
                    setUnits(
                      draft.units.filter((entry) => entry.key !== unit.key),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {problem ? (
                <p className='pl-8 text-xs text-destructive'>
                  <IssueText issue={problem} lines={[]} names={() => ''} />
                </p>
              ) : null}
            </div>
          );
        })}
        <div>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setUnits([...draft.units, newUnit()])}
          >
            <Plus data-icon='inline-start' />
            {t('receipt.addUnit')}
          </Button>
        </div>
        {draft.units.length === 0 ? (
          <p className='text-xs text-muted-foreground'>
            {t('receipt.pasteHint')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** How many of a stock line arrived, and where a new record of it goes. */
function StockLine({
  lineId,
  draft,
  joined,
  outstanding,
  onChange,
}: {
  readonly lineId: string;
  readonly draft: StockDraft;
  readonly joined: ItamRecord | undefined;
  readonly outstanding: number;
  readonly onChange: (patch: Partial<StockDraft>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const quantity = Number.parseInt(draft.quantity, 10);
  const some = Number.isFinite(quantity) && quantity > 0;
  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      <div className='grid gap-1.5'>
        <Label htmlFor={`batch-quantity-${lineId}`}>
          {t('receipt.quantityThisTime')}
        </Label>
        <div className='flex items-center gap-2'>
          <Input
            id={`batch-quantity-${lineId}`}
            type='number'
            min={0}
            max={outstanding}
            value={draft.quantity}
            onChange={(event) =>
              // A number the receiver typed is theirs, not the document's.
              onChange({ quantity: event.target.value, source: undefined })
            }
          />
          {draft.source !== undefined ? <AiMark source={draft.source} /> : null}
        </div>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={`batch-stock-location-${lineId}`}>
          {joined
            ? t('receipt.joinStock', { name: text(joined.name) })
            : t('receipt.newStock')}
          {!joined && some ? (
            <span className='text-destructive'> *</span>
          ) : null}
        </Label>
        {/* Joining puts the goods where that record already is. */}
        <ReferenceSelect
          id={`batch-stock-location-${lineId}`}
          reference={{ collection: 'locations' }}
          value={joined ? text(joined.locationId) || null : draft.locationId}
          disabled={Boolean(joined)}
          onChange={(locationId) => onChange({ locationId })}
        />
      </div>
    </div>
  );
}

/** The sparkle on a value the assistant filled, saying where it read it. */
function AiMark({ source }: { readonly source: string }): ReactElement {
  const { t } = useTranslation();
  const label = source
    ? t('receipt.aiFilledFrom', { source })
    : t('receipt.aiFilled');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className='inline-flex size-4 shrink-0 text-success-foreground'
            aria-label={label}
          />
        }
      >
        <Sparkles className='size-4' aria-hidden='true' />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IssueText({
  issue,
  lines,
  names,
}: {
  readonly issue: ReceiptIssue;
  readonly lines: readonly ItamRecord[];
  readonly names: (line: ItamRecord) => string;
}): ReactElement {
  const { t } = useTranslation();
  const line = lines.find((entry) => text(entry.id) === issue.lineId);
  return (
    <>
      {t(`receipt.issues.${issue.code}`, {
        description: issue.description ?? '',
        source: issue.source ?? '—',
        serial: issue.serialNo ?? '',
        expected: issue.expected ?? 0,
        actual: issue.actual ?? 0,
        line: line ? names(line) : '',
      })}
    </>
  );
}

/** What the document strip shows: pick a file, then how reading it went. */
function DocumentStrip({
  session,
  busy,
  read,
}: {
  readonly session: DocumentSession | undefined;
  readonly busy: boolean;
  readonly read: (file: File) => void;
}): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const name = session?.file.name ?? '';
  return (
    <div className='grid gap-2 rounded-md border border-dashed border-border p-3'>
      <input
        ref={inputRef}
        type='file'
        accept={DOCUMENT_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) read(file);
        }}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2 text-sm'>
          {busy ? (
            <Spinner className='size-4 shrink-0' />
          ) : session ? (
            <FileText className='size-4 shrink-0 text-muted-foreground' />
          ) : (
            <Sparkles className='size-4 shrink-0 text-success-foreground' />
          )}
          <span className='min-w-0 wrap-anywhere'>
            {!session
              ? t('receipt.document.prompt')
              : session.phase === 'uploading'
                ? t('receipt.document.uploading', { file: name })
                : session.phase === 'reading'
                  ? t('receipt.document.reading', { file: name })
                  : session.phase === 'done'
                    ? t('receipt.document.done', { file: name })
                    : t('receipt.document.failed', { file: name })}
          </span>
        </div>
        {session ? (
          <AiShortcut disabled={busy} onClick={() => inputRef.current?.click()}>
            {t('receipt.document.again')}
          </AiShortcut>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => inputRef.current?.click()}
          >
            <Upload data-icon='inline-start' />
            {t('receipt.document.choose')}
          </Button>
        )}
      </div>
      {session?.phase === 'done' && session.plan ? (
        <DocumentHeader plan={session.plan} />
      ) : null}
      {session?.phase === 'done' && session.summary ? (
        <p className='text-xs text-muted-foreground'>
          <CollapsibleText
            text={plain(session.summary)}
            chars={160}
            lines={3}
          />
        </p>
      ) : null}
      {session?.phase === 'failed' ? (
        <p className='text-xs text-destructive'>
          <CollapsibleText
            text={plain(session.message ?? '')}
            chars={160}
            lines={3}
          />
          {session.file.type.startsWith('image/')
            ? ` ${t('receipt.document.imageUnsupported')}`
            : null}
        </p>
      ) : null}
      {!session ? (
        <p className='text-xs text-muted-foreground'>
          {t('receipt.document.hint')}
        </p>
      ) : null}
    </div>
  );
}

function DocumentHeader({
  plan,
}: {
  readonly plan: ReceiptPlan;
}): ReactElement | null {
  const { t } = useTranslation();
  const parts = [
    plan.header.deliveryNo
      ? t('receipt.document.number', { no: plan.header.deliveryNo })
      : undefined,
    plan.header.deliveryDate ?? undefined,
    plan.header.vendorName ?? undefined,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className='text-xs text-muted-foreground'>{parts.join(' · ')}</p>;
}

interface DeliveryDocument {
  /** A model is configured and the assistant is switched on. */
  readonly available: boolean;
  readonly busy: boolean;
  readonly session: DocumentSession | undefined;
  readonly read: (file: File) => void;
  /** Lets go of a run that was not saved, as the dialog closes. */
  readonly release: () => void;
  readonly contextRef: (element: HTMLElement | null) => void;
}

/**
 * Reading a delivery document. The file is kept on the order (its
 * attachments) and a run is started for it, then the assistant reads it in
 * a conversation of its own (`ItamAi.receipt`) under the receiving skill,
 * with read-only tools — the plugin enforces that list on the server — and
 * hands its reading back through the one page tool it has, `prefillReceipt`.
 * The rules on the server turn that into the plan the form opens on. The
 * conversation is deleted once the turn is over; the run is the record.
 */
function useDeliveryDocument({
  orderId,
  order,
  lines,
  modelById,
  makers,
  onPlan,
}: {
  readonly orderId: string;
  readonly order: ItamRecord;
  readonly lines: readonly ItamRecord[];
  readonly modelById: ReadonlyMap<string, ItamRecord>;
  readonly makers: ReadonlyMap<string, string> | undefined;
  readonly onPlan: (plan: ReceiptPlan) => void;
}): DeliveryDocument {
  const { t } = useTranslation();
  const api = useApi();
  const ai = useItamAi();
  const aiService = useAI();
  const files = useService(clientFileRepositoryManagerToken);
  const chat = useHiddenChat('receipt');
  const [session, setSession] = useState<DocumentSession>();
  // The run the page tool reports to: the tool is registered once, and
  // must reach the run of whichever document is being read.
  const runRef = useRef<string | undefined>(undefined);
  const onPlanRef = useRef(onPlan);
  useEffect(() => {
    onPlanRef.current = onPlan;
  }, [onPlan]);

  const tools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: 'prefillReceipt',
        title: 'Prefill the receiving form',
        description:
          'Hand what you read from the delivery document to the receiving form on screen, which the receiver checks and saves. One entry in "rows" per goods row of the document: lineId is the purchase order line it matches (an id from the page context lines, or an empty string when it matches none), description the row as printed, partCode the part number printed on it (omit when none), quantity the quantity delivered, serialNos every serial number belonging to that row, source where the row is in the document ("Sheet1 row 4", "page 2 line 3"). deliveryNo, deliveryDate (YYYY-MM-DD) and vendorName from the document header when printed. Call it once, after reading the whole document.',
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            deliveryNo: { type: 'string' },
            deliveryDate: { type: 'string' },
            vendorName: { type: 'string' },
            notes: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  lineId: { type: 'string' },
                  description: { type: 'string' },
                  partCode: { type: 'string' },
                  quantity: { type: 'number', minimum: 0 },
                  serialNos: { type: 'array', items: { type: 'string' } },
                  source: { type: 'string' },
                },
                required: ['lineId', 'description', 'quantity'],
              },
            },
          },
          required: ['rows'],
        },
        // The assistant supplies the arguments; read them defensively and
        // send the server only what its schema takes.
        execute: async (args: unknown) => {
          const runId = runRef.current;
          if (!runId) throw new Error('No delivery document is being read.');
          const input = (args ?? {}) as Record<string, unknown>;
          const rows = (Array.isArray(input.rows) ? input.rows : [])
            .slice(0, 500)
            .map((value: unknown) => {
              const row = (value ?? {}) as Record<string, unknown>;
              const quantity = Number(row.quantity);
              return {
                lineId: clip(row.lineId, 64) || null,
                description: clip(row.description, 500),
                partCode: clip(row.partCode, 128) || null,
                quantity: Number.isFinite(quantity)
                  ? Math.min(10000, Math.max(0, quantity))
                  : 0,
                serialNos: (Array.isArray(row.serialNos) ? row.serialNos : [])
                  .map((serial: unknown) => clip(serial, 128))
                  .filter(Boolean)
                  .slice(0, 10000),
                source: clip(row.source, 200) || null,
              };
            });
          const { data } = await api.request<{
            data: { plan: ReceiptPlan };
          }>({
            path: `${PURCHASE_ORDERS_PATH}/${orderId}/receipt-runs/${runId}/draft`,
            method: 'POST',
            json: {
              deliveryNo: clip(input.deliveryNo, 128) || null,
              deliveryDate: clip(input.deliveryDate, 32) || null,
              vendorName: clip(input.vendorName, 255) || null,
              notes: clip(input.notes, 2000) || null,
              rows,
            },
          });
          onPlanRef.current(data.plan);
          setSession((current) =>
            current?.runId === runId
              ? { ...current, plan: data.plan }
              : current,
          );
          // What the rules made of it, so the assistant's closing sentence
          // can say what the receiver needs to look at.
          return {
            linesFilled: data.plan.lines.length,
            issues: data.plan.issues.map((entry) => entry.code),
          };
        },
      },
    ],
    [api, orderId],
  );
  const { ref: contextRef, context } = useAIPageElementHandle({
    id: 'itam-receipt-document',
    title: t('receipt.context'),
    kind: 'purchaseOrderReceipt',
    getContext: () => ({
      order: {
        orderNo: order.orderNo,
        vendorId: order.vendorId,
        orderedAt: order.orderedAt,
      },
      lines: lines.map((line) => {
        const model = modelById.get(text(line.modelId));
        return {
          lineId: line.id,
          itemType: line.itemType,
          item: model ? model.name : undefined,
          manufacturer: model
            ? makers?.get(text(model.manufacturerId))
            : undefined,
          partCode: model?.code ?? undefined,
          softwareProductId: line.softwareProductId ?? undefined,
          quantity: line.quantity,
          received: line.receivedQuantity,
          outstanding: outstandingOf(line),
        };
      }),
    }),
    tools,
  });

  // While the assistant reads, its turn is read out of the chat; once the
  // turn is over it either handed a plan over or it did not.
  const turn =
    session?.phase === 'reading' && session.prompt
      ? readSearchTurn(chat, session.prompt)
      : undefined;
  if (session && turn?.asked && !turn.working)
    setSession({
      ...session,
      phase: session.plan ? 'done' : 'failed',
      conversationId: turn.conversationId,
      summary: turn.text,
      message: session.plan
        ? undefined
        : turn.failed || turn.text || t('receipt.document.noRows'),
    });

  // A finished turn records how it ended and lets its conversation go —
  // the run is the record, the conversation was only the means.
  const settledRef = useRef(new Set<string>());
  useEffect(() => {
    const runId = session?.runId;
    if (!runId || (session.phase !== 'done' && session.phase !== 'failed'))
      return;
    if (settledRef.current.has(runId)) return;
    settledRef.current.add(runId);
    if (session.phase === 'failed')
      void api
        .request({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/receipt-runs/${runId}/fail`,
          method: 'POST',
          json: { reason: (session.message ?? '').slice(0, 2000) || '—' },
        })
        .catch(() => undefined);
    if (session.conversationId)
      void ai?.receipt.state
        .get()
        .removeConversation?.(session.conversationId)
        .catch(() => undefined);
  });

  const discard = (runId: string | undefined) => {
    if (!runId) return;
    void api
      .request({
        path: `${PURCHASE_ORDERS_PATH}/${orderId}/receipt-runs/${runId}/discard`,
        method: 'POST',
      })
      .catch(() => undefined);
  };

  const read = (file: File) => {
    if (!ai?.available) return;
    discard(session?.runId);
    setSession({ file, phase: 'uploading' });
    void (async () => {
      let runId: string | undefined;
      try {
        // Kept on the order first: the document is the evidence the
        // receipt rests on, whatever the assistant makes of it.
        const { record } = await files
          .repository('itamAttachments')
          .uploadOne({ file });
        const fileId = text(record.id);
        await api
          .request({
            path: `itam/attachments/purchaseOrders/${orderId}`,
            method: 'POST',
            json: { fileIds: [fileId] },
          })
          .catch(() => undefined);
        const run = await api.request<{
          data: { id: string; documentText?: string | null };
        }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/receipt-runs`,
          method: 'POST',
          json: { fileId, documentName: file.name },
        });
        runId = run.data.id;
        runRef.current = runId;
        const prompt = t('ai.prompts.readDeliveryDocument', {
          file: file.name,
          orderNo: text(order.orderNo),
        });
        // The server read the document as text: it goes in the message
        // itself, which every later turn of the conversation still has (an
        // attachment is parsed for its own request only, and the turn
        // resumes once the page tool is approved). Only a document the
        // server could not read — a picture — is attached, for a model that
        // reads images.
        const documentText = run.data.documentText;
        const attachments = documentText
          ? []
          : [chatAttachmentOf(await aiService.uploadFile(file), file)];
        setSession({ file, phase: 'reading', runId, prompt });
        ai.receipt.ask(
          documentText
            ? `${prompt}\n\n<delivery_document filename="${file.name.replace(/"/g, "'")}">\n${documentText}\n</delivery_document>`
            : prompt,
          [context],
          {
            attachments,
            // Read-only: the receiving skill and no write tool. The plugin
            // holds the conversation to this list on the server.
            skillSettings: {
              skills: ['receiving'],
              tools: ['itam_business_context'],
            },
          },
        );
      } catch (error) {
        setSession({
          file,
          phase: 'failed',
          runId,
          message: errorMessage(error),
        });
      }
    })();
  };

  return {
    available: Boolean(ai?.available),
    busy: session?.phase === 'uploading' || session?.phase === 'reading',
    session,
    read,
    release: () => {
      if (session?.phase !== 'failed') discard(session?.runId);
      if (session?.conversationId)
        void ai?.receipt.state
          .get()
          .removeConversation?.(session.conversationId)
          .catch(() => undefined);
    },
    contextRef,
  };
}

/**
 * The assistant's sentence as plain text: it is asked for no Markdown, and
 * the emphasis it adds anyway would show as asterisks on this line.
 */
const plain = (value: string): string => value.replace(/\*\*|__|`/g, '').trim();

/** An issue's identity in a list: what it is about, never its position. */
const issueKey = (issue: ReceiptIssue): string =>
  [
    issue.code,
    issue.lineId,
    issue.serialNo,
    issue.description,
    issue.source,
  ].join('\u0000');

/** Moves focus to the next serial input after a scan. */
function focusNext(current: HTMLInputElement): void {
  const section = current.closest('section');
  // The row for the next scan may be added by this same keystroke, so the
  // move waits for it to be rendered.
  requestAnimationFrame(() => {
    const inputs = [
      ...(section?.querySelectorAll<HTMLInputElement>('input.font-mono') ?? []),
    ];
    inputs[inputs.indexOf(current) + 1]?.focus();
  });
}

/** `value`, once it has stopped changing for `delay` milliseconds. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
