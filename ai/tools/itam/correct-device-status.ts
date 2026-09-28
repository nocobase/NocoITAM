import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_correct_device_status',
  {
    title: 'ITAM: correct a device status',
    about:
      'Corrects a device status that no longer matches reality, with a reason.',
  },
  "Correct ONE device's status when the record is wrong (an idle device marked in use, a lost one). A reason is required.",
);

export default tool;
