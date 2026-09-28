import type { ToolsOptions } from '@nocobase/ai-employee';

import { recordTool } from './shared.js';

const tool: ToolsOptions = recordTool(
  'itam_stock_in',
  {
    title: 'ITAM: stock in',
    about: 'Adds a quantity to a stock record once the user confirms.',
  },
  'Add a quantity to ONE existing stock record (accessory, consumable or component) that did not arrive through a purchase order; goods bought on an order arrive with itam_receive_purchase_line instead.',
);

export default tool;
