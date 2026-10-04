import { asText, type Row } from './collection-query.js';

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
