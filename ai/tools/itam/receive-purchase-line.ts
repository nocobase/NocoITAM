import type { ToolsOptions } from '@nocobase/ai-employee';

import { recordTool } from './shared.js';

const tool: ToolsOptions = recordTool(
  'itam_receive_purchase_line',
  {
    title: 'ITAM: receive a purchase order line',
    about:
      'Receives goods on an ordered purchase order line once the user confirms.',
  },
  'Receive goods on ONE line of a purchase order that has been ordered. Read the order with itam_get_record first: its related.lines give each lineId, the item, quantity and receivedQuantity. By line type: a device line receives ONE device per call — quantity 1, serialNos [its serial], locationId required, extra {name?, departmentId?, warrantyEndDate?, ownerId?}; an accessory / consumable / component line adds a quantity — stockItemId of the record of that same model to join, or null with locationId and extra {name?, minimumQuantity?, ownerId?} to start a new one; a perpetual / subscription line adds seats — entitlementId to join (its terms stay as they are), or null with extra {name?, licensingModel, maintenanceExpiryDate?, productKey?, reassignable?, ownerId?} for a perpetual or {name?, billingModel, billingCycle, unitPrice?, expiryDate, autoRenew?, ownerId?} for a subscription. extra takes no other key. Never more than the line still has outstanding.',
);

export default tool;
