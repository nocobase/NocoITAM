import {
  appUIMessageText,
  AgentAvatar,
  useChatApi,
  type ConversationListPages,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, type UseInfiniteQueryResult } from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { NavLink } from 'react-router';

import { AutoLoadMore } from '#components/settings/auto-load';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { listedConversations, markdownLine } from '@/lib/itam/conversations';
import { errorMessage, relativeTime } from '@/lib/itam/format';
import { useAgentText } from '@/lib/itam/agent-text';

/**
 * The reader's conversations with the assistant, last message first
 * (2026-10-16, ported from NocoCRM's `agent-chat/conversation-list.tsx`):
 * the conversations page's column and the panel's history. A row is the
 * agent's avatar beside the title and the time, the newest message under
 * them, a dot while a reply is unread; the open one on the grey a hovered
 * one takes, a shade deeper. On the page a row is the conversation's
 * address and the archived ones are a list of their own behind a switch at
 * the foot; in the panel a row opens the conversation in place. The global
 * search's unkept answers are listed nowhere.
 */
export function ConversationList({
  ref,
  query,
  openId,
  archived = false,
  onArchived,
  onOpen,
}: {
  readonly ref?: Ref<HTMLElement>;
  readonly query: UseInfiniteQueryResult<ConversationListPages>;
  readonly openId: string | null;
  readonly archived?: boolean;
  /** Showing the archived ones instead of the open; left out, no such switch (the panel). */
  readonly onArchived?: (shown: boolean) => void;
  /** Opening a conversation in place (the panel); left out, a row links to its page. */
  readonly onOpen?: (id: string) => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const agentText = useAgentText();
  // The list stays on the page: its times move on with the clock.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const items = listedConversations(query.data?.pages);
  const suffix = archived ? '?archived=1' : '';
  return (
    <nav
      ref={ref}
      tabIndex={-1}
      aria-label={t(
        archived ? 'ai.conversations.archivedList' : 'ai.conversations.list',
      )}
      className='flex min-h-0 flex-1 flex-col outline-none'
    >
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {query.isLoading ? (
          <div className='flex flex-col gap-2 p-2' role='status'>
            <span className='sr-only'>{t('ai.conversations.loading')}</span>
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className='h-14 w-full rounded-lg' />
            ))}
          </div>
        ) : query.error ? (
          <div className='flex flex-col items-start gap-2 p-2'>
            <p className='text-sm text-destructive'>
              {errorMessage(query.error)}
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void query.refetch()}
            >
              {t('ai.conversations.retry')}
            </Button>
          </div>
        ) : !items.length ? (
          <p className='px-4 py-10 text-center text-sm text-muted-foreground'>
            {t(
              archived
                ? 'ai.conversations.noArchived'
                : 'ai.conversations.empty',
            )}
          </p>
        ) : (
          <ul className='flex flex-col gap-0.5 p-2'>
            {items.map((conversation) => {
              const title =
                conversation.title?.trim() || t('ai.conversations.untitled');
              const unread = !conversation.read;
              const current = conversation.id === openId;
              const agent =
                agentText.name(conversation.agent) ??
                t('ai.conversations.agent');
              return (
                <li key={conversation.id}>
                  <RowTarget
                    to={`/agent-chat/${encodeURIComponent(conversation.id)}${suffix}`}
                    onOpen={onOpen ? () => onOpen(conversation.id) : undefined}
                    current={current}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                      current ? 'bg-accent' : 'hover:bg-hover'
                    }`}
                  >
                    <AgentAvatar
                      name={agent}
                      className='shrink-0 rounded-full'
                    />
                    <span className='grid min-w-0 flex-1 gap-0.5'>
                      <span className='flex min-w-0 items-baseline gap-2'>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}
                          title={title}
                        >
                          {title}
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                          {relativeTime(
                            conversation.lastMessageAt,
                            i18n.language,
                            t('ai.conversations.justNow'),
                            now,
                          )}
                        </span>
                      </span>
                      {/* A reply not yet read: the preview in the body's
                          colour and a dot in the primary one at the row's
                          end, under the time. */}
                      <span
                        className={`flex min-w-0 items-center gap-1.5 text-xs ${unread ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        <span className='min-w-0 flex-1 truncate'>
                          <LastMessage
                            id={conversation.id}
                            // Read again when a message arrives, when a run
                            // starts or ends (a reply streamed into its
                            // message keeps the message's time), and when the
                            // conversation changes.
                            at={`${conversation.lastMessageAt}|${conversation.updatedAt}|${conversation.run?.id ?? ''}`}
                            agent={agent}
                          />
                        </span>
                        {unread ? (
                          <span className='size-2 shrink-0 rounded-full bg-primary'>
                            <span className='sr-only'>
                              {t('ai.conversations.unread')}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </RowTarget>
                </li>
              );
            })}
          </ul>
        )}
        <AutoLoadMore
          hasMore={Boolean(query.hasNextPage)}
          loading={query.isFetchingNextPage}
          onLoad={() => void query.fetchNextPage()}
        />
      </div>
      {onArchived ? (
        <div className='shrink-0 border-t border-border px-3 py-2'>
          <Button
            variant='ghost'
            size='sm'
            className='text-muted-foreground'
            onClick={() => onArchived(!archived)}
          >
            {t(
              archived
                ? 'ai.conversations.hideArchived'
                : 'ai.conversations.showArchived',
            )}
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

/** A row: a link to the conversation's page, or a button opening it in place. */
function RowTarget({
  to,
  onOpen,
  current,
  className,
  children,
}: {
  readonly to: string;
  readonly onOpen: (() => void) | undefined;
  readonly current: boolean;
  readonly className: string;
  readonly children: ReactNode;
}): ReactElement {
  return onOpen ? (
    <button
      type='button'
      className={className}
      aria-current={current ? 'true' : undefined}
      onClick={onOpen}
    >
      {children}
    </button>
  ) : (
    <NavLink
      to={to}
      aria-current={current ? 'page' : undefined}
      className={className}
    >
      {children}
    </NavLink>
  );
}

/**
 * The newest message of a conversation as one plain line under its title,
 * led by who wrote it ("你：", or the agent's name). The plugin's list
 * carries no preview, so each row reads its conversation's last message,
 * again whenever `at` changes.
 */
function LastMessage({
  id,
  at,
  agent,
}: {
  readonly id: string;
  readonly at: string;
  readonly agent: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useChatApi();
  const { data } = useQuery({
    queryKey: ['itam', 'agent-chat', 'last-message', id, at],
    queryFn: async () =>
      (await api.messages(id, { pageSize: 1 })).items.at(-1) ?? null,
    staleTime: Infinity,
  });
  const line =
    data && data.role !== 'system' ? markdownLine(appUIMessageText(data)) : '';
  if (!line) return null;
  return (
    <>
      {data?.role === 'user'
        ? t('ai.conversations.lastYours')
        : t('ai.conversations.lastFrom', { name: agent })}
      {line}
    </>
  );
}
