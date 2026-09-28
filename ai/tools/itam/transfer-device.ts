import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_transfer_device',
  {
    title: 'ITAM: transfer a device',
    about: 'Moves a device from its holder to another once the user confirms.',
  },
  'Transfer ONE device that is already assigned to a new holder.',
);

export default tool;
