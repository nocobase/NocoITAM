import { useTranslation } from '@nocobase/i18n/client';
import { MonitorCog, Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

import { NotificationBell } from '@/components/itam/notification-bell';

import { ThemeSettings } from '../../theme/index.js';
import { UserMenu } from './user-menu.js';
import { AiHeaderButton } from '../ai-panel.js';

const ACTION_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** Keep header entries visible on their destination pages so navigation stays consistent across surfaces. */
export function HeaderActions({
  showSettings,
  showDev,
  showNotifications = false,
  showAssistant = false,
}: {
  readonly showSettings: boolean;
  readonly showDev: boolean;
  /** Application change (ITAM): only the app layout shows 通知. */
  readonly showNotifications?: boolean;
  /**
   * Application change (ITAM): the assistant's entry, beside the reader's
   * menu, in place of the plugin's floating launcher (2026-10-06).
   */
  readonly showAssistant?: boolean;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {/* The dev entry sits left of settings and exists only while developing: a production build evaluates this to
          false and drops the link along with the whole dev surface it points at. */}
        {showDev ? (
          <Tooltip>
            <TooltipTrigger
              render={<Link to='/dev' className={ACTION_LINK_CLASS} />}
              aria-label={t('dev.componentExamples', {
                defaultValue: 'Component examples',
              })}
            >
              <MonitorCog className='size-5' />
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              {t('dev.componentExamples', {
                defaultValue: 'Component examples',
              })}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {/* Application change (ITAM): 通知 lives here since it left the
          sidebar with the 待办 page (2026-10-05). */}
        {showNotifications ? (
          <NotificationBell className={ACTION_LINK_CLASS} />
        ) : null}
        {showSettings ? (
          <Tooltip>
            <TooltipTrigger
              render={<Link to='/settings' className={ACTION_LINK_CLASS} />}
              aria-label={t('settings.title', { defaultValue: 'Settings' })}
            >
              <Settings className='size-5' />
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              {t('settings.title', { defaultValue: 'Settings' })}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <ThemeSettings />
        {showAssistant ? (
          <AiHeaderButton className={ACTION_LINK_CLASS} />
        ) : null}
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
