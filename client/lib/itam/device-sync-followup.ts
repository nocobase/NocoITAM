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
  if (!shared)
    return t('deviceSyncRun.ownDifferences', {
      count: run.result.items.length,
    });
  // What the asset managers have, by kind and counted in devices
  // (2026-10-21): the records only MDM has, and the register's devices
  // nobody answers for — "3 处差异" did not say which.
  const items = run.result.items;
  const onlyInMdm = new Set(
    items.filter((item) => item.kind === 'unregistered').map((i) => i.subject),
  ).size;
  const unowned = new Set(
    items.filter((item) => item.kind !== 'unregistered').map((i) => i.subject),
  ).size;
  const parts = [
    onlyInMdm
      ? t('deviceSyncRun.sharedParts.onlyInMdm', { count: onlyInMdm })
      : null,
    unowned ? t('deviceSyncRun.sharedParts.unowned', { count: unowned }) : null,
  ].filter(Boolean);
  return t('deviceSyncRun.sharedDevices', {
    parts: parts.join(t('deviceSyncRun.sharedParts.separator')),
  });
}

/**
 * The run 收件箱 has picked, around MDM 核对 shown beside it: the page's
 * 等你决定 then shows that one alone.
 */
export const FollowUpFocusContext = createContext<string | null>(null);
