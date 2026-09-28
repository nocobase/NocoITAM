import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_return_devices',
  {
    title: 'ITAM: return devices',
    about: 'Takes back one or more devices once the user confirms.',
  },
  'Take back one or more devices from whoever holds them (an offboarding returns everything a leaver holds in one call). nextStatus defaults to in stock; condition notes the state it came back in. Each device is returned on its own and reports its own result.',
);

export default tool;
