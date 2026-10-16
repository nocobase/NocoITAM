import { useTranslation } from '@nocobase/i18n/client';
import {
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createElement,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { formatDate } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

/**
 * A file as the attachment lists and the comments show it (2026-10-16, after
 * NocoCRM's comment-files.tsx: one look for a record's attachments and a
 * comment's files alike).
 */
export interface FileCard {
  readonly id: string;
  readonly filename: string;
  readonly mimeType?: string | null;
  readonly size?: string | number | null;
  /** Where it downloads from; a row without one offers no download. */
  readonly url?: string | null;
  /** When it came, read at the row's end. */
  readonly date?: string | null;
}

// What a file is, by its extension and stored type: its icon and the tint
// of the icon's tile — the theme's status colours, the only ones that carry
// a hue in this monochrome theme.
const KINDS: readonly {
  readonly test: (ext: string, type: string) => boolean;
  readonly icon: LucideIcon;
  readonly tone: string;
}[] = [
  {
    test: (ext) => ext === 'pdf',
    icon: FileText,
    tone: 'bg-destructive/10 text-destructive',
  },
  {
    test: (ext) => ['doc', 'docx', 'rtf', 'odt', 'pages'].includes(ext),
    icon: FileText,
    tone: 'bg-info text-info-foreground',
  },
  {
    test: (ext) => ['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext),
    icon: FileSpreadsheet,
    tone: 'bg-success text-success-foreground',
  },
  {
    test: (ext) => ['ppt', 'pptx', 'odp', 'key'].includes(ext),
    icon: Presentation,
    tone: 'bg-warning text-warning-foreground',
  },
  {
    test: (ext, type) =>
      type.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(ext),
    icon: FileImage,
    tone: 'bg-muted text-muted-foreground',
  },
  {
    test: (_ext, type) => type.startsWith('video/'),
    icon: FileVideo,
    tone: 'bg-muted text-muted-foreground',
  },
  {
    test: (_ext, type) => type.startsWith('audio/'),
    icon: FileMusic,
    tone: 'bg-muted text-muted-foreground',
  },
  {
    test: (ext) => ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext),
    icon: FileArchive,
    tone: 'bg-muted text-muted-foreground',
  },
];

function kindOf(file: FileCard): { icon: LucideIcon; tone: string } {
  const dot = file.filename.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.filename.slice(dot + 1).toLowerCase();
  return (
    KINDS.find((kind) => kind.test(ext, file.mimeType ?? '')) ?? {
      icon: FileIcon,
      tone: 'bg-muted text-muted-foreground',
    }
  );
}

/** A size as people read it: 820 KB, 1.4 MB. */
function fileSize(value: string | number | null | undefined): string {
  const bytes = Number(value);
  if (!value || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KindTile({
  file,
  small = false,
}: {
  readonly file: FileCard;
  readonly small?: boolean;
}): ReactElement {
  const { icon, tone } = kindOf(file);
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded',
        small ? 'size-6' : 'size-7',
        tone,
      )}
    >
      {createElement(icon, {
        className: small ? 'size-3.5' : 'size-4',
        'aria-hidden': true,
      })}
    </span>
  );
}

/**
 * Files one a row across the width: its kind's tile, its name and size, and
 * at its end where it came from and when, then download and remove. The row
 * opens the file (`onOpen`, else its link in a new tab).
 */
export function FileRows({
  files,
  onOpen,
  onRemove,
  detail,
  className,
}: {
  readonly files: readonly FileCard[];
  readonly onOpen?: (file: FileCard, index: number) => void;
  readonly onRemove?: (file: FileCard) => void;
  /** Said at the row's end before the date: who added it, where from. */
  readonly detail?: (file: FileCard) => ReactNode;
  readonly className?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <div className={cn('grid gap-1.5', className)}>
      {files.map((file, index) => {
        const name = (
          <>
            <KindTile file={file} />
            <span className='flex min-w-0 flex-1 items-baseline gap-2'>
              <span className='truncate text-sm font-medium'>
                {file.filename}
              </span>
              <span className='shrink-0 text-xs text-muted-foreground'>
                {fileSize(file.size)}
              </span>
            </span>
            <span className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
              {detail ? (
                <span className='max-w-40 truncate'>{detail(file)}</span>
              ) : null}
              {file.date ? (
                <span className='tabular-nums'>{formatDate(file.date)}</span>
              ) : null}
            </span>
          </>
        );
        const body =
          'flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left';
        return (
          <div
            key={file.id}
            className='flex min-w-0 items-center rounded-lg border border-border bg-card pr-1.5 shadow-xs transition-colors hover:bg-muted/40'
          >
            {onOpen ? (
              <button
                type='button'
                className={body}
                aria-label={`${t('attachments.preview')}: ${file.filename}`}
                onClick={() => onOpen(file, index)}
              >
                {name}
              </button>
            ) : (
              <a
                className={body}
                href={file.url ?? undefined}
                target='_blank'
                rel='noreferrer'
              >
                {name}
              </a>
            )}
            {file.url ? (
              <a
                className='inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground'
                href={file.url}
                download={file.filename}
                aria-label={`${t('attachments.download')}: ${file.filename}`}
                title={t('attachments.download')}
              >
                <Download className='size-3.5' aria-hidden='true' />
              </a>
            ) : null}
            {onRemove ? (
              <button
                type='button'
                className='inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                aria-label={`${t('actions.delete')}: ${file.filename}`}
                title={t('actions.delete')}
                onClick={() => onRemove(file)}
              >
                <Trash2 className='size-3.5' aria-hidden='true' />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Files as small cards, for a box they are about to be sent with: the kind's
 * tile, the name and the size, and a remove button on hover at the corner.
 */
export function FileChips({
  files,
  onRemove,
  className,
}: {
  readonly files: readonly FileCard[];
  readonly onRemove?: (file: FileCard) => void;
  readonly className?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!files.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file) => (
        <li key={file.id} className='group/file relative max-w-full min-w-0'>
          <span className='flex h-8 max-w-72 min-w-0 items-center gap-2 rounded-md border border-border bg-card pr-2.5 pl-1 shadow-xs'>
            <KindTile file={file} small />
            <span className='flex min-w-0 items-baseline gap-1.5'>
              <span className='truncate text-xs font-medium'>
                {file.filename}
              </span>
              <span className='shrink-0 text-[0.6875rem] text-muted-foreground'>
                {fileSize(file.size)}
              </span>
            </span>
          </span>
          {onRemove ? (
            <button
              type='button'
              className='absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs group-focus-within/file:flex group-hover/file:flex hover:text-foreground [@media(hover:none)]:flex'
              aria-label={`${t('comments.removeFile')}: ${file.filename}`}
              onClick={() => onRemove(file)}
            >
              <X className='size-3' aria-hidden='true' />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Where files are added: drag them onto it or click it to pick them (after
 * NocoCRM's FileDropZone). One line, dashed, lit while files are over it;
 * what to do with the files is its owner's.
 */
export function FileDropZone({
  busy,
  onFiles,
}: {
  readonly busy: boolean;
  readonly onFiles: (files: File[]) => void;
}): ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  // Entering a child fires a leave on the zone first, so enters are counted.
  const [depth, setDepth] = useState(0);
  const pick = () => {
    if (!busy) inputRef.current?.click();
  };
  return (
    <div
      role='button'
      tabIndex={busy ? -1 : 0}
      aria-disabled={busy}
      aria-label={t('attachments.upload')}
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-md border border-dashed px-3 py-3 text-sm transition-colors',
        depth > 0
          ? 'border-ring bg-muted/60 text-foreground'
          : 'border-border text-muted-foreground hover:border-ring/60 hover:bg-muted/40',
        busy ? 'cursor-progress opacity-60' : 'cursor-pointer',
      )}
      onClick={pick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((n) => n + 1);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
      }}
      onDragLeave={() => setDepth((n) => Math.max(0, n - 1))}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        if (!busy) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <Upload className='size-4 shrink-0' aria-hidden='true' />
      <span>
        {busy ? t('attachments.uploadingFiles') : t('attachments.dropFiles')}
      </span>
      {busy ? null : (
        <span className='font-medium text-foreground underline-offset-4 hover:underline'>
          {t('attachments.chooseFiles')}
        </span>
      )}
      <input
        ref={inputRef}
        type='file'
        multiple
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // Without this, picking the same file again fires no change.
          event.target.value = '';
        }}
      />
    </div>
  );
}
