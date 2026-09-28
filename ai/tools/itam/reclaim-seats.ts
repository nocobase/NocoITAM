import type { ToolsOptions } from '@nocobase/ai-employee';

import { writeTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = writeTool(
  'itam_reclaim_seats',
  {
    title: 'ITAM: reclaim seats',
    about: 'Takes back one or more seats once the user confirms.',
  },
  'Reclaim one or more seats ({entitlementId, seatId} each, from the seats in get_record). Each seat is reclaimed on its own and reports its own result.',
);

export default tool;
