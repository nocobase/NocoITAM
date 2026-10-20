import type {
  OnlineAgentJson,
  OnlineAgentToolContext,
} from '@nocobase/app-plugin-agents/server/online-agent';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { ServiceContainer } from '@nocobase/service-provider';
import { z, type ZodType } from 'zod';

import { readSkill } from '../itam/ai-model.js';
import { planServiceToken } from '../itam/plans.js';
import { CreatePlanInput, planOps } from './plan-input.js';
import { ITAM_ASSISTANT_INSTRUCTIONS } from './preset.js';
import {
  AvailabilityInput,
  DeviceSyncReviewInput,
  SEARCHABLE_COLLECTIONS,
  SearchInput,
  StatsInput,
  availability,
  businessContext,
  deviceSyncReview,
  getRecord,
  matchModel,
  onboardingPlan,
  readerFor,
  search,
  stats,
} from './reads.js';
import {
  fetchPage,
  searchWeb,
  webSearchAvailable,
} from '../itam/web-search.js';
import {
  ITAM_WORK_GUIDE,
  METHOD_SKILLS,
  NO_WEB_GUIDE,
  WEB_GUIDE,
} from './skill.js';

/**
 * Asset Steward (资产管家) on the Agents plugin's OnlineAgent service (plugin
 * 1.0, 2026-10-20). Until then it was an online agent of the plugin, whose
 * runs called ITAM's `itam` commands from a sandbox; 1.0 keeps no online
 * agents, and a chat runs the model inside this process with the business
 * tools the application registers. So Asset Steward is the global layer
 * of every native conversation: the tools below — each the read a command
 * made (reads.ts) or proposing a plan (plans.ts), as the person chatting and
 * within what they may read — the instructions and the work guide as its
 * system prompt, and the enabled chat models, the default first. Global
 * rather than a named scope because the plugin's chat client creates a
 * conversation with no scope of the application's choosing; a runner agent
 * cannot take native tools, so ITAM's chat offers Asset Steward alone.
 *
 * The commands stay (routes/itam/agent-commands.ts) for an agent running on
 * a runner, which reaches ITAM through its CLI.
 */

export const ASSISTANT_NAME = 'Asset Steward';

/** The tools, by name; the plan card is drawn for `itam_plan_create`. */
export const ITAM_TOOLS = {
  context: 'itam_context',
  search: 'itam_search',
  record: 'itam_record_get',
  stats: 'itam_stats',
  availability: 'itam_availability',
  modelMatch: 'itam_model_match',
  onboarding: 'itam_onboarding_plan',
  deviceSync: 'itam_device_sync_review',
  planOps: 'itam_plan_ops',
  planCreate: 'itam_plan_create',
  skill: 'itam_read_skill',
  // Through DeepSeek's Search and Fetch APIs (2026-10-20), offered only
  // while a DeepSeek model service is there (`WEB_TOOLS`).
  webSearch: 'itam_web_search',
  webFetch: 'itam_web_fetch',
} as const;

/** The tools that reach the web, left out with no DeepSeek service. */
const WEB_TOOLS: readonly string[] = [
  ITAM_TOOLS.webSearch,
  ITAM_TOOLS.webFetch,
];

/**
 * What a tool hands back must already be plain JSON (dates as ISO strings);
 * the register's rows are, once serialized.
 */
const asJson = (value: unknown): OnlineAgentJson =>
  JSON.parse(JSON.stringify(value ?? null)) as OnlineAgentJson;

/**
 * A refusal the model can act on — a step of a plan the person may not
 * take, a record that is not there — returned rather than thrown, so the
 * answer goes on with it instead of failing.
 */
function refusal(error: unknown): OnlineAgentJson {
  const failure = error as {
    message?: unknown;
    code?: unknown;
    rule?: unknown;
    field?: unknown;
    detail?: unknown;
  };
  return asJson({
    error: {
      message:
        typeof failure?.message === 'string' ? failure.message : String(error),
      ...(typeof failure?.rule === 'string' ? { reason: failure.rule } : {}),
      ...(typeof failure?.code === 'string' ? { code: failure.code } : {}),
      ...(typeof failure?.field === 'string' ? { field: failure.field } : {}),
      ...(typeof failure?.detail === 'string'
        ? { detail: failure.detail }
        : {}),
    },
  });
}

/** A tool's refusal message, when its output is one. */
function refusalOf(value: OnlineAgentJson): string | null {
  const error =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { error?: { message?: unknown } }).error
      : undefined;
  return typeof error?.message === 'string' ? error.message : null;
}

/** A tool's output as the page sees it: its refusal, or nothing. */
function publicRefusal(value: OnlineAgentJson): OnlineAgentJson {
  const message = refusalOf(value);
  return asJson(message === null ? {} : { error: { message } });
}

export function registerAssistant(
  agents: Agents,
  container: ServiceContainer,
  notes: () => { businessNotes: string; timeZone: string },
): void {
  const configurator = agents.onlineAgent.configurator;
  const tool = <I>(
    name: string,
    description: string,
    inputSchema: ZodType<I>,
    run: (input: I, userId: string, context: OnlineAgentToolContext) => unknown,
    publicView?: {
      input(value: I): OnlineAgentJson;
      output(value: OnlineAgentJson): OnlineAgentJson;
    },
  ) =>
    configurator.registerTool<I, OnlineAgentJson>(name, {
      version: '1',
      definition: {
        description,
        inputSchema,
        execute: async (input, options) => {
          const context = (
            options as unknown as { context: OnlineAgentToolContext }
          ).context;
          try {
            return asJson(await run(input, context.user.id, context));
          } catch (error) {
            return refusal(error);
          }
        },
        // The page sees that a tool ran and, when refused, why; never what
        // it read — the answer says what the person needs of that. Without
        // a projection the call would not show at all.
        public: publicView ?? {
          input: () => asJson({}),
          output: (value) => publicRefusal(value),
        },
      },
    });
  const reader = (userId: string) => readerFor(container, userId);

  tool(
    ITAM_TOOLS.context,
    "Today's date, who the reader is (their user id and person record), the currency, the reminder thresholds, the administrator's business notes, what needs attention and what waits for the reader. Read it once at the start of a task.",
    z.object({}),
    async (_input, userId) => businessContext(reader(userId)),
  );
  tool(
    ITAM_TOOLS.search,
    `Searches one collection the reader may read: ${SEARCHABLE_COLLECTIONS.join(', ')}. \`q\` is free text matched word by word (number, serial, name, a model's or product's name); \`filter\` takes exact values ({"status":"inStock"}, {"status":["inUse","onLoan"]}), date ranges as "field:gte" / "field:lte", and named views as {"view": …}: devices available, idle, warrantyExpiring, auditOverdue; entitlements overAllocated, idle, expiring, ended. \`ids\` reads given records. Rows are summarised with a \`…Name\` beside each reference id; ${ITAM_TOOLS.record} reads one whole.`,
    SearchInput,
    async (input, userId) => search(reader(userId), input),
  );
  tool(
    ITAM_TOOLS.record,
    'One record with its last history events and a `…Name` beside each reference id. Devices come with their components, seats and repairs; people with the devices, stock holdings and seats they hold; entitlements with their seats; stock with its holdings; purchase orders with their lines (a line id is what receiving names).',
    z.object({
      collection: z.enum(SEARCHABLE_COLLECTIONS),
      id: z.string().min(1).max(64),
    }),
    async ({ collection, id }, userId) =>
      getRecord(reader(userId), collection, id),
  );
  tool(
    ITAM_TOOLS.stats,
    'Either devices counted by one field (`devicesBy`: status, categoryId, locationId, departmentId, modelId, manufacturerId), or a preset report (`report`: overview, distribution, costs, perPersonCost, expiry, softwareCompliance, repairs, auditResults, changes) over an optional period (`from`, `to`) and scope.',
    StatsInput,
    async (input, userId) => stats(reader(userId), input),
  );
  tool(
    ITAM_TOOLS.availability,
    'In-stock, unreserved devices of a model or category, stock quantities by name, and entitlements of a software product with their free seats. Read it before proposing an assignment or a purchase.',
    AvailabilityInput,
    async (input, userId) => availability(reader(userId), input),
  );
  tool(
    ITAM_TOOLS.modelMatch,
    'The registered models, categories and software products a description ("MacBook Pro 14", "Figma", "USB-C dock") refers to, with their ids.',
    z.object({ text: z.string().min(1).max(200) }),
    async ({ text }, userId) => matchModel(reader(userId), text),
  );
  tool(
    ITAM_TOOLS.onboarding,
    "A joiner's kit for their department and position, what they hold or have reserved, the device, stock item or seat proposed for the rest (the system's choice, or Asset Steward's pick while still free), what is planned from orders and leavers, and the shortfall. Propose exactly these proposals; never choose other items.",
    z.object({ personId: z.string().min(1).max(64) }),
    async ({ personId }, userId) => onboardingPlan(reader(userId), personId),
  );
  tool(
    ITAM_TOOLS.deviceSync,
    "Where the device management platforms (Intune, Jamf Pro) and the register disagree. `view`: checks — register devices that are silent (`stale`), with another primary user (`userMismatch`) or online while off duty (`statusMismatch`); unregistered — platform records no device answers to, with `suggestedModelId` and, for a serial several devices share, `candidates`; unmanaged — devices in use of a managed category on no platform; ignored — records kept off the register; exempted — devices marked as not to be managed by any platform, with the reason; dismissed — differences a person ignored that still hold. With `deviceId`, that device's platform records, differences and `exemption`. `connected: false` means no platform is connected.",
    DeviceSyncReviewInput,
    async (input, userId) => deviceSyncReview(reader(userId), input),
  );
  tool(
    ITAM_TOOLS.planOps,
    "Every operation a plan's step may be, with the JSON Schema of its `params`, and the fields each collection's `create_record` takes. Read the ones you need before writing a plan.",
    z.object({}),
    () => Promise.resolve(planOps()),
  );
  tool(
    ITAM_TOOLS.planCreate,
    'Proposes one plan: checks every step as the person and keeps it for them to confirm on its card; nothing changes until they do. A step that would be refused comes back as `error` naming it (`field`: steps.N) and why (`detail`): fix that step and propose the plan again.',
    CreatePlanInput,
    async (input, userId, context) => {
      const plan = await container
        .resolve(planServiceToken)
        .create(userId, input, {
          agentId: null,
          agentName: ASSISTANT_NAME,
          runId: null,
          conversationId: context.sessionId,
        });
      return {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        steps: input.steps.length,
      };
    },
    {
      // The card reads the plan itself by its id; the page needs no more.
      input: (value) =>
        asJson({ title: value.title, steps: value.steps.length }),
      output: (value) => value,
    },
  );
  tool(
    ITAM_TOOLS.skill,
    `One of ITAM's method skills, as the administrator keeps it on Agent 团队 → 技能: ${METHOD_SKILLS.join(', ')}. Read the one a task calls for before starting it.`,
    z.object({ name: z.enum(METHOD_SKILLS) }),
    async ({ name }) => ({ name, content: await readSkill(container, name) }),
  );

  tool(
    ITAM_TOOLS.webSearch,
    'Searches the web for a fact the register does not hold (a model\'s specifications, a warranty policy, a release or end-of-life date, a price). `query` is short, at most 128 characters; operators work: site:dell.com, lang:zh,en, after:2025-01-01, "exact phrase", -term. Results come the most relevant first, each with its title, url, site, date, authority (0–4, 3 and above authoritative) and a summary.',
    z.object({
      query: z.string().trim().min(1).max(128),
      count: z.number().int().min(1).max(10).optional(),
    }),
    async ({ query, count }, _userId, context) => ({
      results: await searchWeb(container, query, {
        count: count ?? 6,
        signal: context.signal,
      }),
    }),
    {
      // The query and the pages found, never their text.
      input: (value) => asJson({ query: value.query }),
      output: (value) => {
        if (refusalOf(value) !== null) return publicRefusal(value);
        const results = (
          value as { results?: { title: string; url: string }[] }
        ).results;
        return asJson({
          results: (results ?? [])
            .slice(0, 6)
            .map(({ title, url }) => ({ title, url })),
        });
      },
    },
  );
  tool(
    ITAM_TOOLS.webFetch,
    'Reads one web page whole, as Markdown (cut at 20,000 characters): a page `itam_web_search` found, or one the person names.',
    z.object({ url: z.url().max(2048) }),
    async ({ url }, _userId, context) =>
      fetchPage(container, url, context.signal),
    {
      input: (value) => asJson({ url: value.url }),
      output: (value) => {
        return refusalOf(value) !== null
          ? publicRefusal(value)
          : asJson({ title: (value as { title?: string }).title ?? '' });
      },
    },
  );

  configurator.registerOnlineAgentGlobalScope(async () => {
    const web = await webSearchAvailable(container);
    return {
      tool: Object.values(ITAM_TOOLS).filter(
        (name) => web || !WEB_TOOLS.includes(name),
      ),
      model: await chatModels(agents),
      systemPromptTemplate: systemPrompt(notes(), web),
    };
  });
}

/**
 * The enabled chat models, as `service/model`, the default chat model of
 * Agent 团队 → 模型 first: the one a new conversation answers with.
 */
async function chatModels(agents: Agents): Promise<string[]> {
  try {
    const services = (await agents.models.services.list()).filter(
      (service) => service.enabled,
    );
    const all = services.flatMap((service) =>
      service.models
        .filter((model) => model.kind === 'chat')
        .map((model) => `${service.name}/${model.value}`),
    );
    const chat = (await agents.models.services.defaults()).effectiveChat;
    const first = chat ? `${chat.modelService}/${chat.model}` : null;
    return first && all.includes(first)
      ? [first, ...all.filter((ref) => ref !== first)]
      : all;
  } catch {
    return [];
  }
}

/** Who Asset Steward is, how it works on ITAM, and the business notes. */
function systemPrompt(
  {
    businessNotes,
    timeZone,
  }: {
    businessNotes: string;
    timeZone: string;
  },
  web: boolean,
): string {
  return [
    ITAM_ASSISTANT_INSTRUCTIONS,
    ITAM_WORK_GUIDE,
    web ? WEB_GUIDE : NO_WEB_GUIDE,
    `Dates the tools return are local to the deployment; speak of them in its time zone, ${timeZone}.`,
    businessNotes.trim()
      ? `## Business notes from the administrator\n\n${businessNotes.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
