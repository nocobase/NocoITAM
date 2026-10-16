import {
  CHAT_PANEL_ID,
  ChatExtensionsContext,
  ChatProvider,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { useAiStatus } from '@/lib/itam/ai';
import { ITAM_CHAT_EXTENSIONS } from '@/lib/itam/chat-extensions';
import { ChatPanel } from '#extensions/nocobase-agent-chat/chat-panel';
import { ChatFloatingButton } from '#extensions/nocobase-agent-chat/launchers';
import { Button } from '#components/ui/button';
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
 * Library's agent-chat block) is drawn here, fixed at the window's right
 * edge over the whole height as NocoCRM's is (2026-10-16), the page making
 * room for it from 1280px (`itam-page-main`, styles.css). ITAM adds its plan
 * cards among a conversation's messages (`ITAM_CHAT_EXTENSIONS`).
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
        <ChatPanel />
        {/* Below `md` the panel opens from a floating button. */}
        <ChatFloatingButton />
      </ChatExtensionsContext.Provider>
    </ChatProvider>
  );
}

/**
 * The header's entry to the assistant (2026-10-16, after NocoCRM's ✨
 * button): first of the header's actions, in the frame the theme button
 * wears with the sparkle in the primary colour, on every page. It toggles
 * the panel as ⌘J does, back where it was left. While the assistant cannot
 * answer (no usable model, Noco switched off) it stays, disabled, and says
 * why.
 */
export function AgentChatButton(): ReactElement | null {
  const { t } = useTranslation();
  const panel = useChatPanel();
  const status = useAiStatus();
  if (!panel.available || status.isLoading) return null;
  const ready = status.data?.available === true;
  const label = ready ? t('ai.ask') : t('ai.unavailable');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // A disabled button takes no pointer events, so the tooltip that
          // says why hangs on a wrapper.
          <span className='inline-flex' />
        }
      >
        <Button
          size='icon'
          variant='outline'
          className='size-10 rounded-xl border-border bg-background/60 hover:bg-accent/50'
          aria-label={label}
          aria-expanded={panel.open}
          aria-controls={CHAT_PANEL_ID}
          aria-keyshortcuts='Meta+J Control+J'
          disabled={!ready}
          onClick={panel.toggleChat}
        >
          <Sparkles className='size-5 text-primary' aria-hidden='true' />
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
