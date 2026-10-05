import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool } from './shared.js';

const tool: ToolsOptions = writeTool(
  'itam_assign_seat',
  {
    title: 'ITAM: assign a seat',
    about:
      'Gives a seat of an entitlement to a person or device once the user confirms.',
  },
  'Assign ONE seat of an entitlement. Perpetual: holderId (and holderType person or device). Subscription: account, and holderType person with holderId whenever the seat is for a person (onboarding always is) — without holderId the seat belongs to nobody in the register. Check free seats first.',
);

export default tool;
