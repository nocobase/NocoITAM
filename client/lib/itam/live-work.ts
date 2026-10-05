import { realtimeClientToken, useService } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { WORKBENCH_PATH } from './workbench.js';

/**
 * The topic the server signals on after every ITAM write
 * (`server/providers/itam/changes.ts`). It carries no data: what a to-do
 * holds depends on who reads it, so each page asks again.
 */
const ITAM_CHANGES_TOPIC = 'itam:changes';

/**
 * Keeps 我的待办 and 需要关注 current while a page stays open (2026-10-05):
 * on a change signal, and whenever the realtime connection (re)opens —
 * signals sent while it was down are not replayed — the workbench queries
 * are marked stale, so the ones on screen fetch again and the rest do when
 * next shown. Mounted once, by the app layout.
 */
export function useLiveWork(): void {
  const realtime = useService(realtimeClientToken);
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () =>
      void queryClient.invalidateQueries({
        queryKey: ['itam', WORKBENCH_PATH],
      });
    const stopOpen = realtime.onOpen(refresh);
    const stopTopic = realtime.subscribe(ITAM_CHANGES_TOPIC, refresh);
    return () => {
      stopTopic();
      stopOpen();
    };
  }, [realtime, queryClient]);
}
