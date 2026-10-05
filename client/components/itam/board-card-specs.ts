import {
  Banknote,
  CalendarClock,
  Laptop,
  MonitorX,
  Store,
  Wrench,
} from 'lucide-react';

import type { BoardCardSpec } from '@/components/itam/board-cards';
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
  card: {
    // The amount under the number, then who it is bought from — each with
    // its icon, since a figure and a company name say little on their own.
    // The reason is on the order; a card is for telling orders apart.
    lines: [
      { part: 'estimatedTotal', icon: Banknote },
      { part: 'vendorId', icon: Store },
    ],
    // When it was raised, to the minute: orders raised the same day are
    // otherwise indistinguishable on a card.
    footer: ['ownerId', (record) => formatDate(record.createdAt, true)],
  },
};

export const AUDIT_CARD: BoardCardSpec = {
  fields: AUDIT_TASK_FIELDS,
  nameField: 'name',
  card: {
    // Counted out of expected: how far the count has got.
    meta: (record) =>
      record.status === 'notStarted'
        ? null
        : `${Number(record.countedCount ?? 0)} / ${Number(record.expectedCount ?? 0)}`,
    lines: [
      (record, t) =>
        t('board.period', {
          from: formatDate(record.plannedStart),
          to: formatDate(record.plannedEnd),
        }),
      (record, t) =>
        Number(record.differenceCount ?? 0) > 0
          ? t('board.differences', {
              count: Number(record.differenceCount),
            })
          : null,
    ],
    footer: [
      (record, t) =>
        t('board.expected', { count: Number(record.expectedCount ?? 0) }),
    ],
  },
};

export const DISPOSAL_CARD: BoardCardSpec = {
  fields: DISPOSAL_FIELDS,
  nameField: 'disposalNo',
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
 * workbench's 进行中的维修 column, in the same shape as the others.
 */
export const REPAIR_CARD: BoardCardSpec = {
  fields: REPAIR_FIELDS,
  nameField: 'repairNo',
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
