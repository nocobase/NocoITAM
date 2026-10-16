import {
  realtimeClientToken,
  useApiClient,
  useService,
} from '@nocobase/app-client';
import {
  fetchUnreadCount,
  subscribeToInboxInvalidations,
} from '@nocobase/app-plugin-notification-in-app/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useInboxCount } from './agents.js';
import { useWorkCards } from './my-work.js';

/**
 * The numbers beside the sidebar's 待办 and 收件箱 (2026-10-17, asked for
 * by the product owner). 待办: every to-do on the board, in the scope the
 * workbench is set to (全部 / 我负责的), kept live with it. 收件箱: what
 * waits on the reader's decision and the notifications they have not read —
 * a departure from frontend-standard §S1, which counts decisions only: the
 * inbox is where notifications are read now, and a number that stayed at
 * zero while unread notices piled up was asked to change.
 */
export function useNavigationCounts(): {
  readonly workbench: number;
  readonly inbox: number;
} {
  const api = useApiClient();
  const realtime = useService(realtimeClientToken);
  const queryClient = useQueryClient();
  const cards = useWorkCards();
  const decisions = useInboxCount().data ?? 0;
  // The same query, and the same live refresh, as the header's bell.
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
  return {
    workbench: cards.reduce((sum, card) => sum + card.count, 0),
    inbox: decisions + (unread.data ?? 0),
  };
}
