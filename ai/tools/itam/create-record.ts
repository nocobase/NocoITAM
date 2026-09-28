import type { ToolsOptions } from '@nocobase/ai-employee';

import {
  CREATE_FIELD_GUIDE,
  CREATE_REQUIREMENTS,
} from '../../../server/routes/itam/ai-records.js';
import { recordTool, type ItamAgentContext } from './shared.js';

const tool: ToolsOptions<ItamAgentContext> = recordTool(
  'itam_create_record',
  {
    title: 'ITAM: create a record',
    about:
      'Creates a device, stock record, entitlement, repair, audit task or master data record once the user confirms.',
  },
  `Create ONE record, with the same fields and rules as the page's create dialog. \`collection\` picks what, \`input\` holds its fields (\`?\` marks an optional field, parentheses the allowed values):
${CREATE_FIELD_GUIDE}
Also required, as the page's own dialog requires:
${CREATE_REQUIREMENTS}
Before proposing, every required value (the fields without ? above and the ones just listed) must have been stated by the user or read from a record: ask for all the missing ones together in one message, never leave one out and never invent one. Rules: look ids up first (itam_match_model for models and software products, itam_search_records for locations, people, vendors, departments). A device's category and manufacturer follow its model and an entitlement's its software product — leave them out; a stock record states its model's categoryId (read it from the model). A repair puts its device in repair. An audit task's scope names locationIds / departmentIds / categoryIds / deviceIds, and its executorIds (like every ownerId) are user ids: a person's userId from itam_get_record, or me.userId from itam_business_context. Purchase orders and disposals have their own tools (itam_create_purchase_order, itam_create_disposal). Ask for a required value you do not know rather than inventing it.`,
);

export default tool;
