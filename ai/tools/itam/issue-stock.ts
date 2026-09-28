import type { ToolsOptions } from '@nocobase/ai-employee';

import { recordTool } from './shared.js';

const tool: ToolsOptions = recordTool(
  'itam_issue_stock',
  {
    title: 'ITAM: issue stock',
    about:
      'Issues a quantity of an accessory or consumable, or installs components, once the user confirms.',
  },
  'Issue a quantity from ONE stock record: an accessory or consumable to a person or location, or a component installed into a device (holderType device). Check the available quantity first.',
);

export default tool;
