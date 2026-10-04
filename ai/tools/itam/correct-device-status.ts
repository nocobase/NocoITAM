import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_correct_device_status',
  {
    title: 'ITAM: correct a device status',
    about:
      'Corrects a device status that no longer matches reality, with a reason.',
  },
  "Correct ONE device's status when the record is wrong (an idle device marked in use, a lost one). A reason is required. Scrapping a device is not a correction: 报废 and 已报废 are reached by raising a disposal on the device's page, where it is approved and then carried out, so this tool cannot set them — say so rather than proposing something else.",
);

export default tool;
