import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Sparkles, Upload, X } from 'lucide-react';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import { CaptureFailure } from '@/components/itam/ai/capture-failure';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { AiReadingTask } from '@/lib/itam/ai';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import { useApi } from '@/lib/itam/api';
import { errorMessage, text } from '@/lib/itam/format';
import { DOCUMENT_ACCEPT } from '@/lib/itam/receipt';

/**
 * A document read into the dialog it opens in (2026-10-23): a repair's
 * report into its completion, a disposal's certificate into its execution.
 * The person pastes the text or uploads the file; an uploaded file is kept
 * on the record's attachments, read as text on the server and handed to
 * the model with the record (`POST /itam/ai/read`). The dialog fills its
 * own fields from the reading — `onRead` — and may return what it found
 * against the register (a serial that does not match) to show beside what
 * the model said. Nothing is saved until the person confirms the dialog.
 */
export function DocumentReading({
  ownerType,
  ownerId,
  task,
  context,
  placeholder,
  onRead,
  bare = false,
}: {
  readonly ownerType: 'repairs' | 'disposals';
  readonly ownerId: string;
  readonly task: AiReadingTask;
  readonly context: Readonly<Record<string, unknown>>;
  readonly placeholder: string;
  readonly onRead: (reading: Record<string, unknown>) => ReactNode;
  /**
   * The whole of a tab (记录报价's AI 整理, 2026-10-23) rather than a box
   * above a form: no frame of its own, and the room PO 整理 gives.
   */
  readonly bare?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const read = useAiReading();
  const api = useApi();
  const files = useService(clientFileRepositoryManagerToken);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<File>();
  const [phase, setPhase] = useState<'uploading' | 'reading'>();
  const [result, setResult] = useState<{
    readonly said: string;
    readonly checks: ReactNode;
  }>();
  const [failure, setFailure] = useState<{
    readonly text: string;
    readonly answered: boolean;
  }>();
  if (!ai.available) return null;
  const busy = phase !== undefined;
  const ready = Boolean(pasted.trim() || file);

  const go = async () => {
    if (!ready || busy) return;
    setFailure(undefined);
    setResult(undefined);
    try {
      let material = pasted.trim();
      if (file) {
        setPhase('uploading');
        const { record: uploaded } = await files
          .repository('itamAttachments')
          .uploadOne({ file });
        const fileId = text(uploaded.id);
        // Kept with the record, as 解析单据 keeps what it reads.
        await api.request({
          path: `itam/attachments/${ownerType}/${ownerId}`,
          method: 'POST',
          json: { fileIds: [fileId] },
        });
        void queryClient.invalidateQueries({
          queryKey: ['itam', 'attachments', ownerType, ownerId],
        });
        // Read once: the file is on the record now, so a second go reads
        // the text rather than uploading it again.
        setFile(undefined);
        const { data } = await api.request<{
          data: { text: string | null };
        }>({
          path: `itam/attachments/${ownerType}/${ownerId}/document-text`,
          method: 'POST',
          json: { fileId },
        });
        if (!data.text) {
          setFailure({
            text: t('documentReading.noText', { file: file.name }),
            answered: false,
          });
          return;
        }
        const document = `<document filename="${file.name}">\n${data.text}\n</document>`;
        material = material ? `${material}\n\n${document}` : document;
        setPasted(material);
      }
      setPhase('reading');
      const answer = await read({ task, material, context });
      if (!answer.reading) {
        setFailure({
          text: answer.said || t('documentReading.nothing'),
          answered: true,
        });
        return;
      }
      setResult({ said: answer.said, checks: onRead(answer.reading) });
    } catch (caught) {
      setFailure({ text: errorMessage(caught), answered: false });
    } finally {
      setPhase(undefined);
    }
  };

  return (
    <div
      className={
        bare
          ? 'grid gap-2'
          : 'grid gap-2 rounded-lg border border-border bg-muted/30 p-3'
      }
    >
      <Textarea
        value={pasted}
        disabled={busy}
        rows={3}
        maxLength={40000}
        autoFocus={bare}
        className={
          bare
            ? 'max-h-[45svh] min-h-40'
            : 'max-h-[30svh] min-h-20 bg-background'
        }
        placeholder={placeholder}
        aria-label={t('documentReading.material')}
        onChange={(event) => setPasted(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void go();
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
          if (chosen) setFile(chosen);
        }}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {file ? (
          <span className='inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm'>
            <FileText className='size-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0 truncate'>{file.name}</span>
            <button
              type='button'
              className='rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
              aria-label={t('documentReading.removeFile')}
              disabled={busy}
              onClick={() => setFile(undefined)}
            >
              <X className='size-3.5' />
            </button>
          </span>
        ) : (
          <Button
            type='button'
            variant='outline'
            size={bare ? 'default' : 'sm'}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload data-icon='inline-start' />
            {t('documentReading.upload')}
          </Button>
        )}
        {/* Blue like every AI entry, filled because it is this box's one
            action. */}
        <Button
          type='button'
          size={bare ? 'default' : 'sm'}
          className='bg-primary text-primary-foreground hover:bg-primary/90'
          disabled={busy || !ready}
          onClick={() => void go()}
        >
          {busy ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <Sparkles data-icon='inline-start' />
          )}
          {t(
            phase === 'uploading'
              ? 'documentReading.uploading'
              : phase === 'reading'
                ? 'documentReading.reading'
                : 'documentReading.read',
          )}
        </Button>
      </div>
      {failure ? (
        <CaptureFailure text={failure.text} answered={failure.answered} />
      ) : null}
      {result ? (
        <div className='space-y-1 text-sm'>
          {result.checks}
          {result.said ? (
            <p className='flex gap-2 text-muted-foreground'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
              {result.said}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
