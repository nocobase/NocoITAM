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
  /**
   * The to-do it came from, on a column that merges several (人员变动,
   * 设备跟进): how it is drawn, and the small tag that says which it is.
   */
  readonly origin?: string;
}

export interface WorkCard {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly records: readonly CardRecord[];
  /** Where "see all" goes; several when one card merges several to-dos. */
  readonly links: readonly { readonly label: string; readonly url: string }[];
  /**
   * MDM 核对: each tab a count that opens it (2026-10-15; the differences
   * too, by kind, rather than a card a device, 2026-10-22). Only those with
   * something in them.
   */
  readonly summary?: readonly {
    readonly key: 'checks' | 'unregistered' | 'unmanaged';
    readonly count: number;
    readonly url: string;
    /** 信息不一致's count of each kind. */
    readonly kinds?: Partial<
      Record<'stale' | 'userMismatch' | 'statusMismatch', number>
    >;
  }[];
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
    // First after the approvals: 人员变动, somebody leaving with the
    // company's equipment or joining without theirs yet (2026-10-17: one
    // column for 离职交接 and 入职准备, so fewer columns run off the board).
    'people',
    // 待下单 and 待到货入库 as one column, 采购中 (2026-10-06).
    'purchasing',
    'pendingDisposalExecution',
    // 设备跟进: devices away — at the repairer, or lent and overdue
    // (2026-10-17, 维修中 and 借出逾期 as one column).
    'devices',
    // Device sync (2026-10-15): only while a platform is connected.
    'deviceChecks',
    'activeAudits',
  ]) {
    if (key === 'people' || key === 'devices') {
      const merged = mergedCard(
        key,
        key === 'people'
          ? [find('leaverRecovery'), find('pendingOnboarding')]
          : // Overdue loans first: they are late; a repair is only away.
            [find('loansDueToday'), find('activeRepairs')],
        t,
        TAGGED,
      );
      if (merged) cards.push(merged);
      continue;
    }
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
    // MDM 核对 counts every tab, one card each (2026-10-22: the
    // differences were a card a device, which read as a list of their own).
    const devicesChecked = key === 'deviceChecks';
    const summary = devicesChecked
      ? [
          ...(item.count > 0
            ? [
                {
                  key: 'checks' as const,
                  count: item.count,
                  url: '/device-sync?view=checks',
                  ...(item.summary?.checks
                    ? { kinds: item.summary.checks }
                    : {}),
                },
              ]
            : []),
          ...(['unregistered', 'unmanaged'] as const).flatMap((view) => {
            const count = item.summary?.[view] ?? 0;
            return count > 0
              ? [{ key: view, count, url: `/device-sync?view=${view}` }]
              : [];
          }),
        ]
      : [];
    cards.push({
      key,
      label: t(`workbench.work.${key}`),
      count: devicesChecked
        ? summary.reduce((sum, entry) => sum + entry.count, 0)
        : item.count,
      ...(summary.length > 0 ? { summary } : {}),
      records: devicesChecked
        ? []
        : tag
          ? item.records.map((record) => ({ ...record, tag }))
          : item.records,
      links:
        !devicesChecked && item.count > MY_WORK_PREVIEW
          ? [{ label: t('workbench.seeAll'), url: item.url }]
          : [],
    });
  }

  return cards;
}

/**
 * One column for several to-dos (人员变动, 设备跟进): each record remembers
 * the to-do it came from (`origin`), the counts add up, and each to-do keeps
 * its own "see all" past the preview. The to-dos stay separate underneath,
 * each granted and scoped by its own act.
 */
function mergedCard(
  key: 'people' | 'devices',
  items: readonly (MyWorkItem | undefined)[],
  t: (key: string) => string,
  tagged: Readonly<Record<string, DocumentKind>>,
): WorkCard | undefined {
  const present = items.filter((item): item is MyWorkItem => Boolean(item));
  if (present.length === 0) return undefined;
  return {
    key,
    label: t(`workbench.work.${key}`),
    count: present.reduce((sum, item) => sum + item.count, 0),
    records: present
      .flatMap((item) =>
        item.records.map((record) => ({
          ...record,
          origin: item.key,
          ...(tagged[item.key] ? { tag: tagged[item.key] } : {}),
        })),
      )
      .slice(0, MY_WORK_PREVIEW),
    links: present.flatMap((item) =>
      item.count > MY_WORK_PREVIEW
        ? [{ label: t(`workbench.work.${item.key}`), url: item.url }]
        : [],
    ),
  };
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
