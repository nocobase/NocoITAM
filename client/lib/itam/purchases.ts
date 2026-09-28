import { useQuery } from '@tanstack/react-query';

import { useApi, type ItamRecord } from './api.js';
import { text } from './format.js';

/** Where a record's receipts are read, shared by a tab's count and its list. */
export function purchasesRequest(
  path: string,
  id: string,
): {
  readonly path: string;
  readonly queryKey: readonly unknown[];
  readonly distinct: string;
} {
  return {
    path: `${path}/${id}/purchases`,
    queryKey: ['itam', path, 'purchases', id],
    distinct: 'purchaseOrderId',
  };
}

export type OrderRow = { id: string } & Record<string, unknown>;

/**
 * The purchase orders a record came in through, newest first: receipts
 * arrive newest first, and an order delivered in batches is one row
 * carrying the total it delivered. `undefined` while loading.
 */
export function usePurchaseOrders(
  path: string,
  id: string,
): readonly OrderRow[] | undefined {
  const api = useApi();
  const request = purchasesRequest(path, id);
  const purchases = useQuery({
    queryKey: request.queryKey,
    queryFn: async () =>
      (await api.request<{ data: ItamRecord[] }>({ path: request.path })).data,
  });
  if (!purchases.data) return undefined;
  const orders: OrderRow[] = [];
  for (const receipt of purchases.data) {
    const key = text(receipt.purchaseOrderId);
    const existing = orders.find((order) => text(order.id) === key);
    const amount =
      receipt.unitPrice === null || receipt.unitPrice === undefined
        ? null
        : Number(receipt.unitPrice) * Number(receipt.quantity);
    if (existing) {
      existing.quantity = Number(existing.quantity) + Number(receipt.quantity);
      existing.amount =
        amount === null || existing.amount === null
          ? null
          : Number(existing.amount) + amount;
    } else {
      orders.push({
        id: key,
        orderNo: receipt.orderNo,
        reason: receipt.reason,
        status: receipt.status,
        vendorId: receipt.vendorId,
        orderedAt: receipt.orderedAt,
        currency: receipt.currency,
        quantity: Number(receipt.quantity),
        amount,
      });
    }
  }
  return orders;
}
