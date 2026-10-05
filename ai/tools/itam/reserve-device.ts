import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_reserve_device',
  {
    title: 'ITAM: reserve a device',
    about:
      'Holds an in-stock device for a person until a date — a joiner until their first day — once the user confirms.',
  },
  'Reserve ONE in-stock, unreserved device for a person until a date (a joiner: until their joining date). For onboarding, reserve only the devices itam_onboarding_plan proposes.',
);

export default tool;
