import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  SEARCHABLE_COLLECTIONS,
  summarize,
  runTool,
  toolServices,
  type ItamAgentContext,
} from './shared.js';

const schema = z.object({
  collection: z.enum(SEARCHABLE_COLLECTIONS),
  q: z.string().max(200).optional(),
  filter: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
});

const tool: ToolsOptions<ItamAgentContext> = defineTools<ItamAgentContext>({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: search records',
    about:
      'Searches devices, stock, entitlements, orders, repairs, audits, disposals and reference data (categories, models, vendors, locations, departments, people) the user may read.',
  },
  definition: {
    name: 'itam_search_records',
    description:
      'Search ITAM records. Use `q` for free text (device number, serial, name) and `filter` for exact field values, e.g. {"status":"inStock"} or {"status":["inUse","onLoan"]}; date ranges use "field:gte" / "field:lte" keys. Named views exist on some collections via {"view": "..."}: devices (available, idle, warrantyExpiring, auditOverdue), entitlements (overAllocated, idle, expiring, ended). Returns summarised rows; call itam_get_record for the full record.',
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      const result = await services.list(args.collection, {
        q: args.q,
        filter: args.filter,
        sort: args.sort,
        order: args.order,
        page: args.page ?? 1,
        pageSize: args.pageSize ?? 20,
      });
      return {
        status: 'success',
        content: {
          total: result.total,
          page: result.page,
          rows: result.data.map(summarize),
        },
      };
    }),
});

export default tool;
