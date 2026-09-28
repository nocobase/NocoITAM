import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_assign_seat',
  {
    title: 'ITAM: assign a seat',
    about:
      'Gives a seat of an entitlement to a person or device once the user confirms.',
  },
  'Assign ONE seat of an entitlement. Perpetual: holderId (and holderType person or device). Subscription: account, optionally holderId. Check free seats first.',
);

export default tool;
