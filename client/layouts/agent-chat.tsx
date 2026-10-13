import {
  CHAT_PANEL_ID,
  ChatExtensionsContext,
  ChatProvider,
  modifierKeyLabel,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { ITAM_CHAT_EXTENSIONS } from '@/lib/itam/chat-extensions';
import { ChatFloatingButton } from '#extensions/nocobase-agent-chat/launchers';
import { Kbd } from '#components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

/**
 * Application change (ITAM, template 1.0.0-beta.64): the assistant is the
 * Agents plugin's chat. `ChatProvider` wraps the shell, so the panel keeps
 * its conversation across pages, a page can say what it shows
 * (`useChatContextSource`) and ⌘J opens it; a conversation's own page is
 * `/agent-chat/:conversationId`. The panel itself (`ChatPanel`, the UI
 * Library's agent-chat block) sits beside `<main>` in the layout. ITAM adds
 * its plan cards among a conversation's messages (`ITAM_CHAT_EXTENSIONS`).
 */
export function AgentChatShell({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <ChatProvider
      conversationPath={(id) => `/agent-chat/${encodeURIComponent(id)}`}
    >
      <ChatExtensionsContext.Provider value={ITAM_CHAT_EXTENSIONS}>
        {children}
        {/* Below `md` the panel opens from a floating button. */}
        <ChatFloatingButton />
      </ChatExtensionsContext.Provider>
    </ChatProvider>
  );
}

/**
 * The header's entry to the chat: the sparkle every AI shortcut wears, in
 * the assistant's own frame (header-actions.tsx gives it), opening the panel
 * on the conversation in progress and closing it again.
 */
export function AgentChatButton({
  className,
}: {
  readonly className: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const panel = useChatPanel();
  if (!panel.available) return null;
  const label = t(panel.open ? 'ai.closeChat' : 'ai.openChat');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            className={className}
            aria-label={label}
            aria-pressed={panel.open}
            aria-controls={CHAT_PANEL_ID}
            aria-keyshortcuts='Meta+J Control+J'
            onClick={panel.toggleChat}
          />
        }
      >
        <Sparkles className='size-5' aria-hidden='true' />
      </TooltipTrigger>
      <TooltipContent side='bottom'>
        {label}
        <Kbd className='ml-1.5'>{`${modifierKeyLabel()} J`}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
