import {
  CHAT_PANEL_ID,
  useChatPanel,
  useConversation,
} from '@nocobase/app-plugin-agents/client/chat';
import { BotMessageSquareIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { cn } from 'cn';

import { useToggleAssistant } from '@/lib/itam/conversations';

import { useChatTranslation } from './chat-i18n.js';
import {
  FLOATING_BUTTON,
  useFloatingButtonBottom,
} from './floating-clearance.js';

/** Whether the panel's conversation has a reply in progress: the launchers show it. */
function useReplying(): boolean {
  const { conversationId } = useChatPanel();
  const detail = useConversation(conversationId).data;
  return detail?.run != null || detail?.execution?.status === 'running';
}

/**
 * A reply in progress: a still dot on the button's corner (`className` places it), ringed in the background so it stays
 * apart from the border.
 */
function ReplyingDot({
  className,
}: {
  readonly className: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'absolute size-2.5 rounded-full bg-primary ring-2 ring-background',
        className,
      )}
      aria-hidden='true'
      data-testid='chat-launcher-replying'
    />
  );
}

/**
 * Below `md`, the panel opens from a floating button; hidden while it is open. It rises above a bar the page pins to
 * the bottom of the screen, such as a comment composer, rather than covering it, and above an agent composer wherever
 * it sits, hiding when it cannot (`floating-clearance.ts`).
 */
export function ChatFloatingButton(): ReactElement | null {
  const panel = useChatPanel();
  return panel.available && !panel.open ? <FloatingButton /> : null;
}

function FloatingButton(): ReactElement {
  const { t } = useChatTranslation();
  const toggle = useToggleAssistant();
  const replying = useReplying();
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const bottom = useFloatingButtonBottom(button);
  return (
    <Button
      ref={setButton}
      variant='outline'
      size='icon'
      className={cn(
        'fixed right-4 z-40 size-12 rounded-full border-border bg-background text-foreground shadow-lg transition-[bottom] duration-150 md:hidden dark:border-border dark:bg-background',
        bottom === null && 'hidden',
      )}
      style={{ bottom: bottom ?? FLOATING_BUTTON.inset }}
      aria-label={t('chat.title')}
      aria-controls={CHAT_PANEL_ID}
      aria-expanded={false}
      // Application change (ITAM, 2026-10-16): on the latest conversation
      // when the panel holds none, as the header's ✨ button.
      onClick={toggle}
      data-testid='chat-floating-button'
    >
      <BotMessageSquareIcon className='size-5' />
      {/* On the circle's edge, not its bounding box's corner. */}
      {replying ? <ReplyingDot className='top-0.5 right-0.5' /> : null}
    </Button>
  );
}
