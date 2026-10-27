import type { LineItemType } from './procurement.js';
import { createUuid } from '@nocobase/app-client';

/**
 * A purchase order line while it is being written, shared by the lines card
 * (`client/pages/itam/procurement/lines-tab.tsx`, which keeps the same shape
 * as `LineDraft`) and the create-order dialog.
 */
export interface PurchaseLineDraft {
  readonly key: string;
  readonly id?: string;
  readonly itemType: LineItemType;
  readonly modelId: string | null;
  readonly softwareProductId: string | null;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly receivedQuantity: number;
}

const HARDWARE = new Set<string>([
  'device',
  'accessory',
  'consumable',
  'component',
]);
const ENTITLEMENT = new Set<string>(['perpetual', 'subscription']);

/** A fresh line: a device, one of it, no price yet. */
export function newPurchaseLine(): PurchaseLineDraft {
  return {
    key: createUuid(),
    itemType: 'device',
    modelId: null,
    softwareProductId: null,
    quantity: 1,
    unitPrice: '',
    receivedQuantity: 0,
  };
}

/** What the server would refuse, said before the save rather than after. */
export function purchaseLineIncomplete(line: PurchaseLineDraft): boolean {
  return (
    (HARDWARE.has(line.itemType) && !line.modelId) ||
    (ENTITLEMENT.has(line.itemType) && !line.softwareProductId) ||
    line.quantity < 1
  );
}

/**
 * A line as `PUT /itam/purchase-orders/:id/lines` takes it. An empty price is
 * sent as null, which the service leaves alone for a reader who may not see
 * prices, rather than a zero it would write.
 */
export function purchaseLinePayload(line: PurchaseLineDraft): {
  id?: string;
  itemType: LineItemType;
  modelId: string | null;
  softwareProductId: string | null;
  quantity: number;
  unitPrice: number | null;
} {
  return {
    id: line.id,
    itemType: line.itemType,
    modelId: HARDWARE.has(line.itemType) ? line.modelId : null,
    softwareProductId: ENTITLEMENT.has(line.itemType)
      ? line.softwareProductId
      : null,
    quantity: line.quantity,
    unitPrice: line.unitPrice === '' ? null : Number(line.unitPrice),
  };
}
