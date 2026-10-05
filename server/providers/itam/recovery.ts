import { asText, type Row } from './collection-query.js';
import { DEVICE_STATUSES } from './device-status.js';

/**
 * What is to be done with what somebody holds.
 *
 * Its own module because three places read it and none owns the others:
 * the nightly job that notifies, the endpoint the 归属 tab reads, and
 * master data, which takes the snapshot the moment somebody is marked as
 * having left.
 */

/**
 * What is to be done with one thing a leaver holds. The same judgements the
 * offboarding skill states in prose, as rules — because they are rules: which
 * of these applies follows from the record, not from reading it. The
 * assistant still does the reading and the proposing; this is only what the
 * nightly job can say without one.
 */
/**
 * The records a person answers for, and the column that names them: the
 * 负责人 (`ownerId`) everywhere but on a stocktake, which names its
 * executors.
 *
 * Offboarding's other half: not what somebody holds but what still has their
 * name on it, which no button settles — handing one over is a decision, and
 * for a purchase order or a disposal only its 负责人 or its creator may
 * make it. Keyed by **sign-in**, not by person record, so a person with no
 * linked account answers for nothing.
 *
 * Here rather than in master data because the 归属 tab reads it to list them
 * and the workbench reads it to know whether a leaver is settled, and neither
 * owns the other.
 */
export const OWNED_BY_USER: readonly {
  readonly collection: string;
  readonly field: string;
  readonly label: string;
  /** A second column joined to the first — a device reads 编号 / 名称. */
  readonly label2?: string;
  /** The asset type, as a constant or as the column that holds it. */
  readonly assetType?: { readonly value: string } | { readonly column: string };
  /**
   * The field holds a **list** of sign-ins rather than one, so it is matched
   * by reading and filtering rather than by a comparison — a JSON array
   * answers neither `=` nor `in` — and handing it over replaces this one
   * name in the list instead of overwriting it.
   */
  readonly list?: true;
  /**
   * A document is only waiting while it is still open: the statuses of the
   * ones that are, by the column that holds them. A purchase order completed
   * two years ago still names whoever raised it, and that is history rather
   * than a handover — without this the list of what somebody answers for
   * grew with every document they ever filed. An asset has no such notion
   * and declares none: a device's 负责人 must be somebody who is here for as
   * long as the register holds it.
   */
  readonly open?: {
    readonly column: string;
    readonly values: readonly string[];
  };
}[] = [
  {
    collection: 'devices',
    field: 'ownerId',
    label: 'deviceNo',
    label2: 'name',
    assetType: { value: 'device' },
  },
  {
    collection: 'stockItems',
    field: 'ownerId',
    label: 'name',
    // Accessory, consumable or component: the item itself says which.
    assetType: { column: 'kind' },
  },
  {
    collection: 'entitlements',
    field: 'ownerId',
    label: 'name',
    assetType: { value: 'entitlement' },
  },
  {
    collection: 'repairs',
    field: 'ownerId',
    label: 'repairNo',
    // A repair has no status of its own; `result` is `inProgress` until it
    // is finished, which is what 进行中的维修 counts.
    open: { column: 'result', values: ['inProgress'] },
  },
  {
    collection: 'purchaseOrders',
    field: 'ownerId',
    label: 'orderNo',
    // A rejected order is asked again rather than filed away, so it is
    // still open; completed and cancelled are not.
    open: {
      column: 'status',
      values: [
        'draft',
        'pendingApproval',
        'approved',
        'rejected',
        'ordered',
        'partiallyReceived',
      ],
    },
  },
  {
    collection: 'disposals',
    field: 'ownerId',
    label: 'disposalNo',
    // Same reading: rejected is resubmitted, executed is done.
    open: {
      column: 'status',
      values: ['draft', 'pendingApproval', 'approved', 'rejected'],
    },
  },
  {
    // A stocktake is run by the people it names, so somebody leaving
    // mid-count stalls it until another name is on it.
    collection: 'auditTasks',
    field: 'executorIds',
    label: 'name',
    list: true,
    // Open until it is finished or called off; a task left on
    // `pendingDifferences` is the most stalled of all, since resolving one
    // is the executors' own step.
    open: {
      column: 'status',
      values: ['notStarted', 'inProgress', 'pendingDifferences'],
    },
  },
  { collection: 'locations', field: 'ownerId', label: 'name' },
];

export type RecoveryHandling =
  /** Hand it back to stock: the ordinary case. */
  | 'return'
  /** At the repair shop, so returning it now would stop the record matching. */
  | 'wait'
  /** An accessory or component goes back to its stock item. */
  | 'takeBack'
  /** A consumable issued is usually used up; somebody has to say. */
  | 'confirmConsumed'
  /** A seat is reclaimed — and the account behind it still signs in. */
  | 'reclaim'
  /** Already out of use; nothing to recover. */
  | 'none';

export interface RecoveryItem {
  readonly kind: 'device' | 'stock' | 'seat';
  readonly id: string;
  readonly label: string;
  readonly handling: RecoveryHandling;
  /** Who answers for it, which is who the preparation is handed to. */
  readonly ownerId: string | null;
  /** The account a reclaimed seat leaves behind, when it carries one. */
  readonly account?: string;
  /**
   * What the handling is addressed to, which is not always the item: a stock
   * holding is taken back on its stock item and a seat is reclaimed on its
   * entitlement, so a page offering the action needs that id rather than the
   * row's own.
   */
  readonly targetId: string;
  /** How many are held, for a stock holding. */
  readonly quantity?: number;
  /** A device's status, which is what decided its handling. */
  readonly status?: string;
  /**
   * The repair a device in the shop is waiting on. The row does not offer
   * to finish it — that belongs to the repair and to its own 负责人 — but
   * it names it, because "wait" without saying what for is a dead end.
   */
  readonly waitingOn?: { readonly id: string; readonly label: string };
  /**
   * What is installed in it, for a device. A component belongs to the device
   * rather than to whoever holds it, and goes back inside it — so it is not
   * a line of its own to settle, but it has to be visible: handing the
   * laptop back hands these back with it.
   */
  readonly installed?: readonly {
    readonly id: string;
    /** The component's own record, which its name opens. */
    readonly stockItemId: string;
    readonly name: string;
    readonly quantity: number;
  }[];
  /**
   * Which of the five asset types it is, as the pages label them: a page
   * listing devices, stock and seats together needs to say which each row
   * is, and `kind` groups the three stock types under one name.
   */
  readonly assetType:
    | 'device'
    | 'accessory'
    | 'consumable'
    | 'component'
    | 'entitlement';
}

export function deviceHandling(status: string): RecoveryHandling {
  if (status === 'inRepair') return 'wait';
  if (status === 'inUse' || status === 'onLoan') return 'return';
  // Lost, retired, pending disposal, disposed: not in their hands to give back.
  return 'none';
}

/**
 * The sign-ins a list field names. The query layer decodes a JSON column,
 * but a row written before that was fixed still holds the string, so both
 * are read.
 */
export function namesIn(value: unknown): string[] {
  let decoded = value;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return [];
    }
  }
  return Array.isArray(decoded) ? decoded.map((id) => String(id)) : [];
}

/**
 * The device statuses offboarding has anything to say about, derived from
 * the rule above so a query can ask for them without stating the rule a
 * second time. The workbench counts a leaver's devices with this: one whose
 * only device was scrapped months ago has nothing waiting, and a card that
 * counted it would disagree with the page it opens.
 */
export const RECOVERABLE_DEVICE_STATUSES: readonly string[] =
  DEVICE_STATUSES.filter((status) => deviceHandling(status) !== 'none');

/**
 * What is to be done with a stock holding.
 *
 * In practice a person's holdings are accessories: issuing a consumable
 * records a `consume` movement and no holding — it is gone — and a component
 * installs on a device rather than on somebody. The other two answers stay
 * because the mapping is total and the kinds are data, not because a
 * recovery has been seen to contain one.
 */
export function stockHandling(kind: string): RecoveryHandling {
  return kind === 'consumable' ? 'confirmConsumed' : 'takeBack';
}

/** Everything a leaver holds, each with what is to be done with it. */
export function recoveryPlan(holdings: {
  readonly devices: readonly Row[];
  readonly stock: readonly Row[];
  readonly entitlementSeats: readonly Row[];
  readonly installed?: readonly Row[];
  readonly openRepairs?: readonly Row[];
}): readonly RecoveryItem[] {
  const repairOn = (deviceId: string) => {
    const row = (holdings.openRepairs ?? []).find(
      (entry) => String(entry.deviceId) === deviceId,
    );
    return row
      ? { id: String(row.id), label: asText(row.repairNo) ?? String(row.id) }
      : undefined;
  };
  const installedIn = (deviceId: string) =>
    (holdings.installed ?? [])
      .filter((row) => String(row.holderId ?? row.deviceId) === deviceId)
      .map((row) => ({
        id: String(row.id),
        stockItemId: asText(row.stockItemId) ?? '',
        name: asText(row.name) ?? '',
        quantity: Number(row.quantity) || 0,
      }));
  return [
    ...holdings.devices.map((row) => ({
      kind: 'device' as const,
      id: String(row.id),
      label: `${asText(row.deviceNo) ?? ''} / ${asText(row.name) ?? ''}`.trim(),
      handling: deviceHandling(asText(row.status) ?? ''),
      ownerId: asText(row.ownerId) ?? null,
      // A device is returned on itself.
      targetId: String(row.id),
      status: asText(row.status) ?? '',
      assetType: 'device' as const,
      installed: installedIn(String(row.id)),
      ...(deviceHandling(asText(row.status) ?? '') === 'wait'
        ? { waitingOn: repairOn(String(row.id)) }
        : {}),
    })),
    ...holdings.stock.map((row) => ({
      kind: 'stock' as const,
      id: String(row.id),
      label: asText(row.name) ?? '',
      handling: stockHandling(asText(row.kind) ?? ''),
      ownerId: asText(row.ownerId) ?? null,
      targetId: asText(row.stockItemId) ?? '',
      quantity: Number(row.quantity) || 0,
      assetType: (asText(row.kind) ??
        'accessory') as RecoveryItem['assetType'],
    })),
    ...holdings.entitlementSeats.map((row) => ({
      kind: 'seat' as const,
      id: String(row.id),
      label: asText(row.name) ?? '',
      handling: 'reclaim' as const,
      ownerId: asText(row.ownerId) ?? null,
      ...(asText(row.account) ? { account: asText(row.account) } : {}),
      targetId: asText(row.entitlementId) ?? '',
      assetType: 'entitlement' as const,
    })),
  ];
}
