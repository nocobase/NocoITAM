import { useTranslation } from '@nocobase/i18n/client';

import {
  MY_WORK_PREVIEW,
  useMyWork,
  type MyWorkItem,
  type MyWorkRecord,
} from './workbench.js';

/** A record on a card, with the kind tag the merged approval card needs. */
export interface CardRecord extends MyWorkRecord {
  readonly tag?: string;
}

export interface WorkCard {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly records: readonly CardRecord[];
  /** Where "see all" goes; several when one card merges several to-dos. */
  readonly links: readonly { readonly label: string; readonly url: string }[];
}

/**
 * The to-dos waiting on the signed-in user, merged and tagged for display.
 *
 * Both places that show them read this: the workbench's compact strip below,
 * and 我的待办, which lays the same cards out as a queue beside the item
 * being worked on. Which records are waiting, and the merging of the two
 * kinds of approval into one card, is decided once.
 */
export function useWorkCards(): readonly WorkCard[] {
  const { t } = useTranslation();
  const work = useMyWork();
  const items = work.data ?? [];
  const find = (key: string) => items.find((item) => item.key === key);
  const cards: WorkCard[] = [];

  // 待我审批 is one card for both kinds of request, each record tagged with
  // the kind it is. The two stay separate to-dos underneath, because each
  // has its own count and its own list to land on.
  const purchase = find('pendingPurchaseApprovals');
  const disposal = find('pendingDisposalApprovals');
  if (purchase || disposal) {
    const tagged = (item: MyWorkItem | undefined, tag: string): CardRecord[] =>
      (item?.records ?? []).map((record) => ({ ...record, tag: t(tag) }));
    cards.push({
      key: 'pendingApprovals',
      label: t('workbench.work.pendingApprovals'),
      count: (purchase?.count ?? 0) + (disposal?.count ?? 0),
      // Oldest first across both kinds: what has waited longest comes first.
      records: [
        ...tagged(purchase, 'workbench.work.tagPurchase'),
        ...tagged(disposal, 'workbench.work.tagDisposal'),
      ]
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        .slice(0, MY_WORK_PREVIEW),
      links: [purchase, disposal].flatMap((item) =>
        item && item.count > MY_WORK_PREVIEW
          ? [{ label: t(`workbench.work.${item.key}`), url: item.url }]
          : [],
      ),
    });
  }

  // A record whose title is only a number says nothing about what it is, so
  // it carries a tag; a device (编号 / 名称) and an audit task (its name)
  // name themselves and take none.
  const TAGGED: Readonly<Record<string, string>> = {
    awaitingReceipt: 'workbench.work.tagPurchase',
    activeRepairs: 'workbench.work.tagRepair',
    pendingDisposalExecution: 'workbench.work.tagDisposal',
  };
  for (const key of [
    // First after the approvals: somebody has left with the company's
    // equipment, which was the one `critical` rule while this was a reminder.
    // A person names themselves, so these records take no tag.
    'leaverRecovery',
    'awaitingReceipt',
    'pendingDisposalExecution',
    'activeRepairs',
    'activeAudits',
    'loansDueToday',
  ]) {
    const item = find(key);
    if (!item) continue;
    const tag = TAGGED[key];
    cards.push({
      key,
      label: t(`workbench.work.${key}`),
      count: item.count,
      records: tag
        ? item.records.map((record) => ({ ...record, tag: t(tag) }))
        : item.records,
      links:
        item.count > MY_WORK_PREVIEW
          ? [{ label: t('workbench.seeAll'), url: item.url }]
          : [],
    });
  }

  return cards;
}
