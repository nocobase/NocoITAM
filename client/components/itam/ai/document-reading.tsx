import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { FileCheck, FileText, Sparkles, Upload, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';

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
  actionLabel = 'documentReading.read',
  workingLabel = 'documentReading.reading',
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
  /**
   * What the button says it does, and says while doing it, as translation
   * keys: 记录报价's reading also weighs the quote (评估修还是换).
   */
  readonly actionLabel?: string;
  readonly workingLabel?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const read = useAiReading();
  const api = useApi();
  const files = useService(clientFileRepositoryManagerToken);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  // Several documents may go together (2026-10-23): a quote and the
  // inspection report it rests on are read as one.
  const [chosen, setChosen] = useState<readonly File[]>([]);
  // Documents already on the record and read: their text goes with every
  // later go, never into the box, which holds only what the person typed.
  const [loaded, setLoaded] = useState<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly text: string;
    }[]
  >([]);
  // A file dragged over the box (2026-10-23): dropped, it is taken as if
  // chosen with 上传单据.
  const [dragging, setDragging] = useState(false);
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
  const ready = Boolean(pasted.trim() || chosen.length || loaded.length);

  const go = async () => {
    if (!ready || busy) return;
    setFailure(undefined);
    setResult(undefined);
    try {
      let readDocs: typeof loaded = loaded;
      if (chosen.length) {
        setPhase('uploading');
        const uploaded: { id: string; name: string }[] = [];
        for (const file of chosen) {
          const { record } = await files
            .repository('itamAttachments')
            .uploadOne({ file });
          uploaded.push({ id: text(record.id), name: file.name });
        }
        // Kept with the record, as 解析单据 keeps what it reads.
        await api.request({
          path: `itam/attachments/${ownerType}/${ownerId}`,
          method: 'POST',
          json: { fileIds: uploaded.map((file) => file.id) },
        });
        void queryClient.invalidateQueries({
          queryKey: ['itam', 'attachments', ownerType, ownerId],
        });
        // Read once: the files are on the record now, so a second go reads
        // their text rather than uploading them again.
        setChosen([]);
        const unreadable: string[] = [];
        const documents: { id: string; name: string; text: string }[] = [];
        for (const file of uploaded) {
          const { data } = await api.request<{
            data: { text: string | null };
          }>({
            path: `itam/attachments/${ownerType}/${ownerId}/document-text`,
            method: 'POST',
            json: { fileId: file.id },
          });
          if (data.text) documents.push({ ...file, text: data.text });
          else unreadable.push(file.name);
        }
        readDocs = [...loaded, ...documents];
        setLoaded(readDocs);
        if (unreadable.length) {
          setFailure({
            text: t('documentReading.noText', {
              file: unreadable.join(t('documentReading.separator')),
            }),
            answered: false,
          });
          // What could be read is still read; nothing at all stops here.
          if (!pasted.trim() && !readDocs.length) return;
        }
      }
      const material = [
        pasted.trim(),
        ...readDocs.map(
          (document) =>
            `<document filename="${document.name}">\n${document.text}\n</document>`,
        ),
      ]
        .filter(Boolean)
        .join('\n\n');
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

  /** Adds what was chosen or dropped; a format no reader takes is named. */
  const take = (picked: readonly File[]) => {
    const refused = picked.filter((one) => !accepted(one));
    const taken = picked.filter(accepted);
    setFailure(
      refused.length
        ? {
            text: t('documentReading.unsupported', {
              file: refused
                .map((one) => one.name)
                .join(t('documentReading.separator')),
            }),
            answered: false,
          }
        : undefined,
    );
    if (taken.length)
      setChosen((current) => [
        ...current,
        ...taken.filter(
          (one) =>
            !current.some(
              (had) => had.name === one.name && had.size === one.size,
            ),
        ),
      ]);
  };

  const accepted = (dropped: File) =>
    DOCUMENT_ACCEPT.split(',').some((ext) =>
      dropped.name.toLowerCase().endsWith(ext),
    );
  return (
    <div
      className={cn(
        // One column no wider than the dialog, so a long file name
        // shortens instead of widening it.
        'relative grid grid-cols-[minmax(0,1fr)] gap-2',
        !bare && 'rounded-lg border border-border bg-muted/30 p-3',
        dragging && 'rounded-lg ring-2 ring-primary ring-offset-2',
      )}
      onDragOver={(event) => {
        if (busy || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Leaving for a child is still inside the box.
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setDragging(false);
      }}
      onDrop={(event) => {
        setDragging(false);
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        take([...event.dataTransfer.files]);
      }}
    >
      {dragging ? (
        <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/85 text-sm font-medium text-primary'>
          {t('documentReading.dropHere')}
        </div>
      ) : null}
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
        multiple
        hidden
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = '';
          take(picked);
        }}
      />
      {/* The chosen files on lines of their own, above the actions, which
          stay where they are whether or not any is chosen (2026-10-23). */}
      {chosen.length || loaded.length ? (
        <div className='flex min-w-0 flex-wrap gap-1.5'>
          {/* Read already: on the record, and read again with the next go. */}
          {loaded.map((document) => (
            <span
              key={document.id}
              className='inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm'
              title={document.name}
            >
              <FileCheck className='size-4 shrink-0 text-primary' />
              <span className='min-w-0 truncate'>{document.name}</span>
              <button
                type='button'
                className='rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
                aria-label={t('documentReading.removeFile')}
                disabled={busy}
                onClick={() =>
                  setLoaded((current) =>
                    current.filter((one) => one.id !== document.id),
                  )
                }
              >
                <X className='size-3.5' />
              </button>
            </span>
          ))}
          {chosen.map((file) => (
            <span
              key={`${file.name}:${file.size}`}
              className='inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm'
              title={file.name}
            >
              <FileText className='size-4 shrink-0 text-muted-foreground' />
              <span className='min-w-0 truncate'>{file.name}</span>
              <button
                type='button'
                className='rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
                aria-label={t('documentReading.removeFile')}
                disabled={busy}
                onClick={() =>
                  setChosen((current) => current.filter((one) => one !== file))
                }
              >
                <X className='size-3.5' />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className='flex min-w-0 items-center gap-2'>
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
        {/* Blue like every AI entry, filled because it is this box's one
            action. */}
        <Button
          type='button'
          size={bare ? 'default' : 'sm'}
          className='ml-auto shrink-0 bg-primary text-primary-foreground hover:bg-primary/90'
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
                ? workingLabel
                : actionLabel,
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
