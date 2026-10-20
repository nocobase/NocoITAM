/**
 * One conversation as a page of its own, for an application that gives it a route (for example, `/chat/:conversationId`,
 * where a conversation started from the home page lands). It is the panel's conversation view in its page form: the
 * messages centred at a readable width, the composer under them, and a header with the title (click to rename), the
 * agent with its availability and the conversation's mode, then new conversation, history, "Open in side panel" and a
 * menu (archive).
 *
 * Application change (ITAM, 2026-10-16, as NocoCRM's conversations page): the conversation fills the page's column
 * beside the list, under a header of the agent's round avatar, the title (click to rename) over "agent · what it does",
 * and a menu (archive), over a rule; new conversation and "back to the side panel" are the page's own (收起, 新对话),
 * and the list beside it is the history.
 *
 * The page puts its own value over the panel's (`ChatPanelScope`), so the view, the composer and the application's
 * extensions (plan cards, reference cards) work here unchanged: selecting another conversation moves to its page, a new
 * conversation goes to `newConversationPath` (the application's place to start one), and nothing pinned to the panel
 * or drafted for it lands here. Arriving closes the panel, so the same conversation is never shown twice with two
 * composers.
 *
 * It needs `ChatProvider` with `conversationPath` above it.
 */
import {
  AgentAvatar,
  CHAT_PANEL_ATTRIBUTE,
  ChatPanelScope,
  useChatAgents,
  useChatPageTracking,
  useChatPanel,
  useConversation,
  useConversationActions,
  type ChatPanelValue,
} from '@nocobase/app-plugin-agents/client/chat';
import { ArchiveIcon, EllipsisIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Skeleton } from '#components/ui/skeleton';

import { useChatTranslation } from './chat-i18n.js';
import { ConversationView } from './conversation-view.js';
import { ConversationTitle } from './panel-header.js';
// Application change (ITAM, Agents plugin 1.0): Asset Steward's name for
// the plugin's native online agent (lib/itam/agent-text.ts).
import { useAgentText } from '@/lib/itam/agent-text';

function noop(): void {}

/** Only where a pointer can aim: on a phone, focusing the box on arrival would raise the keyboard over the reply. */
function finePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: fine)').matches
  );
}

export interface ChatConversationPageProps {
  /**
   * Application change (ITAM, 2026-10-16): null is a new conversation, shown in the page's form; its first message
   * moves the address to the conversation's own (replacing this one).
   */
  readonly conversationId: string | null;
  /** Where a new conversation starts (for example, its home page, whose composer picks the agent). */
  readonly newConversationPath: string;
  /** Application change (ITAM, 2026-10-16): the conversation was archived from its menu. */
  readonly onArchived: () => void;
}

export function ChatConversationPage({
  conversationId,
  newConversationPath,
  onArchived,
}: ChatConversationPageProps): ReactElement {
  const outer = useChatPanel();
  const tracking = useChatPageTracking();
  const navigate = useNavigate();
  const pathOf = outer.conversationPath;

  useEffect(() => tracking?.enter(), [tracking]);

  // Arriving closes the panel: one conversation, one composer.
  const { open, closeChat } = outer;
  const arrivedRef = useRef<string | null>(null);
  useEffect(() => {
    if (arrivedRef.current === conversationId) return;
    arrivedRef.current = conversationId;
    if (open) closeChat();
  }, [conversationId, open, closeChat]);

  const focusRef = useRef<(() => void) | null>(null);
  const registerComposer = useCallback((focus: () => void) => {
    focusRef.current = focus;
    if (finePointer()) focus();
    return () => {
      if (focusRef.current === focus) focusRef.current = null;
    };
  }, []);
  const focusComposer = useCallback(() => focusRef.current?.(), []);

  const select = useCallback(
    (id: string | null) => {
      if (id === null) void navigate(newConversationPath);
      else if (id !== conversationId && pathOf)
        void navigate(pathOf(id), { replace: conversationId === null });
    },
    [navigate, newConversationPath, conversationId, pathOf],
  );

  const scoped = useMemo<ChatPanelValue>(
    () => ({
      ...outer,
      open: true,
      mode: 'docked',
      view: 'chat',
      conversationId,
      newAgentId: null,
      setMode: noop,
      setView: noop,
      selectConversation: select,
      pinned: [],
      clearPinned: noop,
      draft: null,
      source: 'panel',
      resetSource: noop,
      registerComposer,
      focusComposer,
    }),
    [outer, conversationId, select, registerComposer, focusComposer],
  );

  return (
    <ChatPanelScope value={scoped}>
      <div
        className='flex h-full min-h-0 flex-col'
        {...{ [CHAT_PANEL_ATTRIBUTE]: '' }}
        data-testid='chat-page'
        data-conversation={conversationId ?? undefined}
      >
        <PageBar conversationId={conversationId} onArchived={onArchived} />
        <ConversationView
          conversationId={conversationId}
          variant='page'
          className='flex-1'
        />
      </div>
    </ChatPanelScope>
  );
}

function PageBar({
  conversationId,
  onArchived,
}: {
  readonly conversationId: string | null;
  readonly onArchived: () => void;
}): ReactElement {
  const { t } = useChatTranslation();
  const agentText = useAgentText();
  const detail = useConversation(conversationId);
  const conversation = detail.data ?? null;
  const agents = useChatAgents();
  const actions = useConversationActions();
  // The conversation's agent, else the one a new conversation starts with;
  // what it does comes from the agents' list.
  const listed = conversation
    ? agents.data?.find((entry) => entry.id === conversation.agent.id)
    : agents.data?.[0];
  const named = conversation?.agent ?? listed ?? null;
  const name = (named ? agentText.name(named) : null) ?? t('chat.title');
  const role = listed ? agentText.description(listed) : null;
  const shown = conversation ? conversation.title?.trim() || name : name;

  return (
    <header className='flex min-h-14 shrink-0 items-center gap-3 border-b border-border pb-3'>
      {conversationId && !conversation ? (
        <Skeleton className='h-9 w-64' />
      ) : (
        <>
          <AgentAvatar name={name} className='shrink-0 rounded-full' />
          <div className='grid min-w-0 flex-1'>
            {conversation ? (
              <ConversationTitle
                conversation={conversation}
                shown={shown}
                level={1}
                className='text-base font-semibold'
              />
            ) : (
              <h1 className='truncate text-base font-semibold'>{name}</h1>
            )}
            {conversation ? (
              <p
                className='truncate px-1 text-xs text-muted-foreground'
                data-testid='chat-page-agent'
              >
                {[name, role].filter(Boolean).join(' · ')}
              </p>
            ) : role ? (
              <p className='truncate text-xs text-muted-foreground'>{role}</p>
            ) : null}
          </div>
          {conversation && !conversation.archivedAt ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='shrink-0'
                    aria-label={t('chat.more')}
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  disabled={actions.archive.isPending}
                  onClick={() =>
                    actions.archive.mutate(
                      { id: conversation.id, archived: true },
                      { onSuccess: onArchived },
                    )
                  }
                >
                  <ArchiveIcon />
                  {t('chat.archive')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      )}
    </header>
  );
}
