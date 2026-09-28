import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_transfer_device',
  {
    title: 'ITAM: transfer a device',
    about: 'Moves a device from its holder to another once the user confirms.',
  },
  'Transfer ONE device that is already assigned to a new holder.',
);

export default tool;
