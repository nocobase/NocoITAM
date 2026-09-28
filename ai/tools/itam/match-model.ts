import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  runTool,
  summarize,
  toolServices,
  type ItamAgentContext,
} from './shared.js';

const schema = z.object({ text: z.string().min(1).max(200) });

const tool: ToolsOptions<ItamAgentContext> = defineTools<ItamAgentContext>({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: match model',
    about:
      'Finds the registered model, category or software product a free-text description refers to.',
  },
  definition: {
    name: 'itam_match_model',
    description:
      'Resolve a product description ("MacBook Pro 14", "Figma", "USB-C dock") to registered models, categories or software products. Returns candidates with ids; pick the best match or ask the user when several fit.',
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      const [models, categories, products] = await Promise.all([
        services.list('models', { q: args.text, pageSize: 5 }),
        services.list('categories', { q: args.text, pageSize: 5 }),
        services.list('softwareProducts', { q: args.text, pageSize: 5 }),
      ]);
      return {
        status: 'success',
        content: {
          models: models.data.map(summarize),
          categories: categories.data.map(summarize),
          softwareProducts: products.data.map(summarize),
        },
      };
    }),
});

export default tool;
