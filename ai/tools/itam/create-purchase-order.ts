import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_create_purchase_order',
  {
    title: 'ITAM: draft a purchase order',
    about:
      'Creates a draft purchase order with its lines once the user confirms.',
  },
  'Create a DRAFT purchase order raised by the user: reason, vendorId, lines (itemType with modelId for hardware or softwareProductId for software, quantity, optional unitPrice). Submitting it for approval is a step the user takes on the order page, where they choose the approver.',
);

export default tool;
