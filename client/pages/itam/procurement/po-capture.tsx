import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { CaptureFailure } from '@/components/itam/ai/capture-failure';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import { QuickCreateDialog } from '@/components/itam/quick-create-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { listQueryParams, useApi, type ListResponse } from '@/lib/itam/api';
import { errorMessage, formatMoney, text } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import {
  pickerSearches,
  type PurchaseCapture,
} from '@/lib/itam/purchase-capture';
import { referencePath } from '@/lib/itam/references';
import { DOCUMENT_ACCEPT } from '@/lib/itam/receipt';
import type { PurchaseOrderCaptureState } from '@/lib/itam/use-purchase-capture';

/** The AI 整理 tab: the material, and the button that organises it. */
export function CapturePane({
  capture,
  pasted,
  onPasted,
  file,
  onFile,
}: {
  readonly capture: PurchaseOrderCaptureState;
  readonly pasted: string;
  readonly onPasted: (value: string) => void;
  readonly file: File | undefined;
  readonly onFile: (file: File | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = capture.busy;
  const ready = Boolean(pasted.trim() || file);
  const go = () => {
    if (ready && !busy) capture.organise(pasted, file);
  };
  return (
    <div className='grid gap-2'>
      <Textarea
        autoFocus
        value={pasted}
        disabled={busy}
        maxLength={20000}
        className='max-h-[45svh] min-h-40'
        placeholder={t('procurement.capture.placeholder')}
        aria-label={t('procurement.capture.material')}
        onChange={(event) => onPasted(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            go();
          }
        }}
      />
      <input
        ref={inputRef}
        type='file'
        accept={DOCUMENT_ACCEPT}
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = '';
          if (chosen) onFile(chosen);
        }}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          {file ? (
            <span className='inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm'>
              <FileText className='size-4 shrink-0 text-muted-foreground' />
              <span className='min-w-0 truncate'>{file.name}</span>
              <button
                type='button'
                className='rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
                aria-label={t('procurement.capture.removeFile')}
                disabled={busy}
                onClick={() => onFile(undefined)}
              >
                <X className='size-3.5' />
              </button>
            </span>
          ) : (
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload data-icon='inline-start' />
              {t('procurement.capture.upload')}
            </Button>
          )}
          <span className='text-xs text-muted-foreground'>
            {t('procurement.capture.hint')}
          </span>
        </div>
        {/* Blue like every AI entry (AiShortcut's colour), filled because
            it is this tab's one action. */}
        <Button
          type='button'
          className='bg-primary text-primary-foreground hover:bg-primary/90'
          disabled={busy || !ready}
          onClick={go}
        >
          {busy ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <Sparkles data-icon='inline-start' />
          )}
          {t(
            capture.phase === 'uploading'
              ? 'procurement.capture.uploading'
              : busy
                ? 'procurement.capture.organising'
                : 'procurement.capture.organise',
          )}
        </Button>
      </div>
      {capture.failure && capture.mode === 'organise' ? (
        <CaptureFailure
          text={capture.failure}
          answered={capture.failureAnswered}
        />
      ) : null}
    </div>
  );
}

/**
 * Above the form once AI 整理 filled it: what the assistant said, what it
 * could not place, and where to tell it what to change.
 */
export function CaptureNotice({
  capture,
  result,
  currency,
  priced,
  onPlace,
}: {
  readonly capture: PurchaseOrderCaptureState;
  readonly result: PurchaseCapture;
  /** An unmatched line the reader picked or created a record for. */
  readonly onPlace: UnmatchedPickerProps['onPlace'];
  readonly currency: string | null;
  readonly priced: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const busy = capture.busy;
  const adjusting = busy && capture.mode === 'adjust';
  const send = () => {
    if (!instruction.trim() || busy) return;
    capture.adjust(instruction);
    setInstruction('');
  };
  return (
    <div className='grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
      <p className='flex gap-2'>
        <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
        <span className='min-w-0'>
          {capture.summary ? (
            <CollapsibleText text={capture.summary} chars={200} lines={3} />
          ) : (
            t('procurement.capture.filled')
          )}
        </span>
      </p>
      {result.unmatched.length > 0 ? (
        <div className='grid gap-1.5 pl-6'>
          <p className='text-warning-foreground'>
            {t('procurement.capture.unmatched', {
              count: result.unmatched.length,
            })}
          </p>
          <ul className='grid gap-2'>
            {result.unmatched.map((line) => (
              <li
                key={line.key ?? line.description}
                className='grid gap-1 rounded-md border border-border bg-background p-2'
              >
                <span className='text-muted-foreground wrap-anywhere'>
                  {line.description}
                  {line.partCode && line.partCode !== line.description
                    ? ` (${line.partCode})`
                    : ''}
                  {` × ${line.quantity}`}
                  {priced && line.unitPrice !== null
                    ? ` · ${formatMoney(line.unitPrice, currency)}`
                    : ''}
                </span>
                <UnmatchedPicker line={line} onPlace={onPlace} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className='grid gap-2 border-t border-border pt-2'>
        {capture.turns.map((turn) =>
          turn.from === 'user' ? (
            <p
              key={turn.id}
              className='ml-auto max-w-[90%] rounded-lg bg-background px-3 py-1.5 whitespace-pre-wrap'
            >
              {turn.text}
            </p>
          ) : (
            <p
              key={turn.id}
              className='flex max-w-[90%] gap-1.5 text-muted-foreground'
            >
              <span className='flex h-[1lh] shrink-0 items-center'>
                <Sparkles className='size-3.5 text-primary' />
              </span>
              <span className='min-w-0'>
                <CollapsibleText text={turn.text} chars={200} lines={3} />
              </span>
            </p>
          ),
        )}
        {capture.failure && capture.mode === 'adjust' ? (
          <CaptureFailure
            text={capture.failure}
            answered={capture.failureAnswered}
            inline
          />
        ) : null}
        {/* Stacked: the column beside the form is too narrow for the
            request and its button on one line. */}
        <div className='grid gap-2'>
          <Textarea
            value={instruction}
            disabled={busy}
            maxLength={1000}
            className='bg-background'
            placeholder={t('capture.adjustPlaceholder')}
            aria-label={t('procurement.capture.adjust')}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
          />
          <Button
            type='button'
            className='justify-self-end'
            disabled={busy || !instruction.trim()}
            onClick={send}
          >
            {adjusting ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <Sparkles data-icon='inline-start' />
            )}
            {t(
              adjusting
                ? 'procurement.capture.adjusting'
                : 'procurement.capture.adjust',
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

type Unmatched = PurchaseCapture['unmatched'][number];

interface UnmatchedPickerProps {
  readonly line: Unmatched;
  readonly onPlace: (
    line: Unmatched,
    pick: { readonly modelId: string } | { readonly softwareProductId: string },
  ) => Promise<void>;
}

/**
 * Places a line AI 整理 could not: pick the record it is — the search starts
 * at the document's own wording without its configuration, since a
 * different spelling of the same model is the common case — or, for whoever
 * may create one, 新建 it from the same list, starting at that name and part
 * code. Either way the line moves
 * into the order's lines.
 */
function UnmatchedPicker({
  line,
  onPlace,
}: UnmatchedPickerProps): ReactElement {
  const { t } = useTranslation();
  const software =
    line.itemType === 'perpetual' || line.itemType === 'subscription';
  const collection = software ? 'softwareProducts' : 'models';
  const mayCreate = useCollectionPermissions(collection, ['create']).create;
  const [creating, setCreating] = useState<string>();
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string>();
  // The first of the searches that finds something is what the picker
  // opens on, so it does not open on an empty list.
  const api = useApi();
  const searches = pickerSearches(line.description, line.partCode);
  const start = useQuery({
    queryKey: ['itam', referencePath(collection), 'picker-start', searches],
    queryFn: async () => {
      for (const q of searches) {
        const found = await api.request<ListResponse>({
          path: referencePath(collection),
          query: listQueryParams({ q, pageSize: 1 }),
        });
        if (found.total > 0) return q;
      }
      return searches[0] ?? '';
    },
  });
  const place = (id: string) => {
    setPlacing(true);
    setFailure(undefined);
    onPlace(line, software ? { softwareProductId: id } : { modelId: id })
      .catch((error: unknown) => setFailure(errorMessage(error)))
      .finally(() => setPlacing(false));
  };
  return (
    <>
      <ReferenceSelect
        // Opened afresh on the search found, should it arrive after mount.
        key={start.data ?? ''}
        reference={{ collection }}
        value={null}
        disabled={placing}
        initialSearch={start.data ?? searches[0]}
        placeholder={t(
          software ? 'procurement.selectProduct' : 'procurement.selectModel',
        )}
        onChange={(id) => {
          if (id) place(id);
        }}
        onCreate={mayCreate ? (name) => setCreating(name) : undefined}
        createLabel={t(software ? 'softwareProducts.new' : 'models.new')}
      />
      {failure ? <p className='text-xs text-destructive'>{failure}</p> : null}
      <QuickCreateDialog
        collection={collection}
        open={creating !== undefined}
        onOpenChange={(open) => {
          if (!open) setCreating(undefined);
        }}
        initial={{
          name: creating || line.description,
          ...(software || !line.partCode ? {} : { code: line.partCode }),
        }}
        onCreated={(record) => place(text(record.id))}
      />
    </>
  );
}
