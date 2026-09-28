import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  runTool,
  summarize,
  toolServices,
  type ItamAgentContext,
} from './shared.js';

const schema = z.object({
  modelId: z.string().max(64).optional(),
  categoryId: z.string().max(64).optional(),
  softwareProductId: z.string().max(64).optional(),
  stockName: z.string().max(100).optional(),
});

const tool: ToolsOptions<ItamAgentContext> = defineTools<ItamAgentContext>({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: check availability',
    about:
      'What is in stock for a model or category, and which entitlements still have free seats.',
  },
  definition: {
    name: 'itam_check_availability',
    description:
      'Check what can be assigned right now: in-stock, unreserved devices of a model or category, accessory / consumable quantities, and entitlements of a software product with free seats. Use before proposing an assignment or a purchase.',
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      const content: Record<string, unknown> = {};
      if (args.modelId || args.categoryId) {
        const filter: Record<string, string> = { view: 'available' };
        if (args.modelId) filter.modelId = args.modelId;
        if (args.categoryId) filter.categoryId = args.categoryId;
        const available = await services.list('devices', {
          filter,
          pageSize: 20,
        });
        content.availableDevices = {
          total: available.total,
          rows: available.data.map(summarize),
        };
      }
      if (args.stockName) {
        const stock = await services.list('stockItems', {
          q: args.stockName,
          pageSize: 10,
        });
        content.stock = stock.data.map((row) => ({
          ...summarize(row),
          available: Number(row.totalQuantity) - Number(row.usedQuantity),
        }));
      }
      if (args.softwareProductId) {
        const entitlements = await services.list('entitlements', {
          filter: { softwareProductId: args.softwareProductId },
          pageSize: 20,
        });
        content.entitlements = entitlements.data.map((row) => ({
          ...summarize(row),
          // No seat count is no limit (site, free, a flat subscription);
          // a count the user may not read says nothing either way.
          freeSeats:
            row.seatCount === null
              ? 'unlimited'
              : row.seatCount === undefined
                ? undefined
                : Number(row.seatCount) - Number(row.assignedCount),
        }));
      }
      return { status: 'success', content };
    }),
});

export default tool;
