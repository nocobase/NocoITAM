import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Scale, X } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import {
  listQueryParams,
  masterDataPath,
  useApi,
  type ItamRecord,
} from '@/lib/itam/api';
import { errorMessage, formatMoney, text, todayIso } from '@/lib/itam/format';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import {
  QUOTE_LIMIT,
  quoteFromReading,
  useQuoteComparison,
  useSaveQuoteComparison,
  type ComparisonView,
  type Quote,
  type Recommendation,
} from '@/lib/itam/quote-comparison';
import { DOCUMENT_ACCEPT } from '@/lib/itam/receipt';
import { useReferenceNames } from '@/lib/itam/references';
import { cn } from '@/lib/utils';

/**
 * 报价比较 (2026-10-17): the quotes a draft order is weighed against before
 * it goes for approval. Each quote document (or pasted text) is read by
 * Asset Steward against the order's lines (`purchaseQuote`), and the server counts
 * the table — each line's price per supplier, the lowest, what a quote
 * leaves out, the totals, the last price paid. Once two are read Asset Steward
 * recommends one (`quoteRecommendation`); the requester takes one, which
 * sets the order's vendor and its lines' unit prices. Kept with the order;
 * the approval assistant reads it. Read-only once the order is sent.
 */

/** The 比较报价 entry in the lines card, and what was compared once saved. */
export function QuoteComparisonEntry({
  record,
  lines,
  canEdit,
}: {
  readonly record: ItamRecord;
  readonly lines: readonly ItamRecord[];
  readonly canEdit: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const id = text(record.id);
  const ai = useItamAi();
  const comparison = useQuoteComparison(id);
  const [open, setOpen] = useState(false);
  const saved = comparison.data;
  if (!saved && !(canEdit && ai.available && lines.length)) return null;
  const chosen =
    saved?.chosenIndex !== null && saved?.chosenIndex !== undefined
      ? saved.quotes[saved.chosenIndex]
      : undefined;
  return (
    <>
      {saved ? (
        <button
          type='button'
          className='flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground'
          onClick={() => setOpen(true)}
        >
          <Scale className='size-4' aria-hidden />
          {t('quotes.compared', { count: saved.quotes.length })}
          {chosen
            ? ` · ${t('quotes.took', { vendor: chosen.vendorName })}`
            : ''}
        </button>
      ) : (
        <AiShortcut onClick={() => setOpen(true)}>
          {t('quotes.compare')}
        </AiShortcut>
      )}
      {open ? (
        <QuoteComparisonDialog
          record={record}
          lines={lines}
          saved={saved ?? null}
          editable={canEdit && ai.available}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

interface Reading {
  readonly key: string;
  readonly label: string;
}

function QuoteComparisonDialog({
  record,
  lines,
  saved,
  editable,
  onOpenChange,
}: {
  readonly record: ItamRecord;
  readonly lines: readonly ItamRecord[];
  readonly saved: ComparisonView | null;
  readonly editable: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const id = text(record.id);
  const api = useApi();
  const queryClient = useQueryClient();
  const files = useService(clientFileRepositoryManagerToken);
  const read = useAiReading();
  const save = useSaveQuoteComparison(id);
  const view = save.data ?? saved;
  const quotes = view?.quotes ?? [];
  const [reading, setReading] = useState<readonly Reading[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [taking, setTaking] = useState<number | null>(null);
  const [vendorPick, setVendorPick] = useState<{
    index: number;
    vendorId: string | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const names = useReferenceNames([
    {
      collection: 'models',
      ids: lines.map((line) => text(line.modelId)).filter(Boolean),
    },
    {
      collection: 'softwareProducts',
      ids: lines.map((line) => text(line.softwareProductId)).filter(Boolean),
    },
  ]);
  const lineName = (line: Readonly<Record<string, unknown>>) =>
    names.models?.get(text(line.modelId)) ??
    names.softwareProducts?.get(text(line.softwareProductId)) ??
    '—';
  const lineIds = new Set(lines.map((line) => text(line.id)));
  const lineContext = lines.map((line) => ({
    id: text(line.id),
    item: lineName(line),
    itemType: text(line.itemType),
    quantity: Number(line.quantity ?? 0),
  }));

  /** Saves the quotes; a new set of quotes drops the old recommendation. */
  const store = (
    next: readonly Quote[],
    extra: {
      readonly recommendation?: Recommendation | null;
      readonly chosenIndex?: number | null;
    } = {},
  ) =>
    save.mutateAsync({
      quotes: next,
      recommendation: extra.recommendation ?? null,
      chosenIndex: extra.chosenIndex ?? null,
    });

  const recommend = async (current: ComparisonView) => {
    if (current.quotes.length < 2) return;
    setRecommending(true);
    try {
      const { purchaseOrderId: _id, updatedAt: _at, ...table } = current;
      const answer = await read({
        task: 'quoteRecommendation',
        material: JSON.stringify(table),
        context: {
          order: {
            reason: text(record.reason),
            description: text(record.description),
            neededBy: text(record.neededBy) || undefined,
          },
          lines: lineContext,
          today: todayIso(),
        },
      });
      const index = Number(answer.reading?.quoteIndex);
      const reasons = Array.isArray(answer.reading?.reasons)
        ? answer.reading.reasons.map((reason) => text(reason)).filter(Boolean)
        : [];
      await store(current.quotes, {
        recommendation: {
          quoteIndex:
            Number.isInteger(index) &&
            index >= 0 &&
            index < current.quotes.length
              ? index
              : null,
          reasons: reasons.slice(0, 3).map((reason) => reason.slice(0, 500)),
          ...(answer.said ? { said: answer.said.slice(0, 1000) } : {}),
        },
      });
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setRecommending(false);
    }
  };

  /** Reads one quote's material, then saves it after `base`. */
  const readQuote = async (
    base: readonly Quote[],
    label: string,
    material: string,
    file: { readonly fileId?: string; readonly fileName?: string },
  ) => {
    const answer = await read({
      task: 'purchaseQuote',
      material,
      context: { lines: lineContext, today: todayIso() },
    });
    if (!answer.reading) throw new Error(answer.said || t('quotes.unreadable'));
    const quote = quoteFromReading(answer.reading, lineIds, file);
    // A quote whose supplier was not read keeps its file's name instead.
    return store([
      ...base,
      quote.vendorName ? quote : { ...quote, vendorName: label.slice(0, 200) },
    ]);
  };

  const addFiles = (picked: readonly File[]) => {
    const room = QUOTE_LIMIT - quotes.length - reading.length;
    const taken = picked.slice(0, Math.max(0, room));
    if (!taken.length) return;
    setFailure(picked.length > taken.length ? t('quotes.limit') : null);
    const started = taken.map((file) => ({
      key: crypto.randomUUID(),
      label: file.name,
      file,
    }));
    setReading((current) => [...current, ...started]);
    void (async () => {
      let last: ComparisonView | null = null;
      // One after another, each saved after those before it.
      let base = quotes;
      for (const entry of started) {
        try {
          const { record: uploaded } = await files
            .repository('itamAttachments')
            .uploadOne({ file: entry.file });
          const fileId = text(uploaded.id);
          // Kept with the order, as 解析单据 keeps what it reads.
          await api.request({
            path: `itam/attachments/purchaseOrders/${id}`,
            method: 'POST',
            json: { fileIds: [fileId] },
          });
          const { data } = await api.request<{
            data: { text: string | null };
          }>({
            path: `${PURCHASE_ORDERS_PATH}/${id}/document-text`,
            method: 'POST',
            json: { fileId },
          });
          if (!data.text)
            throw new Error(t('quotes.noText', { file: entry.label }));
          last = await readQuote(
            base,
            entry.label,
            `<document filename="${entry.label}">\n${data.text}\n</document>`,
            { fileId, fileName: entry.label },
          );
          base = last.quotes;
        } catch (error) {
          setFailure(`${entry.label}: ${errorMessage(error)}`);
        } finally {
          setReading((current) =>
            current.filter((item) => item.key !== entry.key),
          );
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ['itam', 'attachments'],
      });
      if (last) await recommend(last);
    })();
  };

  const addPasted = () => {
    const material = pasted.trim();
    if (!material || quotes.length + reading.length >= QUOTE_LIMIT) return;
    const entry = { key: crypto.randomUUID(), label: t('quotes.pastedLabel') };
    setReading((current) => [...current, entry]);
    setPasted('');
    setPasting(false);
    void (async () => {
      try {
        const next = await readQuote(quotes, entry.label, material, {});
        await recommend(next);
      } catch (error) {
        setFailure(errorMessage(error));
      } finally {
        setReading((current) =>
          current.filter((item) => item.key !== entry.key),
        );
      }
    })();
  };

  const remove = async (index: number) => {
    const next = quotes.filter((_quote, at) => at !== index);
    if (!next.length) return;
    setFailure(null);
    try {
      const stored = await store(next);
      await recommend(stored);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  /** Takes a quote: the order's vendor, and each priced line's unit price. */
  const take = async (index: number, vendorId: string) => {
    const quote = quotes[index];
    if (!quote) return;
    setTaking(index);
    setFailure(null);
    try {
      await api.request({
        path: `${PURCHASE_ORDERS_PATH}/${id}`,
        method: 'PATCH',
        json: { vendorId },
      });
      await api.request({
        path: `${PURCHASE_ORDERS_PATH}/${id}/lines`,
        method: 'PUT',
        json: {
          lines: lines.map((line) => {
            const priced = quote.lines.find(
              (entry) => entry.lineId === text(line.id),
            );
            const unitPrice =
              priced?.unitPrice ??
              (line.unitPrice === null || line.unitPrice === undefined
                ? null
                : Number(line.unitPrice));
            return {
              id: text(line.id),
              itemType: text(line.itemType),
              modelId: text(line.modelId) || null,
              softwareProductId: text(line.softwareProductId) || null,
              quantity: Number(line.quantity ?? 0),
              unitPrice,
            };
          }),
        },
      });
      const next = quotes.map((entry, at) =>
        at === index ? { ...entry, vendorId } : entry,
      );
      await store(next, {
        recommendation: view?.recommendation ?? null,
        chosenIndex: index,
      });
      setVendorPick(null);
      await queryClient.invalidateQueries({
        queryKey: ['itam', PURCHASE_ORDERS_PATH],
      });
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setTaking(null);
    }
  };

  /** Finds the quote's vendor among the vendors by name, else asks. */
  const choose = async (index: number) => {
    const quote = quotes[index];
    if (!quote) return;
    if (quote.vendorId) return take(index, quote.vendorId);
    const { data } = await api.request<{ data: ItamRecord[] }>({
      path: masterDataPath('vendors'),
      query: listQueryParams({ q: quote.vendorName, pageSize: 10 }),
    });
    const wanted = quote.vendorName.trim().toLowerCase();
    const match = data.find(
      (vendor) => text(vendor.name).trim().toLowerCase() === wanted,
    );
    if (match) return take(index, text(match.id));
    setVendorPick({ index, vendorId: null });
  };

  const recommendation = view?.recommendation;
  const busy = reading.length > 0 || recommending || taking !== null;
  const room = QUOTE_LIMIT - quotes.length - reading.length;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>{t('quotes.title')}</DialogTitle>
          <DialogDescription>
            {editable ? t('quotes.description') : t('quotes.readOnly')}
          </DialogDescription>
        </DialogHeader>

        {editable ? (
          <div className='flex flex-wrap items-center gap-2'>
            <input
              ref={fileRef}
              type='file'
              accept={DOCUMENT_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                const picked = [...(event.target.files ?? [])];
                event.target.value = '';
                addFiles(picked);
              }}
            />
            <Button
              variant='outline'
              disabled={room <= 0 || busy}
              onClick={() => fileRef.current?.click()}
            >
              <FilePlus2 data-icon='inline-start' />
              {t('quotes.addFiles')}
            </Button>
            <Button
              variant='ghost'
              disabled={room <= 0 || busy}
              onClick={() => setPasting((open) => !open)}
            >
              {t('quotes.paste')}
            </Button>
            <span className='text-xs text-muted-foreground'>
              {t('quotes.limitHint', { count: QUOTE_LIMIT })}
            </span>
          </div>
        ) : null}
        {pasting ? (
          <div className='space-y-2'>
            <Textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={t('quotes.pastePlaceholder')}
              rows={5}
              maxLength={20000}
            />
            <Button disabled={!pasted.trim() || busy} onClick={addPasted}>
              {t('quotes.read')}
            </Button>
          </div>
        ) : null}
        {reading.map((entry) => (
          <p
            key={entry.key}
            role='status'
            className='flex items-center gap-2 text-sm text-muted-foreground'
          >
            <Spinner />
            {t('quotes.reading', { file: entry.label })}
          </p>
        ))}
        {failure ? <p className='text-sm text-destructive'>{failure}</p> : null}

        {view && quotes.length ? (
          <ComparisonTable
            view={view}
            lineName={lineName}
            editable={editable}
            busy={busy}
            taking={taking}
            onTake={(index) => void choose(index)}
            onRemove={(index) => void remove(index)}
          />
        ) : !reading.length ? (
          <p className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
            {t('quotes.empty')}
          </p>
        ) : null}

        {vendorPick ? (
          <div className='flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm'>
            <span>
              {t('quotes.pickVendor', {
                vendor: quotes[vendorPick.index]?.vendorName ?? '',
              })}
            </span>
            <ReferenceSelect
              reference={{ collection: 'vendors' }}
              value={vendorPick.vendorId}
              onChange={(vendorId) =>
                setVendorPick((current) =>
                  current ? { ...current, vendorId } : current,
                )
              }
              className='w-64'
            />
            <Button
              disabled={!vendorPick.vendorId || taking !== null}
              onClick={() =>
                vendorPick.vendorId &&
                void take(vendorPick.index, vendorPick.vendorId)
              }
            >
              {t('quotes.take')}
            </Button>
          </div>
        ) : null}

        {recommending ? (
          <p
            role='status'
            className='flex items-center gap-2 text-sm text-muted-foreground'
          >
            <Spinner />
            {t('quotes.recommending')}
          </p>
        ) : recommendation && quotes.length >= 2 ? (
          <section className='space-y-2 rounded-lg border border-l-4 border-l-(--status-warning) bg-card p-4 text-sm'>
            <StatusBadge tone='warning' size='sm'>
              {recommendation.quoteIndex === null
                ? t('quotes.noneFits')
                : t('quotes.recommended', {
                    vendor: quotes[recommendation.quoteIndex]?.vendorName ?? '',
                  })}
            </StatusBadge>
            {recommendation.reasons.length ? (
              <ul className='list-disc space-y-0.5 pl-5'>
                {recommendation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            {recommendation.said ? (
              <p className='text-muted-foreground'>{recommendation.said}</p>
            ) : null}
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Rows: the order's lines; columns: the quotes; the lowest marked. */
function ComparisonTable({
  view,
  lineName,
  editable,
  busy,
  taking,
  onTake,
  onRemove,
}: {
  readonly view: ComparisonView;
  readonly lineName: (line: Readonly<Record<string, unknown>>) => string;
  readonly editable: boolean;
  readonly busy: boolean;
  readonly taking: number | null;
  readonly onTake: (index: number) => void;
  readonly onRemove: (index: number) => void;
}): ReactElement {
  const { t } = useTranslation();
  const money = (value: number | null | undefined, currency?: string | null) =>
    value === null || value === undefined
      ? '—'
      : formatMoney(value, currency ?? null);
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('quotes.item')}</TableHead>
            <TableHead className='text-right'>{t('quotes.quantity')}</TableHead>
            {view.prices ? (
              <TableHead className='text-right'>
                {t('quotes.lastPrice')}
              </TableHead>
            ) : null}
            {view.quotes.map((quote, index) => (
              <TableHead
                key={`${quote.vendorName}-${String(index)}`}
                className={cn(
                  'min-w-40 align-top',
                  view.chosenIndex === index && 'bg-accent',
                )}
              >
                <div className='flex items-start gap-1 py-1'>
                  <div className='min-w-0 flex-1 space-y-0.5'>
                    <div className='truncate font-medium text-foreground'>
                      {quote.vendorName}
                    </div>
                    <div className='text-xs font-normal text-muted-foreground'>
                      {[
                        quote.deliveryDays !== null &&
                        quote.deliveryDays !== undefined
                          ? t('quotes.deliveryDays', {
                              count: quote.deliveryDays,
                            })
                          : quote.deliveryDate
                            ? t('quotes.deliveryDate', {
                                date: quote.deliveryDate,
                              })
                            : null,
                        quote.warranty
                          ? t('quotes.warranty', { text: quote.warranty })
                          : null,
                        quote.validUntil
                          ? t('quotes.validUntil', { date: quote.validUntil })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {editable && view.quotes.length > 1 ? (
                    <Button
                      size='icon-xs'
                      variant='ghost'
                      aria-label={t('quotes.remove')}
                      disabled={busy}
                      onClick={() => onRemove(index)}
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rows.map((row) => (
            <TableRow key={row.lineId}>
              <TableCell className='font-medium'>
                {lineName({
                  modelId: row.modelId,
                  softwareProductId: row.softwareProductId,
                })}
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                {row.quantity}
              </TableCell>
              {view.prices ? (
                <TableCell className='text-right text-muted-foreground tabular-nums'>
                  {row.lastPrice
                    ? money(row.lastPrice.unitPrice)
                    : t('quotes.noLastPrice')}
                </TableCell>
              ) : null}
              {row.cells.map((cell, index) => (
                <TableCell
                  key={`${row.lineId}-${String(index)}`}
                  className={cn(
                    'tabular-nums',
                    view.chosenIndex === index && 'bg-accent/50',
                  )}
                >
                  {cell ? (
                    <span
                      className={cn(
                        row.lowest === index &&
                          'font-semibold text-(--status-success)',
                      )}
                    >
                      {view.prices
                        ? money(cell.unitPrice, view.quotes[index]?.currency)
                        : t('quotes.priced')}
                      {cell.quantity !== null && cell.quantity !== row.quantity
                        ? ` × ${String(cell.quantity)}`
                        : ''}
                    </span>
                  ) : (
                    <span className='text-destructive'>
                      {t('quotes.notQuoted')}
                    </span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={view.prices ? 3 : 2}>
              {t('quotes.total')}
            </TableCell>
            {view.totals.map((total, index) => (
              <TableCell
                key={`total-${String(index)}`}
                className={cn(
                  'space-y-1 align-top',
                  view.chosenIndex === index && 'bg-accent',
                )}
              >
                {view.prices ? (
                  <div className='font-semibold tabular-nums'>
                    {money(total.amount, view.quotes[index]?.currency)}
                  </div>
                ) : null}
                <div className='text-xs font-normal text-muted-foreground'>
                  {[
                    total.missing
                      ? t('quotes.missing', { count: total.missing })
                      : null,
                    total.extras
                      ? t('quotes.extras', { count: total.extras })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {view.chosenIndex === index ? (
                  <StatusBadge tone='success' size='sm'>
                    {t('quotes.taken')}
                  </StatusBadge>
                ) : editable ? (
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => onTake(index)}
                  >
                    {taking === index ? <Spinner /> : null}
                    {t('quotes.take')}
                  </Button>
                ) : null}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
