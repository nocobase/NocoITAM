import type { ToolsOptions } from '@nocobase/ai-employee';

import { recordTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = recordTool(
  'itam_take_back_stock',
  {
    title: 'ITAM: take back stock',
    about:
      'Takes back an issued accessory or removes an installed component once the user confirms.',
  },
  'Take back a quantity someone holds from ONE stock record (an accessory a person returns, a component removed from a device). Consumables are not taken back.',
);

export default tool;
