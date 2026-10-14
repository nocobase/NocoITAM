import { useTranslation } from '@nocobase/i18n/client';

import type { DocumentKind } from './document-kinds.js';
import { todayIso } from './format.js';
import {
  MY_WORK_PREVIEW,
  useMyWork,
  type MyWorkItem,
  type MyWorkRecord,
} from './workbench.js';

/**
 * A record on a card, with the kind tag the merged approval card needs. The
 * kind, not its label: the tag carries the icon of that kind's own
 * navigation entry, which a translated string could not say.
 */
export interface CardRecord extends MyWorkRecord {
  readonly tag?: DocumentKind;
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
    const tagged = (
      item: MyWorkItem | undefined,
      tag: DocumentKind,
    ): CardRecord[] =>
      (item?.records ?? []).map((record) => ({ ...record, tag }));
    cards.push({
      key: 'pendingApprovals',
      label: t('workbench.work.pendingApprovals'),
      count: (purchase?.count ?? 0) + (disposal?.count ?? 0),
      // Oldest first across both kinds: what has waited longest comes first.
      records: [
        ...tagged(purchase, 'purchaseOrders'),
        ...tagged(disposal, 'disposals'),
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
  const TAGGED: Readonly<Record<string, DocumentKind>> = {
    pendingOrders: 'purchaseOrders',
    awaitingReceipt: 'purchaseOrders',
    activeRepairs: 'repairs',
    pendingDisposalExecution: 'disposals',
  };
  for (const key of [
    // First after the approvals: somebody has left with the company's
    // equipment, which was the one `critical` rule while this was a reminder.
    // A person names themselves, so these records take no tag.
    'leaverRecovery',
    'pendingOnboarding',
    // 待下单 and 待到货入库 as one column, 采购中 (2026-10-06).
    'purchasing',
    'pendingDisposalExecution',
    'activeRepairs',
    'loansDueToday',
    // Device sync (2026-10-15): only while a platform is connected.
    'deviceChecks',
    'activeAudits',
  ]) {
    if (key === 'purchasing') {
      const merged = purchasingCard(
        find('pendingOrders'),
        find('awaitingReceipt'),
        t,
      );
      if (merged) cards.push(merged);
      continue;
    }
    const item = find(key);
    if (!item) continue;
    const tag = TAGGED[key];
    cards.push({
      key,
      label: t(`workbench.work.${key}`),
      count: item.count,
      records: tag
        ? item.records.map((record) => ({ ...record, tag }))
        : item.records,
      links:
        item.count > MY_WORK_PREVIEW
          ? [{ label: t('workbench.seeAll'), url: item.url }]
          : [],
    });
  }

  return cards;
}

/**
 * 采购中: an approved purchase order from the moment nobody has placed it
 * until its goods are all in — 待下单 and 待到货入库, which follow one order
 * through and are the same people's to do, in one column (2026-10-06). The
 * two stay separate to-dos underneath, each granted by its own act (`order`,
 * `receive`), so the column holds only what the reader can move on. The
 * card's status says which step it is at. Overdue deliveries come first,
 * then the orders still to place (needed soonest first), then the rest of
 * the deliveries (expected soonest first).
 */
function purchasingCard(
  toPlace: MyWorkItem | undefined,
  toReceive: MyWorkItem | undefined,
  t: (key: string) => string,
): WorkCard | undefined {
  if (!toPlace && !toReceive) return undefined;
  const today = todayIso();
  const tagged = (item: MyWorkItem | undefined): CardRecord[] =>
    (item?.records ?? []).map((record) => ({
      ...record,
      tag: 'purchaseOrders',
    }));
  const receiving = tagged(toReceive);
  const overdue = receiving.filter(
    (record) => record.date !== null && record.date < today,
  );
  return {
    key: 'purchasing',
    label: t('workbench.work.purchasing'),
    count: (toPlace?.count ?? 0) + (toReceive?.count ?? 0),
    records: [
      ...overdue,
      ...tagged(toPlace),
      ...receiving.filter((record) => !overdue.includes(record)),
    ].slice(0, MY_WORK_PREVIEW),
    links: [toPlace, toReceive].flatMap((item) =>
      item && item.count > MY_WORK_PREVIEW
        ? [{ label: t(`workbench.work.${item.key}`), url: item.url }]
        : [],
    ),
  };
}
