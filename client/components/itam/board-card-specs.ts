import {
  Banknote,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Laptop,
  MonitorX,
  Store,
  TriangleAlert,
  User,
  Wrench,
} from 'lucide-react';

import { createElement } from 'react';

import type { BoardCardSpec } from '@/components/itam/board-cards';
import { OverdueBadge } from '@/components/itam/overdue-badge';
import { PurchaseOrderStatusBadge } from '@/components/itam/status-badge';
import { formatDate, text } from '@/lib/itam/format';
import {
  AUDIT_TASK_FIELDS,
  DISPOSAL_FIELDS,
  REPAIR_FIELDS,
} from '@/lib/itam/operations';
import { PO_FIELDS } from '@/lib/itam/procurement';

/*
 * How each document reads as a card, wherever it shows as one: its own
 * status board and the workbench's columns draw the same card from the
 * same spec, so a purchase order, a stocktake or a disposal looks the same
 * on both.
 */

export const PURCHASE_ORDER_CARD: BoardCardSpec = {
  fields: PO_FIELDS,
  nameField: 'orderNo',
  kind: 'purchaseOrders',
  card: {
    // The amount under the number, then who it is bought from — each with
    // its icon, since a figure and a company name say little on their own.
    // The reason is on the order; a card is for telling orders apart.
    lines: [
      { part: 'estimatedTotal', icon: Banknote },
      { part: 'vendorId', icon: Store },
      // Last, on a line of its own: 到货逾期 N 天 while an order still waits on
      // goods past the date the vendor gave (2026-10-05) — beside the number
      // it squeezed the number out, and first it would have pushed the
      // amount into the muted lines. The same card is the purchase board's
      // and the workbench's 待验收到货 column's, so both say it.
      (record) =>
        ['ordered', 'partiallyReceived'].includes(text(record.status))
          ? // A tag is taller than a text line: without the room above it
            // the tag pressed against the vendor's name.
            createElement(OverdueBadge, {
              date: record.expectedAt,
              className: 'mt-1',
            })
          : null,
    ],
    // When it was raised, to the minute: orders raised the same day are
    // otherwise indistinguishable on a card.
    footer: ['ownerId', (record) => formatDate(record.createdAt, true)],
  },
};

/**
 * A purchase order on the workbench's 采购中 column, which holds orders at
 * several steps — to place, to receive, partly received — where its own
 * board says the step by column. Under the vendor, the step it is at, and
 * beside it 到货逾期 when the goods are late, on one line of tags.
 */
export const PURCHASING_CARD: BoardCardSpec = {
  ...PURCHASE_ORDER_CARD,
  card: {
    ...PURCHASE_ORDER_CARD.card,
    lines: [
      { part: 'estimatedTotal', icon: Banknote },
      { part: 'vendorId', icon: Store },
      (record) =>
        createElement(
          'span',
          { className: 'mt-1 flex items-center gap-1.5' },
          createElement(PurchaseOrderStatusBadge, { status: record.status }),
          ['ordered', 'partiallyReceived'].includes(text(record.status))
            ? createElement(OverdueBadge, { date: record.expectedAt })
            : null,
        ),
    ],
  },
};

export const AUDIT_CARD: BoardCardSpec = {
  fields: AUDIT_TASK_FIELDS,
  nameField: 'name',
  kind: 'auditTasks',
  card: {
    // The same shape as the others: the name alone on its line, then the
    // period, how far the count has got and what it found, each with its
    // icon, then who answers for it and when it was raised.
    lines: [
      {
        part: (record, t) =>
          t('board.period', {
            from: formatDate(record.plannedStart),
            to: formatDate(record.plannedEnd),
          }),
        icon: CalendarRange,
      },
      {
        part: (record, t) =>
          record.status === 'notStarted'
            ? t('board.expected', { count: Number(record.expectedCount ?? 0) })
            : t('board.counted', {
                counted: Number(record.countedCount ?? 0),
                expected: Number(record.expectedCount ?? 0),
              }),
        icon: ClipboardCheck,
      },
      {
        part: (record, t) =>
          Number(record.differenceCount ?? 0) > 0
            ? t('board.differences', {
                count: Number(record.differenceCount),
              })
            : null,
        icon: TriangleAlert,
      },
    ],
    footer: ['ownerId', (record) => formatDate(record.createdAt, true)],
  },
};

export const DISPOSAL_CARD: BoardCardSpec = {
  fields: DISPOSAL_FIELDS,
  nameField: 'disposalNo',
  kind: 'disposals',
  card: {
    // The same shape as a purchase order's: what it is worth, then how it
    // goes and how much of it there is, each line with its icon.
    lines: [
      { part: 'bookValueTotal', icon: Banknote },
      // How it goes and how much of it, as one line: 销毁 · 3 台设备.
      {
        part: (record, t) =>
          [
            t(
              DISPOSAL_FIELDS.find(
                (field) => field.key === 'method',
              )?.options?.find((option) => option.value === record.method)
                ?.label ?? text(record.method),
            ),
            t('board.deviceCount', { count: Number(record.deviceCount ?? 0) }),
          ]
            .filter(Boolean)
            .join(' · '),
        icon: MonitorX,
      },
    ],
    footer: ['ownerId', (record) => formatDate(record.createdAt, true)],
  },
};

/**
 * A repair has no board of its own; this is how it reads on the
 * workbench's 维修中 column, in the same shape as the others.
 */
export const REPAIR_CARD: BoardCardSpec = {
  fields: REPAIR_FIELDS,
  nameField: 'repairNo',
  kind: 'repairs',
  card: {
    lines: [
      { part: 'deviceId', icon: Laptop },
      // As plain text, so it truncates to its line: the field's own
      // renderer folds long text behind 展开, which a card has no room for.
      { part: (record) => text(record.faultDescription), icon: Wrench },
      {
        part: (record, t) =>
          record.expectedReturnAt
            ? t('board.expectedReturn', {
                date: formatDate(record.expectedReturnAt),
              })
            : null,
        icon: CalendarClock,
      },
    ],
    footer: ['ownerId', (record) => formatDate(record.createdAt, true)],
  },
};

/**
 * An overdue loan on the workbench, drawn from the to-do itself: the device
 * as its heading, then whom it is lent to and when it was due back.
 */
export const LOAN_CARD: BoardCardSpec = {
  fields: [],
  nameField: 'title',
  card: {
    lines: [
      {
        part: (record, t) =>
          record.subtitle
            ? t('workbench.work.lentTo', { name: text(record.subtitle) })
            : null,
        icon: User,
      },
      {
        part: (record, t) =>
          record.date
            ? t('workbench.work.dueBack', { date: formatDate(record.date) })
            : null,
        icon: CalendarClock,
      },
      // How many days past it (2026-10-22), as a late delivery says it.
      (record) =>
        createElement(OverdueBadge, {
          date: record.date,
          label: 'workbench.work.loanOverdueDays',
          className: 'mt-1',
        }),
    ],
    // Who answers for it, as every document card's footer says (2026-10-17),
    // and that it is the reader's own: the column lists everybody's.
    footer: [
      (record) => (record.owner ? text(record.owner) : null),
      (record, t) => (record.mine ? t('workbench.work.yours') : null),
    ],
  },
};
