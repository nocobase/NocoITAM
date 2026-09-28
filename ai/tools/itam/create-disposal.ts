import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_create_disposal',
  {
    title: 'ITAM: draft a disposal',
    about:
      'Creates a draft disposal for one or more devices once the user confirms.',
  },
  'Create a DRAFT disposal raised by the user for one or more devices: method, reason, deviceIds, dataWipe (wiped / notWiped / notRequired; wipeMethod when wiped), optionally the recipient (recipientVendorId or recipientName, not both). Submitting it for approval is a step the user takes on the disposal page.',
);

export default tool;
