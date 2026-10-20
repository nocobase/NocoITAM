import { z } from 'zod';

import { AI_WRITE_SCHEMAS } from '../itam/ai-writes.js';
import { MAX_STEPS, PLAN_OPS } from '../itam/plans.js';
import {
  AI_RECORD_SCHEMAS,
  createFieldGuide,
} from '../../routes/itam/ai-records.js';

/**
 * A plan as Asset Steward proposes it, the same through its tool
 * (`itam_plan_create`, tools.ts) and through the `itam plan create` command
 * a runner's agent calls (routes/itam/agent-commands.ts).
 */
const JsonObject = z.record(z.string(), z.unknown());

const PlanStepInput = z.strictObject({
  op: z.enum(PLAN_OPS).meta({
    description: 'The operation; `itam plan ops` lists each with its params.',
  }),
  ref: z.string().max(40).optional().meta({
    description:
      "A name later steps use in place of the id of the record this step creates; `$1`, `$2` … (the step's place) work too.",
  }),
  params: JsonObject.meta({
    description:
      "The operation's parameters, as `itam plan ops` states them; `title` is the step's own line on the card.",
  }),
});

export const CreatePlanInput = z.strictObject({
  title: z.string().trim().min(1).max(255).meta({
    description: 'What the plan does, in a line the person reads on its card.',
  }),
  summary: z.string().max(5000).optional().meta({
    description: 'Why, in a few sentences, with what it is based on.',
  }),
  steps: z.array(PlanStepInput).min(1).max(MAX_STEPS).meta({
    description: 'Carried out in this order.',
  }),
});

/** The operations as `plan ops` lists them. */
export function planOps(): Record<string, unknown> {
  const schemaOf = (schema: z.ZodType) => {
    try {
      return z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' });
    } catch {
      return {};
    }
  };
  const ops: Record<string, unknown> = {};
  for (const [tool, schema] of Object.entries({
    ...AI_WRITE_SCHEMAS,
    ...AI_RECORD_SCHEMAS,
  }))
    ops[tool.replace(/^itam_/, '')] = schemaOf(schema as z.ZodType);
  return { ops, createFields: createFieldGuide() };
}
