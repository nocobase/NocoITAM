import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import { onboardingServiceToken } from '../../../server/providers/itam/onboarding.js';

import { runTool, toolServices } from './shared.js';

const schema = z.object({
  personId: z.string().min(1).max(64).describe('The joiner’s person id.'),
});

/**
 * 入职配备 for one person, as the system computed it (2026-10-05): the kit
 * that applies, what they already have, and the very device, stock item or
 * seat in stock that would make up the rest, plus what must be bought.
 * The choice of device is the service's (`onboarding.ts`), never the
 * model's, so the assistant presents and carries out this plan rather than
 * picking items itself.
 */
const tool: ToolsOptions = defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: onboarding plan',
    about:
      'The onboarding kit that applies to a person, what they already have, what stock would make up the rest, and the shortfall to buy.',
  },
  definition: {
    name: 'itam_onboarding_plan',
    description:
      "Get a joiner's onboarding plan: the kit for their department and position, each item's prepared things, the proposed device / stock item / entitlement for the rest, and the shortfall. Propose exactly these proposals; do not choose other items.",
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      // Read under the user's own grant on people, as the page does.
      const person = await services.get('people', args.personId);
      if (!person)
        return { status: 'error', content: 'Person not found or not readable' };
      const plan = await services.container
        .resolve(onboardingServiceToken)
        .plan(args.personId);
      return {
        status: 'success',
        content: {
          person: {
            id: person.id,
            name: person.name,
            departmentId: person.departmentId,
            position: person.position,
            hireDate: person.hireDate,
            employmentStatus: person.employmentStatus,
          },
          plan,
        },
      };
    }),
});

export default tool;
