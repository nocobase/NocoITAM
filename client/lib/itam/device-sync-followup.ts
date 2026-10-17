import { createContext } from 'react';

import type { DeviceSyncRun } from './agents.js';

/**
 * What an MDM 跟进 is about, by whom it is for (2026-10-17): the devices
 * the reader answers for, or what the asset managers settle — the platform
 * records and the devices nobody answers for.
 */
export function followUpTitle(
  run: DeviceSyncRun,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const shared = run.subjectId.startsWith('shared:');
  if (!run.result)
    return t(shared ? 'deviceSyncRun.sharedTitle' : 'deviceSyncRun.ownTitle');
  return t(
    shared ? 'deviceSyncRun.sharedDifferences' : 'deviceSyncRun.ownDifferences',
    { count: run.result.items.length },
  );
}

/**
 * The run 收件箱 has picked, around MDM 核对 shown beside it: the page's
 * 等你决定 then shows that one alone.
 */
export const FollowUpFocusContext = createContext<string | null>(null);
