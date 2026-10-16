import { resolveAppUrl, useService } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Trash2,
} from 'lucide-react';
import {
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { FileChips, FileRows } from '@/components/itam/file-cards';
import { useApi } from '@/lib/itam/api';
import { useFileDrag } from '@/lib/itam/file-drag';
import {
  errorMessage,
  formatDate,
  relativeTime,
  text,
} from '@/lib/itam/format';
import { cn } from '@/lib/utils';

import { COLLAPSE_CHARS, COLLAPSE_LINES } from '../collapsible-text.js';
import { ConfirmDialog } from '../confirm-dialog.js';
import {
  initials,
  mentionsIn,
  withMentions,
  type Colleague,
} from './colleagues.js';
import { MentionTextarea } from './mention-textarea.js';

/** A comment or a reply as the timeline hands it over (`comments.ts`). */
export interface CommentEvent {
  readonly id: string;
  readonly actorId: string | null;
  readonly createdAt: string;
  readonly payload: Readonly<Record<string, unknown>> | null;
}

interface CommentFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  /** Known for a file uploaded in this box; a posted one may not say. */
  readonly size?: string | number | null;
  readonly mimeType?: string | null;
}

const fileUrl = (file: CommentFile): string =>
  resolveAppUrl(
    `/uploads/itam/${encodeURIComponent(file.id)}${file.ext ? `.${encodeURIComponent(file.ext)}` : ''}`,
  );

/** Where comments are written, and who may be named in them. */
export interface CommentScope {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly colleagues: readonly Colleague[];
  /** Everybody whose name a comment may show, the writer included. */
  readonly people: readonly Colleague[];
  readonly me: string | undefined;
}

const bodyOf = (event: CommentEvent): string => text(event.payload?.body);
const filesOf = (event: CommentEvent): CommentFile[] =>
  Array.isArray(event.payload?.files)
    ? (event.payload.files as CommentFile[])
    : [];
const gone = (event: CommentEvent): boolean =>
  typeof event.payload?.deletedAt === 'string';

/**
 * Enter sends, Shift+Enter breaks the line — never while an input method is
 * composing, where Enter confirms the characters.
 */
const sendsOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>): boolean =>
  event.key === 'Enter' &&
  !event.shiftKey &&
  !event.nativeEvent.isComposing &&
  event.keyCode !== 229;

/** The writer's initials in a round, as the account menu draws them. */
function Avatar({
  name,
  small = false,
  className,
}: {
  readonly name: string;
  readonly small?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-muted font-medium text-muted-foreground',
        small ? 'size-6 text-[10px]' : 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The files a comment is being written with: picked with the paperclip,
 * dropped or pasted onto the box, each uploaded at once and kept by id
 * until the comment is posted.
 */
function useUploads() {
  const manager = useService(clientFileRepositoryManagerToken);
  const [files, setFiles] = useState<CommentFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const add = (picked: readonly File[]): void => {
    if (!picked.length || uploading) return;
    setUploading(true);
    setError(undefined);
    void (async () => {
      try {
        const repository = manager.repository('itamAttachments');
        const uploaded: CommentFile[] = [];
        for (const file of picked) {
          const { record } = await repository.uploadOne({ file });
          uploaded.push({
            id: text(record.id),
            filename: text(record.filename),
            ext: text(record.ext),
            size: record.size,
            mimeType: text(record.mimeType) || null,
          });
        }
        setFiles((current) => [...current, ...uploaded]);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setUploading(false);
      }
    })();
  };
  return {
    files,
    uploading,
    error,
    add,
    remove: (id: string) =>
      setFiles((current) => current.filter((file) => file.id !== id)),
    clear: () => setFiles([]),
  };
}

/**
 * The box a comment is written in: atop a record's history, or under a
 * comment for a reply. @ and a name mentions a colleague, who is told;
 * files are picked with the paperclip, dropped or pasted.
 */
export function CommentComposer({
  scope,
  replyToId,
  autoFocus,
  onDone,
}: {
  readonly scope: CommentScope;
  readonly replyToId?: string;
  readonly autoFocus?: boolean;
  /** A reply's box closes once posted, or when left empty. */
  readonly onDone?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const uploads = useUploads();
  const drag = useFileDrag();
  const pickerRef = useRef<HTMLInputElement>(null);
  // The writer is looked up among the colleagues; an account holding no
  // permission set of this application (the administrator) is not one, so
  // its own name answers, as the account menu's does (2026-10-16).
  const { session } = useAuthentication();
  const me =
    scope.people.find((person) => person.id === scope.me)?.name ||
    session?.user.name ||
    session?.user.email ||
    '';
  const ready =
    (draft.trim() !== '' || uploads.files.length > 0) && !uploads.uploading;
  const post = async (): Promise<void> => {
    if (!ready || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: 'itam/comments',
        method: 'POST',
        json: {
          subjectType: scope.subjectType,
          subjectId: scope.subjectId,
          body: draft,
          mentions: mentionsIn(draft, mentions, scope.colleagues),
          ...(uploads.files.length
            ? { fileIds: uploads.files.map((file) => file.id) }
            : {}),
          ...(replyToId ? { replyToId } : {}),
        },
      });
      setDraft('');
      setMentions([]);
      uploads.clear();
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onDone?.();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='grid gap-2'>
      <div className='flex items-start gap-3'>
        {/* Centred on the box's first line, which is a little taller than
            the round; the row stays top-aligned for a box grown to several. */}
        <Avatar
          name={me}
          small={Boolean(replyToId)}
          className={replyToId ? 'mt-1.5' : 'mt-0.5'}
        />
        <div
          className='relative min-w-0 flex-1'
          {...drag.bind}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files'))
              event.preventDefault();
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            uploads.add([...event.dataTransfer.files]);
          }}
          onPaste={(event) => {
            if (!event.clipboardData.files.length) return;
            event.preventDefault();
            uploads.add([...event.clipboardData.files]);
          }}
        >
          <MentionTextarea
            aria-label={t(replyToId ? 'comments.reply' : 'comments.label')}
            value={draft}
            mentions={mentions}
            onMentionsChange={setMentions}
            colleagues={scope.colleagues}
            autoFocus={autoFocus}
            placeholder={t(
              replyToId ? 'comments.replyPlaceholder' : 'comments.placeholder',
            )}
            rows={1}
            className={cn(
              'max-h-[50vh] min-h-8 resize-none border-border py-1.5 pr-10 text-sm shadow-xs focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/20',
              // Files dragged over it: lit as when it has focus, a step
              // stronger, so the drop reads as taken.
              drag.over && 'border-ring ring-2 ring-ring/30',
            )}
            onChange={setDraft}
            onKeyDown={(event) => {
              if (sendsOnEnter(event)) {
                event.preventDefault();
                void post();
              }
              if (event.key === 'Escape' && replyToId && !draft.trim())
                onDone?.();
            }}
          />
          {/* As far from the top as from the right: centred on the box's
              first line, which is a little taller than the button. */}
          <span className='absolute top-1 right-1'>
            <Button
              type='button'
              size='icon-sm'
              variant='ghost'
              className='text-muted-foreground'
              aria-label={t('comments.attach')}
              title={t('comments.attach')}
              disabled={uploads.uploading}
              onClick={() => pickerRef.current?.click()}
            >
              {uploads.uploading ? <Spinner /> : <Paperclip />}
            </Button>
            <input
              ref={pickerRef}
              type='file'
              multiple
              hidden
              onChange={(event) => {
                uploads.add([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
          </span>
        </div>
      </div>
      <FileChips
        files={uploads.files}
        onRemove={(file) => uploads.remove(file.id)}
        className={replyToId ? 'pl-9' : 'pl-11'}
      />
      {draft.trim() || uploads.files.length ? (
        <div className='flex items-center justify-end gap-3'>
          <span className='text-xs text-muted-foreground'>
            {t('comments.shortcut')}
          </span>
          {replyToId ? (
            <Button size='sm' variant='ghost' onClick={() => onDone?.()}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button
            size='sm'
            disabled={busy || !ready}
            onClick={() => void post()}
          >
            <Send data-icon='inline-start' />
            {t('comments.post')}
          </Button>
        </div>
      ) : null}
      {error || uploads.error ? (
        <p className='text-xs text-destructive'>{error ?? uploads.error}</p>
      ) : null}
    </div>
  );
}

/** A comment's files, one a row, as a record's attachments read. */
function CommentFiles({
  files,
}: {
  readonly files: readonly CommentFile[];
}): ReactElement | null {
  return (
    <FileRows
      className='mt-2'
      files={files.map((file) => ({ ...file, url: fileUrl(file) }))}
    />
  );
}

/**
 * One message of a thread — the comment or a reply: who wrote it and when,
 * its text with its mentions picked out, its files, and its actions: reply
 * for anyone, edit and delete for its author behind "…".
 */
function Message({
  event,
  scope,
  small,
  onReply,
}: {
  readonly event: CommentEvent;
  readonly scope: CommentScope;
  readonly small?: boolean;
  readonly onReply: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const author =
    scope.people.find((person) => person.id === event.actorId)?.name ??
    text(event.actorId);
  const mine = Boolean(scope.me) && event.actorId === scope.me;
  const removed = gone(event);
  const write = async (method: 'PATCH' | 'DELETE'): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `itam/comments/${event.id}`,
        method,
        ...(method === 'PATCH'
          ? {
              json: {
                body: draft,
                mentions: mentionsIn(draft, mentions, scope.colleagues),
              },
            }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      setEditing(false);
      setDeleting(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div id={`history-${event.id}`} className='flex scroll-mt-24 gap-3'>
      <Avatar name={author} small={small} />
      <div className='min-w-0 flex-1'>
        <div className='flex min-h-6 items-center gap-2 text-sm'>
          <span className='truncate font-semibold'>{author}</span>
          <time
            dateTime={event.createdAt}
            title={formatDate(event.createdAt, true)}
            className='shrink-0 text-xs text-muted-foreground tabular-nums'
          >
            {relativeTime(
              event.createdAt,
              i18n.language,
              t('comments.justNow'),
            )}
          </time>
          {typeof event.payload?.editedAt === 'string' && !removed ? (
            <span
              className='shrink-0 text-xs text-muted-foreground'
              title={formatDate(event.payload.editedAt, true)}
            >
              {t('comments.edited')}
            </span>
          ) : null}
          <span className='ml-auto flex shrink-0 items-center'>
            {!removed ? (
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                className='text-muted-foreground'
                aria-label={t('comments.reply')}
                title={t('comments.reply')}
                onClick={onReply}
              >
                <Reply />
              </Button>
            ) : null}
            {mine && !removed ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type='button'
                      size='icon-sm'
                      variant='ghost'
                      className='text-muted-foreground'
                      aria-label={t('common.more')}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onClick={() => {
                      setDraft(bodyOf(event));
                      setMentions(
                        Array.isArray(event.payload?.mentions)
                          ? event.payload.mentions.map(text)
                          : [],
                      );
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => setDeleting(true)}
                  >
                    <Trash2 />
                    {t('actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        </div>
        {editing ? (
          <div className='mt-1 grid gap-2'>
            <MentionTextarea
              aria-label={t('comments.label')}
              value={draft}
              mentions={mentions}
              onMentionsChange={setMentions}
              colleagues={scope.colleagues}
              autoFocus
              className='max-h-[50vh] min-h-16 text-sm'
              onChange={setDraft}
              onKeyDown={(keys) => {
                if (sendsOnEnter(keys)) {
                  keys.preventDefault();
                  void write('PATCH');
                }
                if (keys.key === 'Escape') setEditing(false);
              }}
            />
            <div className='flex justify-end gap-2'>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setEditing(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                size='sm'
                disabled={busy || (!draft.trim() && !filesOf(event).length)}
                onClick={() => void write('PATCH')}
              >
                {t('actions.save')}
              </Button>
            </div>
          </div>
        ) : removed ? (
          <p className='text-sm text-muted-foreground'>
            {t('comments.deleted')}
          </p>
        ) : (
          <>
            {bodyOf(event) ? (
              <CommentBody text={bodyOf(event)}>
                {withMentions(
                  bodyOf(event),
                  event.payload?.mentions,
                  scope.people,
                )}
              </CommentBody>
            ) : null}
            <CommentFiles files={filesOf(event)} />
          </>
        )}
        {error && !deleting ? (
          <p className='mt-1 text-xs text-destructive'>{error}</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('comments.deleteTitle')}
        description={t('comments.deleteDescription')}
        confirmLabel={t('actions.delete')}
        destructive
        busy={busy}
        error={error}
        onConfirm={() => void write('DELETE')}
      />
    </div>
  );
}

/**
 * A comment on a record's history, with its replies under it: on a card of
 * its own, people talking set apart from what happened around them. Reply
 * opens a box at the thread's foot.
 */
export function CommentThread({
  comment,
  replies = [],
  scope,
}: {
  readonly comment: CommentEvent;
  readonly replies?: readonly CommentEvent[];
  readonly scope: CommentScope;
}): ReactElement {
  const [replying, setReplying] = useState(false);
  return (
    <div className='grid gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs'>
      <Message
        event={comment}
        scope={scope}
        onReply={() => setReplying(true)}
      />
      {replies.length ? (
        <div className='grid gap-3 pl-11'>
          {replies.map((reply) => (
            <Message
              key={reply.id}
              event={reply}
              scope={scope}
              small
              onReply={() => setReplying(true)}
            />
          ))}
        </div>
      ) : null}
      {replying ? (
        <div className='pl-11'>
          <CommentComposer
            scope={scope}
            replyToId={comment.id}
            autoFocus
            onDone={() => setReplying(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A comment folded past the length history folds a summary at
 * (`CollapsibleText`'s limits, 2026-10-16), by lines rather than by
 * characters since it carries its mentions as links.
 */
function CommentBody({
  text,
  children,
}: {
  readonly text: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long =
    text.length > COLLAPSE_CHARS || text.split('\n').length > COLLAPSE_LINES;
  return (
    <div className='text-sm leading-relaxed'>
      <p
        className={cn(
          'whitespace-pre-wrap wrap-anywhere',
          long && !open && 'line-clamp-6',
        )}
      >
        {children}
      </p>
      {long ? (
        <button
          type='button'
          className='text-link underline-offset-4 hover:underline'
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t('common.showLess') : t('common.showMore')}
        </button>
      ) : null}
    </div>
  );
}
