import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_loan_device',
  {
    title: 'ITAM: lend a device',
    about: 'Lends a device until a return date once the user confirms.',
  },
  'Lend ONE device to a person until expectedReturnDate (YYYY-MM-DD).',
);

export default tool;
