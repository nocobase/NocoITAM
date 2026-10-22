import { createContext } from 'react';

import type { DeviceSyncResult, DeviceSyncRun } from './agents.js';

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
    shared ? 'deviceSyncRun.sharedDevices' : 'deviceSyncRun.ownDevices',
    {
      parts: followUpParts(run.result.items, t, shared),
    },
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * What a follow-up holds, by kind and counted in devices (2026-10-21): the
 * asset managers' as the records only MDM has and the devices nobody
 * answers for; a person's by MDM 核对's tabs — 信息不一致, 只在台账 — so the
 * title says where to look. A device with two differences counts once.
 */
export function followUpParts(
  items: DeviceSyncResult['items'],
  t: Translate,
  shared: boolean,
): string {
  const devices = (kinds: (kind: string) => boolean) =>
    new Set(items.filter((item) => kinds(item.kind)).map((i) => i.subject))
      .size;
  const counts: [string, number][] = shared
    ? [
        ['onlyInMdm', devices((kind) => kind === 'unregistered')],
        ['unowned', devices((kind) => kind !== 'unregistered')],
      ]
    : [
        // 只在台账 before 信息不一致, as asked (2026-10-21).
        ['onlyInMdm', devices((kind) => kind === 'unregistered')],
        ['onlyOnRegister', devices((kind) => kind === 'unmanaged')],
        [
          'mismatch',
          devices((kind) => kind !== 'unregistered' && kind !== 'unmanaged'),
        ],
      ];
  return counts
    .filter(([, count]) => count > 0)
    .map(([key, count]) => t(`deviceSyncRun.sharedParts.${key}`, { count }))
    .join(t('deviceSyncRun.sharedParts.separator'));
}

/** MDM 核对's tabs, which a follow-up is split by (2026-10-22). */
export type FollowUpTab = 'checks' | 'unregistered' | 'unmanaged';

const TABS: readonly FollowUpTab[] = ['checks', 'unregistered', 'unmanaged'];

/** The tab an item of a follow-up is listed under. */
export const itemTab = (kind: string): FollowUpTab =>
  kind === 'unregistered'
    ? 'unregistered'
    : kind === 'unmanaged'
      ? 'unmanaged'
      : 'checks';

/**
 * Whose part a follow-up is and which tab it is for, from its subject
 * (`owner:<id>:<tab>`, `shared:<id>:<tab>`). One from before tabs stands
 * under its first item's tab.
 */
export function followUpPlace(run: DeviceSyncRun): {
  readonly part: 'own' | 'shared';
  readonly tab: FollowUpTab;
} {
  const [part, , tab] = run.subjectId.split(':');
  return {
    part: part === 'shared' ? 'shared' : 'own',
    tab: TABS.includes(tab as FollowUpTab)
      ? (tab as FollowUpTab)
      : itemTab(run.result?.items?.[0]?.kind ?? 'checks'),
  };
}

/**
 * The run 收件箱 has picked, around MDM 核对 shown beside it: the page's
 * 等你决定 then shows that one alone.
 */
export const FollowUpFocusContext = createContext<string | null>(null);
