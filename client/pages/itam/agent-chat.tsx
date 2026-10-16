import {
  useChatPanel,
  useConversation,
  useConversationList,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { MessagesSquare, Minimize2, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { ConversationList } from '#components/itam/ai/conversation-list';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { ChatConversationPage } from '#extensions/nocobase-agent-chat/conversation-page';
import { listedConversations } from '@/lib/itam/conversations';

const PATH = '/agent-chat';

/**
 * The conversations with the assistant on a page of their own (2026-10-16,
 * laid out as NocoCRM's `crm-agent-chat`): the heading over a rule with
 * 收起 and 新对话, the reader's conversations in a column on the card's
 * white at the left (`ConversationList`; the archived ones behind a switch
 * at its foot, `?archived=1`), the one open beside them;
 * `/agent-chat/new` starts one, and its first message moves the address to
 * the conversation's own within the same route, so the view stays. With no
 * conversation at all the page is an empty state holding the only way to
 * start one. Narrow, the list and the conversation take turns. A
 * conversation is its owner's alone; the plugin answers nobody else for it.
 */
export default function AgentChatPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const chat = useChatPanel();
  const { conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = conversationId === 'new';
  const openId = isNew ? null : (conversationId ?? null);
  const archived = searchParams.get('archived') === '1';
  const suffix = archived ? '?archived=1' : '';
  const open = useConversationList({});
  const archivedList = useConversationList({ archived: true });
  const list = archived ? archivedList : open;
  const listRef = useRef<HTMLElement>(null);
  // Archived ones stay in reach from the empty state, once the last open
  // conversation is archived.
  const hasArchived = listedConversations(archivedList.data?.pages).length > 0;
  const showArchived = (shown: boolean): void =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (shown) next.set('archived', '1');
      else next.delete('archived');
      return next;
    });
  // An archived conversation restored (取消归档 in its place) is listed
  // with the open ones again.
  const restored = useConversation(archived ? openId : null).data;
  useEffect(() => {
    if (restored && !restored.archivedAt)
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('archived');
        return next;
      });
  }, [restored, setSearchParams]);
  const none =
    !open.isLoading &&
    !open.error &&
    !listedConversations(open.data?.pages).length;

  // Where the reader came from: the browser history's place when the page
  // opened (the router keeps it as `idx`), so 收起 returns there past the
  // conversations opened since; opened first, or with no place, the
  // workbench.
  const [cameAt] = useState<number | null>(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === 'number' ? idx : null;
  });
  const goBack = (): void => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (cameAt && typeof idx === 'number' && idx >= cameAt)
      void navigate(-(idx - cameAt + 1));
    else void navigate('/');
  };

  const detailOpen = isNew || openId !== null;
  // The reader's first conversation: no list beside it yet.
  const first = none && !archived;
  const newButton = (
    <Button render={<Link to={`${PATH}/new`} />} nativeButton={false}>
      <Plus />
      {t('ai.conversations.new')}
    </Button>
  );
  // 收起: back to the page the reader came from, the conversation open (if
  // any) in the side panel — the panel's 在页面中打开 undone.
  const collapseButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            onClick={() => {
              chat.openChat(
                openId ? { conversationId: openId, view: 'chat' } : {},
              );
              goBack();
            }}
          />
        }
      >
        <Minimize2 />
        {t('ai.conversations.collapse')}
      </TooltipTrigger>
      <TooltipContent>{t('ai.conversations.collapseHint')}</TooltipContent>
    </Tooltip>
  );

  let body: ReactElement;
  if (open.isLoading && !detailOpen)
    body = (
      <div className='flex flex-col gap-2 p-4 lg:w-96' role='status'>
        <span className='sr-only'>{t('ai.conversations.loading')}</span>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className='h-16 w-full rounded-lg' />
        ))}
      </div>
    );
  else if (first && !isNew)
    body = (
      <div className='flex flex-1 items-center justify-center p-6'>
        <Empty className='border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>{t('ai.conversations.empty')}</EmptyTitle>
            <EmptyDescription>
              {t('ai.conversations.emptyDescription')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className='flex flex-wrap justify-center gap-2'>
              {newButton}
              {hasArchived ? (
                <Button variant='ghost' onClick={() => showArchived(true)}>
                  {t('ai.conversations.showArchived')}
                </Button>
              ) : null}
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  else
    body = (
      <div className='flex min-h-0 flex-1'>
        {first ? null : (
          <div
            className={`flex min-h-0 w-full flex-col border-r bg-card lg:w-96 lg:shrink-0 ${detailOpen ? 'max-lg:hidden' : ''}`}
          >
            <ConversationList
              ref={listRef}
              query={list}
              openId={openId}
              archived={archived}
              onArchived={showArchived}
            />
          </div>
        )}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-3 md:px-6 ${detailOpen ? '' : 'max-lg:hidden'}`}
        >
          {detailOpen ? (
            <>
              {/* Narrow, the list and the conversation take turns. */}
              <div className='mb-2 lg:hidden'>
                <BackButton to={`${PATH}${suffix}`} />
              </div>
              <ChatConversationPage
                conversationId={openId}
                newConversationPath={`${PATH}/new`}
                onArchived={() => {
                  void navigate(`${PATH}${suffix}`);
                  // The open conversation left the view: on to the list.
                  requestAnimationFrame(() => listRef.current?.focus());
                }}
              />
            </>
          ) : (
            <p className='m-auto text-sm text-muted-foreground'>
              {t('ai.conversations.nothingOpen')}
            </p>
          )}
        </div>
      </div>
    );

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='shrink-0 border-b px-6 py-5 md:px-8'>
        <PageHeader
          title={t('ai.conversations.title')}
          actions={
            // While nothing is known yet the header offers nothing new to
            // start; with no conversation at all the empty state holds the
            // way to start one, and a first conversation being started
            // needs none.
            <div className='flex items-center gap-2'>
              {collapseButton}
              {open.isLoading || first ? null : newButton}
            </div>
          }
        />
      </div>
      {body}
    </div>
  );
}
