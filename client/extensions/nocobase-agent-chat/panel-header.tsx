/**
 * The panel's header. Application change (ITAM, 2026-10-16, after NocoCRM's panel): one row — the history toggle, the
 * agent's round avatar, the conversation's title (click to rename; Enter saves, Escape cancels) over "agent · what it
 * does", a menu (archive) while a conversation is open, new conversation, the conversation's own page, and close —
 * every button a ghost icon with a tooltip. A new conversation is named after its agent. A conversation stays with its
 * agent and its mode: a new conversation chooses its agent in the composer (`NewChatChoice`).
 */
import {
  AgentAvatar,
  newConversationAgent,
  useChatAgents,
  useChatPanel,
  useConversation,
  useConversationActions,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  CONVERSATION_TITLE_MAX,
  type ConversationDetail,
} from '@nocobase/app-plugin-agents/shared/conversations';
import {
  ArchiveIcon,
  EllipsisIcon,
  ExpandIcon,
  HistoryIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Input } from '#components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { cn } from 'cn';

import { useChatTranslation } from './chat-i18n.js';
// Application change (ITAM, Agents plugin 1.0): Asset Steward's name for
// the plugin's native online agent (lib/itam/agent-text.ts).
import { useAgentText } from '@/lib/itam/agent-text';

/** A ghost icon button named by its tooltip. */
function IconButton({
  label,
  pressed,
  onClick,
  children,
  'data-testid': testId,
}: {
  readonly label: string;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactElement;
  readonly 'data-testid'?: string;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            data-testid={testId}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PanelHeader({
  compact,
}: {
  /** The full-screen mobile form: no page to open. */
  readonly compact: boolean;
}): ReactElement {
  const { t } = useChatTranslation();
  const agentText = useAgentText();
  const panel = useChatPanel();
  const history = panel.view === 'history';
  const detail = useConversation(history ? null : panel.conversationId);
  const conversation = detail.data ?? null;
  const agents = useChatAgents();
  const actions = useConversationActions();
  // The conversation's agent, else the one a new conversation starts with;
  // what it does comes from the agents' list. Application change (ITAM,
  // 2026-10-16): a new conversation names the agent its composer has chosen
  // (`newConversationAgent`, as the conversation view does), not the list's
  // first, which named a work agent over the default assistant.
  const listed = conversation
    ? agents.data?.find((entry) => entry.id === conversation.agent.id)
    : newConversationAgent(agents.data, panel.newAgentId);
  const named = conversation?.agent ?? listed ?? null;
  const name = (named ? agentText.name(named) : null) ?? t('chat.title');
  const role = listed ? agentText.description(listed) : null;
  const shownTitle = history
    ? t('chat.history.title')
    : conversation
      ? conversation.title?.trim() || name
      : name;
  const subtitle = conversation
    ? [name, role].filter(Boolean).join(' · ')
    : history
      ? null
      : role;

  return (
    <header className='flex shrink-0 items-center gap-1 border-b border-border px-3 py-2'>
      <IconButton
        label={t('chat.history.title')}
        pressed={history}
        onClick={() => panel.setView(history ? 'chat' : 'history')}
        data-testid='chat-history-button'
      >
        <HistoryIcon />
      </IconButton>
      <AgentAvatar
        name={name}
        size='sm'
        className='ml-1 shrink-0 rounded-full'
      />
      <div className='mx-1.5 min-w-0 flex-1'>
        <ConversationTitle
          conversation={history ? null : conversation}
          shown={shownTitle}
          className='text-sm font-medium'
        />
        {subtitle ? (
          <p className='truncate px-1 text-xs text-muted-foreground'>
            {subtitle}
          </p>
        ) : null}
      </div>
      {conversation && !conversation.archivedAt ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon-sm'
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
                  { onSuccess: () => panel.selectConversation(null) },
                )
              }
            >
              <ArchiveIcon />
              {t('chat.archive')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <IconButton
        label={t('chat.newConversation')}
        onClick={() => {
          panel.selectConversation(null);
          panel.focusComposer();
        }}
      >
        <PlusIcon />
      </IconButton>
      {conversation && panel.openPage && !compact ? (
        <IconButton
          label={t('chat.openPage')}
          onClick={() => panel.openPage?.(conversation.id)}
          data-testid='chat-open-page'
        >
          <ExpandIcon />
        </IconButton>
      ) : null}
      <IconButton label={t('chat.close')} onClick={panel.closeChat}>
        <XIcon />
      </IconButton>
    </header>
  );
}

/**
 * A conversation's title as a heading; clicking it renames the conversation in place (Enter saves, Escape cancels).
 * Without a conversation it is plain text (`shown`). The panel's header and the full-page view share it.
 */
export function ConversationTitle({
  conversation,
  shown,
  level = 2,
  className,
}: {
  readonly conversation: ConversationDetail | null;
  readonly shown: string;
  readonly level?: 1 | 2;
  /** The text's size and weight. */
  readonly className?: string;
}): ReactElement {
  const { t } = useChatTranslation();
  const actions = useConversationActions();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const Heading = level === 1 ? 'h1' : 'h2';
  const text = className ?? 'text-sm font-semibold';

  function save(): void {
    setRenaming(false);
    const next = title.trim().slice(0, CONVERSATION_TITLE_MAX);
    if (conversation && next && next !== conversation.title)
      actions.rename.mutate({ id: conversation.id, title: next });
  }

  if (renaming && conversation)
    return (
      <Input
        autoFocus
        value={title}
        maxLength={CONVERSATION_TITLE_MAX}
        className='h-8 flex-1'
        aria-label={t('chat.rename')}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setRenaming(false);
          }
        }}
      />
    );
  return (
    <Heading className='min-w-0 flex-1'>
      {conversation ? (
        <button
          type='button'
          className={cn(
            'block max-w-full truncate rounded-md px-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            text,
          )}
          title={t('chat.renameHint', { title: shown })}
          onClick={() => {
            setTitle(conversation.title ?? '');
            setRenaming(true);
          }}
          data-testid='chat-title'
        >
          {shown}
        </button>
      ) : (
        <span
          className={cn('block truncate px-1', text)}
          data-testid='chat-title'
        >
          {shown}
        </span>
      )}
    </Heading>
  );
}
