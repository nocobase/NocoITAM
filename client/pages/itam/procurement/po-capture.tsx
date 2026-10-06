import { useTranslation } from '@nocobase/i18n/client';
import { FileText, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney } from '@/lib/itam/format';
import type { PurchaseCapture } from '@/lib/itam/purchase-capture';
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
              size='sm'
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
        {/* Green like every AI entry (AiShortcut's colour), filled because
            it is this tab's one action. */}
        <Button
          type='button'
          size='sm'
          className='bg-success-foreground text-background hover:bg-success-foreground/90'
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
        <p className='text-sm text-destructive'>
          <CollapsibleText text={capture.failure} chars={160} lines={3} />
        </p>
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
  reviewing,
  currency,
  priced,
}: {
  readonly capture: PurchaseOrderCaptureState;
  readonly result: PurchaseCapture;
  /** Something on the form still carries 请核对. */
  readonly reviewing: boolean;
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
        <Sparkles className='mt-0.5 size-4 shrink-0 text-success-foreground' />
        <span className='min-w-0'>
          {capture.summary ? (
            <CollapsibleText text={capture.summary} chars={200} lines={3} />
          ) : (
            t('procurement.capture.filled')
          )}
        </span>
      </p>
      {reviewing ? (
        <p className='pl-6 text-xs text-muted-foreground'>
          {t('procurement.capture.reviewHint')}
        </p>
      ) : null}
      {result.vendorName ? (
        <p className='text-warning-foreground'>
          {t('procurement.capture.vendorNotFound', { name: result.vendorName })}
        </p>
      ) : null}
      {result.departmentName ? (
        <p className='text-warning-foreground'>
          {t('procurement.capture.departmentNotFound', {
            name: result.departmentName,
          })}
        </p>
      ) : null}
      {result.unmatched.length > 0 ? (
        <div className='grid gap-1'>
          <p className='text-warning-foreground'>
            {t('procurement.capture.unmatched', {
              count: result.unmatched.length,
            })}
          </p>
          <ul className='grid gap-0.5 pl-6 text-muted-foreground'>
            {result.unmatched.map((line, index) => (
              // The list is the one reading, never reordered or edited.
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <li key={index} className='list-disc wrap-anywhere'>
                {line.description}
                {line.partCode && line.partCode !== line.description
                  ? ` (${line.partCode})`
                  : ''}
                {` × ${line.quantity}`}
                {priced && line.unitPrice !== null
                  ? ` · ${formatMoney(line.unitPrice, currency)}`
                  : ''}
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
                <Sparkles className='size-3.5 text-success-foreground' />
              </span>
              <span className='min-w-0'>
                <CollapsibleText text={turn.text} chars={200} lines={3} />
              </span>
            </p>
          ),
        )}
        {capture.failure && capture.mode === 'adjust' ? (
          <p className='text-destructive'>
            <CollapsibleText text={capture.failure} chars={160} lines={3} />
          </p>
        ) : null}
        {/* Stacked: the column beside the form is too narrow for the
            request and its button on one line. */}
        <div className='grid gap-2'>
          <Input
            value={instruction}
            disabled={busy}
            maxLength={1000}
            className='bg-background'
            placeholder={t('procurement.capture.adjustPlaceholder')}
            aria-label={t('procurement.capture.adjust')}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          <Button
            type='button'
            size='sm'
            variant='outline'
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
