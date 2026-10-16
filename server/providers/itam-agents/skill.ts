import { createHash } from 'node:crypto';

import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';

/**
 * The skill every online run gets on ITAM: how its commands are found and
 * how a change is proposed as a plan. Prompt text, in English like the other
 * prompts. `itam plan ops` states every operation's parameters; this says
 * what the help cannot: the plan's shape and its rules.
 */
export const ITAM_WORK_SKILL = `---
name: itam-work
description: How to look things up in the IT asset register with the itam commands, and how to propose changes as one plan the person confirms.
---

# Working in the IT asset register

## Looking things up

- \`itam context\` — today, who the reader is (userId, personId), the currency, thresholds, the administrator's business notes, what needs attention and what waits for them. Once per task.
- \`itam search <collection> --q <words>\` finds records (word by word: number, serial, name, a model's name); \`--filter '{"status":"inStock"}'\` takes exact values and named views (\`{"view":"available"}\`). Collections: devices, stockItems, entitlements, purchaseOrders, repairs, audits, disposals, people, models, categories, manufacturers, vendors, locations, departments, softwareProducts.
- \`itam record get <collection> <id>\` reads one record whole, with its related records and last history.
- \`itam stats\` counts devices by a field (\`--devices-by status\`) or runs a report (\`--report costs --from 2026-01-01\`).
- \`itam availability\` — what is in stock for a model or category, stock quantities by name, free seats of a product.
- \`itam model match --text "MacBook Pro 14"\` turns a description into model, category or product ids.
- \`itam onboarding plan <personId>\` — a joiner's kit, what they have and the system's proposal for the rest.
- \`itam device-sync review --view checks|unregistered|unmanaged|ignored|exempted|dismissed\` — where the device management platforms (Intune, Jamf Pro) and the register disagree; \`--device-id <id>\` for one device's platform records and differences.

Every command prints \`{ ok, result: { data } }\`; a search's rows are \`.result.data.rows[]\` with a \`…Name\` beside each id. Cut output with jq or \`head -n\`, never \`head -c\`, which splits Chinese characters.

## Changing things: one plan

You never change a record directly. Put the whole change the person asked for into **one** plan, write it to a file and run:

\`\`\`
itam plan create --file /tmp/plan.json
\`\`\`

\`\`\`json
{
  "title": "Give Li Na a laptop and Figma",
  "summary": "She joins Design on Monday; SG-LT-050 is the spare MacBook Pro 14 on her floor.",
  "steps": [
    { "op": "assign_device",
      "params": { "title": "Assign SG-LT-050 to Li Na", "deviceId": "<device id>", "targetId": "<person id>" } },
    { "op": "assign_seat",
      "params": { "title": "Give Li Na a Figma seat", "entitlementId": "<entitlement id>", "holderType": "person", "holderId": "<person id>" } }
  ]
}
\`\`\`

- \`itam plan ops\` lists every operation and the JSON Schema of its \`params\`, and the fields \`create_record\` takes for each collection. Read it before writing a step of a kind you have not written in this conversation; a field that is not there, or a value of the wrong type, refuses the plan.
- The operations: assign_device, loan_device, return_devices, transfer_device, reserve_device, correct_device_status, link_managed_device, unlink_managed_device, ignore_managed_device, assign_seat, reclaim_seats, adjust_entitlement_seats, set_entitlement_auto_renew, create_purchase_order, create_disposal, update_master_record, create_record, stock_in, issue_stock, take_back_stock, receive_purchase_line.
- Each step's \`params.title\` is its own line on the card, in the person's language ("把 DE-000012 分配给李娜"). Ids come from the commands, never guessed.
- A step names a record an earlier step creates by its \`ref\` (\`$laptop\`) or its place (\`$1\`), wherever an id goes.
- The plan is checked when you create it: a refused step is named (\`steps.2\`) with why. Fix that step and create the plan again.
- Then tell the person in one line what the plan does and that it waits for them to confirm it on the card. Do not say it is done.
- When the person decides you are told: carried out, declined, or failed at a step (the steps before it were carried out). Report it briefly; propose a new plan only if they still want the change.
- Submitting, approving, ordering or cancelling a request, executing a disposal and deleting anything are never part of a plan: they stay on the pages.
`;

export function registerItamSkill(agents: Agents): () => void {
  return agents.online.skills.register({
    slug: 'itam-work',
    name: 'itam-work',
    description:
      'How to look things up in the IT asset register with the itam commands, and how to propose changes as one plan the person confirms.',
    hash: createHash('sha256').update(ITAM_WORK_SKILL).digest('hex'),
    markdown: ITAM_WORK_SKILL,
    files: [],
  });
}

/**
 * ITAM's method skills (ai/skills): skills of the Agents plugin's library,
 * attached to Noco (library.ts), so a question about a joiner, a leaver,
 * receiving goods or a model's details is answered by the same method.
 */
export const METHOD_SKILLS = [
  'onboarding',
  'offboarding',
  'receiving',
  'catalog',
  // Device sync, step 4 (2026-10-15).
  'device-sync',
] as const;

/**
 * The work agents' method skills (2026-10-16, work-agents.ts): put into the
 * library like the others, but attached to their work agent rather than to
 * Noco — nobody asks Noco to review an approval.
 */
export const WORK_SKILLS = ['approval-review'] as const;
