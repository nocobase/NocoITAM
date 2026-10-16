/**
 * One entry of a conversation: the viewer's own message on the right with the context it carried (no avatar or name,
 * only a muted time under it that shows on hover or focus), the agent's reply on the left as Markdown under the
 * agent's avatar and name, or a centred line for what the server noted (the agent was switched, the run failed or was
 * stopped), translated from its `metadata.notice.code`. News the application shows as a card of its own
 * (`ChatExtensions.renderNews`) takes the line's place, and so does the card of an agent the agent consulted
 * (`ConsultationCard`). An online agent's reply still being written shows a typing cursor
 * (`metadata.streaming`); one whose run ended before it was final says it stopped there (`metadata.interrupted`).
 */
import {
  ChatExtensionsContext,
  noticeText,
  useFormatters,
  type PendingMessage,
} from '@nocobase/app-plugin-agents/client/chat';
import type { ConversationMessage } from '@nocobase/app-plugin-agents/shared/conversations';
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
} from 'lucide-react';
import {
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '#components/ui/button';
import { cn } from 'cn';

import { ChatMarkdown } from './chat-markdown.js';
import { useChatTranslation } from './chat-i18n.js';
import { ConsultationCard } from './consultation-card.js';
import { SentContext } from './context-chips.js';
import { MessageAttachments } from './message-attachments.js';

function Time({
  at,
  className,
}: {
  readonly at: string;
  readonly className?: string;
}): ReactElement {
  const format = useFormatters();
  return (
    <time
      dateTime={at}
      className={cn('text-xs text-muted-foreground', className)}
      title={format.dateTime(at)}
    >
      {format.relative(at)}
    </time>
  );
}

export interface MessageItemProps {
  readonly message: ConversationMessage;
  /** The name of an agent by id, for replies and notices. */
  readonly agentName: (agentId: string | undefined) => string;
  /** What an application renders under the message (`ChatExtensions.renderMessageExtra`). */
  readonly extra?: ReactNode;
}

export function MessageItem({
  message,
  agentName,
  extra,
}: MessageItemProps): ReactElement {
  const { t } = useChatTranslation();
  const { newsText, renderNews } = useContext(ChatExtensionsContext);
  const notice = message.metadata.notice;
  const card =
    message.role === 'system' && notice?.code === 'news'
      ? (renderNews?.(notice, message) ?? null)
      : null;
  if (message.role === 'system' && notice?.code === 'consultation')
    return (
      <li
        className='flex px-1'
        data-chat-message='event'
        data-seq={message.seq}
      >
        <ConsultationCard notice={notice} />
      </li>
    );
  if (card !== null)
    return (
      <li
        className='flex px-1'
        data-chat-message='event'
        data-seq={message.seq}
      >
        {card}
      </li>
    );
  if (message.role === 'system') {
    return (
      <li
        className='flex justify-center px-4'
        data-chat-message='system'
        data-seq={message.seq}
      >
        <p className='max-w-full text-center text-xs text-muted-foreground wrap-anywhere'>
          {noticeText(
            t,
            notice,
            message.content.content,
            (id) => agentName(id),
            newsText,
          )}{' '}
          · <Time at={message.createdAt} />
        </p>
      </li>
    );
  }
  const fromAgent = message.role === 'assistant';
  const streaming = fromAgent && message.metadata.streaming === true;
  const text = message.content.content;
  // Application change (ITAM, 2026-10-16, after NocoCRM's conversation): the
  // agent's reply is plain text across the panel — no avatar, name or bubble
  // — and the viewer's message a grey bubble on the right; under either,
  // while it is hovered or focused, when it was sent and a copy button.
  if (fromAgent)
    return (
      <li
        className='group/message grid min-w-0 gap-0.5'
        data-chat-message={message.role}
        data-seq={message.seq}
        data-streaming={streaming ? true : undefined}
        aria-busy={streaming ? true : undefined}
      >
        <span className='sr-only'>{agentName(message.metadata.agentId)}</span>
        <div className='min-w-0 text-sm leading-6 [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2'>
          <ChatMarkdown content={text} />
          {streaming ? (
            <span
              className='ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-foreground/60 align-middle motion-reduce:animate-none'
              role='status'
              aria-label={t('chat.reply.writing')}
            />
          ) : null}
        </div>
        {message.metadata.interrupted ? (
          <p className='text-xs text-muted-foreground'>
            {t('chat.reply.interrupted')}
          </p>
        ) : null}
        {streaming ? null : <SentAt at={message.createdAt} content={text} />}
        {extra ?? null}
      </li>
    );
  return (
    <li
      className='group/message ml-auto flex max-w-[85%] min-w-0 flex-col items-end gap-1'
      data-chat-message={message.role}
      data-seq={message.seq}
    >
      <span className='sr-only'>{t('chat.you')}</span>
      {message.attachments?.length ? (
        <MessageAttachments attachments={message.attachments} />
      ) : null}
      {/* A message of files alone has no text bubble. */}
      {text.trim() ? (
        <div className='max-w-full min-w-0 rounded-xl bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap'>
          {text}
        </div>
      ) : null}
      {message.workContext ? (
        <SentContext context={message.workContext} />
      ) : null}
      <SentAt at={message.createdAt} content={text} />
      {extra ?? null}
    </li>
  );
}

/**
 * Under a message while it is hovered (or a control in it focused): when it was sent, and a button copying its text,
 * which says so a moment once it has (after NocoCRM's `SentAt`).
 */
function SentAt({
  at,
  content,
}: {
  readonly at: string;
  readonly content: string;
}): ReactElement {
  const { t } = useChatTranslation();
  const format = useFormatters();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const label = t(copied ? 'actions.copied' : 'actions.copy');
  return (
    <span className='flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100 motion-reduce:transition-none pointer-coarse:opacity-100'>
      <time dateTime={at} className='tabular-nums' title={format.dateTime(at)}>
        {format.relative(at)}
      </time>
      {content.trim() ? (
        <Button
          variant='ghost'
          size='icon-xs'
          aria-label={label}
          title={label}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(content)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      ) : null}
    </span>
  );
}

export interface PendingItemProps {
  readonly message: PendingMessage;
  readonly onRetry: () => void;
  readonly onDiscard: () => void;
}

/** A message the server has not confirmed: "sending", or "not sent" with a retry. */
export function PendingItem({
  message,
  onRetry,
  onDiscard,
}: PendingItemProps): ReactElement {
  const { t } = useChatTranslation();
  const failed = message.status === 'failed';
  return (
    <li
      className='flex justify-end'
      data-chat-message='pending'
      data-status={message.status}
      aria-busy={failed ? undefined : true}
    >
      <div className='flex max-w-[85%] min-w-0 flex-col items-end'>
        <p className='mb-1 text-xs text-muted-foreground'>
          {failed ? (
            <span className='inline-flex items-center gap-1 text-destructive'>
              <AlertCircleIcon className='size-3.5' aria-hidden='true' />
              {t('chat.pending.failed')}
            </span>
          ) : (
            t('chat.pending.sending')
          )}
        </p>
        {message.attachments?.length ? (
          <MessageAttachments
            attachments={message.attachments}
            className={cn(
              message.content.trim() && 'mb-1',
              !failed && 'opacity-70',
            )}
          />
        ) : null}
        {message.content.trim() ? (
          <div
            className={cn(
              'max-w-full min-w-0 rounded-xl bg-muted px-3 py-2 text-sm',
              !failed && 'opacity-70',
            )}
          >
            <p className='whitespace-pre-wrap wrap-anywhere'>
              {message.content}
            </p>
          </div>
        ) : null}
        {failed ? (
          <div className='mt-1 flex gap-1'>
            <Button variant='ghost' size='xs' onClick={onDiscard}>
              {t('chat.pending.discard')}
            </Button>
            <Button variant='outline' size='xs' onClick={onRetry}>
              <RotateCcwIcon data-icon='inline-start' />
              {t('chat.pending.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
