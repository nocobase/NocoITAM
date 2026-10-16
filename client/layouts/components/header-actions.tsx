import type { ReactElement } from 'react';
import { TooltipProvider } from '#components/ui/tooltip';

import { ThemeSettings } from '../../theme/index.js';
import { AgentChatButton } from '../agent-chat.js';
import { UserMenu } from './user-menu.js';

/** The header's right-hand actions, shared by every authenticated page. */
export function HeaderActions(): ReactElement {
  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {/* Application change (ITAM): the assistant's ✨ leads the actions
            (2026-10-16, after NocoCRM's); it opens the Agents plugin's chat
            panel where it was left and closes it again. */}
        <AgentChatButton />
        {/* Application change (ITAM, 2026-10-17): no 通知 bell — notices
            are read in 收件箱, whose sidebar entry counts the unread. */}
        <ThemeSettings />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
