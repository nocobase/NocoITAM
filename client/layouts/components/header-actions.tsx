import type { ReactElement } from 'react';
import { TooltipProvider } from '#components/ui/tooltip';

import { NotificationBell } from '@/components/itam/notification-bell';

import { ThemeSettings } from '../../theme/index.js';
import { AgentChatButton } from '../agent-chat.js';
import { UserMenu } from './user-menu.js';

/**
 * Application change (ITAM): the header's own buttons share one frame — 通知
 * beside the theme and the reader's menu.
 */
const ACTION_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Application change (ITAM): the assistant's entry in the theme's blue — a
 * blue frame on the light blue accent ground, so it follows the theme and the
 * dark mode — set apart from the plain header buttons.
 */
const ASSISTANT_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-primary/40 bg-accent text-primary transition-colors hover:border-primary aria-pressed:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** The header's right-hand actions, shared by every authenticated page. */
export function HeaderActions(): ReactElement {
  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {/* Application change (ITAM): 通知 lives here since it left the
            sidebar with the 待办 page (2026-10-05). */}
        <NotificationBell className={ACTION_LINK_CLASS} />
        <ThemeSettings />
        {/* Application change (ITAM): the assistant's entry, beside the
            reader's menu: it opens the Agents plugin's chat panel on the
            conversation in progress and closes it again. */}
        <AgentChatButton className={ASSISTANT_LINK_CLASS} />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
