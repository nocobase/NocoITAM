import {
  realtimeClientToken,
  useApiClient,
  useService,
} from '@nocobase/app-client';
import {
  fetchUnreadCount,
  subscribeToInboxInvalidations,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { Link } from 'react-router';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * 通知 in the header (2026-10-05): the inbox left the sidebar with 待办, which
 * became the workbench's board. A dot says something is unread — no number,
 * so the header does not compete with the board's counts. The plugin's own
 * realtime invalidation and window focus keep it current.
 */
export function NotificationBell({
  className,
}: {
  readonly className: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const realtime = useService(realtimeClientToken);
  const queryClient = useQueryClient();
  const unread = useQuery({
    queryKey: ['notifications', 'in-app', 'unread-count'],
    queryFn: ({ signal }) => fetchUnreadCount(api, signal),
  });
  useEffect(
    () =>
      subscribeToInboxInvalidations(realtime, window, () => {
        void queryClient.invalidateQueries({
          queryKey: ['notifications', 'in-app', 'unread-count'],
        });
      }),
    [realtime, queryClient],
  );
  const label = t('navigation.notifications');
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link to='/inbox?tab=notifications' className={className} />}
        aria-label={label}
      >
        <span className='relative flex'>
          <Bell className='size-5' />
          {(unread.data ?? 0) > 0 ? (
            <span className='absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-card' />
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}
