import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_assign_device',
  {
    title: 'ITAM: assign a device',
    about:
      'Assigns an in-stock device to a person, location or device once the user confirms.',
  },
  'Assign ONE in-stock device to a person (or a location, or another device it belongs with). Check availability first.',
);

export default tool;
