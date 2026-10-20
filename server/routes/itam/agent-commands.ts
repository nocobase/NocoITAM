import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  agentsToken,
  isReadingAction,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  declaredRouteActionOf,
  defineApiRoutes,
  describeRoute,
  listResponse,
  toApiError,
  type AppApiRouteContribution,
  type CliRouteOptions,
  type OpenAPIV3_1,
} from '@nocobase/app-server/router';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { z } from 'zod';

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
} from '../../providers/itam-agents/reads.js';
import {
  PLAN_ACTION,
  VIEW_ACTION,
} from '../../providers/itam-agents/actions.js';
import {
  CreatePlanInput,
  planOps,
} from '../../providers/itam-agents/plan-input.js';
import {
  BusinessRuleError,
  DuplicateValueError,
  RecordNotFoundError,
  ValidationError,
} from '../../providers/itam/errors.js';
import {
  PLAN_STATUSES,
  PlanError,
  planServiceToken,
  type PlanSource,
} from '../../providers/itam/plans.js';
import { ForbiddenError } from './http.js';

/**
 * The commands ITAM's agents call (template 1.0.0-beta.64): the Agents
 * plugin builds its `itam` command line from these routes' API description,
 * each a `cliRoute` naming the business action it needs (actions.ts). They
 * read as the person the run works for — a run's token carries that person —
 * and every change is a plan the person confirms (`/assistant/plans`).
 *
 * The same routes answer a person's own session or API key, so a person may
 * use the CLI too; carrying a plan out or declining it is a person's alone.
 */

const DOMAIN = 'itam';

type Env = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

// The credentials a command accepts: a person's session or API key, and an
// agent's run token.
const RUN_SECURITY: OpenAPIV3_1.SecurityRequirementObject[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

const command = (
  action: string,
  options: Omit<CliRouteOptions, 'action'> = {},
) => ({ security: RUN_SECURITY, ...cliRoute({ ...options, action }) });

const anyData = z.unknown();

export const agentCommandRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const reader = (context: Context<Env>) =>
      readerFor(app.container, principalId(context));
    const plans = () => app.container.resolve(planServiceToken);

    // A run acts as the person who woke it, kept to the actions its agent
    // holds (itam-agents/gate.ts): the route's action is checked here, since
    // the plugin only filters the commands it offers. A run never writes:
    // anything but reading and proposing a plan answers PLAN_REQUIRED.
    const run: MiddlewareHandler<Env> = async (context, next) => {
      const identity = runIdentityOf(context.get('auth'));
      if (!identity) return next();
      const action = declaredRouteActionOf(context);
      const allowed =
        action && app.container.has(agentsToken)
          ? await app.container.resolve(agentsToken).gate.allowed(identity)
          : new Set<string>();
      if (!action || !allowed.has(action))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACTION_NOT_ALLOWED',
          domain: DOMAIN,
          message: `This agent may not ${action ?? 'call this route'}.`,
          metadata: { action: action ?? '' },
        });
      if (!isReadingAction(action) && action !== PLAN_ACTION)
        throw new ApiError({
          status: 'FAILED_PRECONDITION',
          reason: 'PLAN_REQUIRED',
          domain: DOMAIN,
          message:
            'An agent does not change records: propose the change as a plan for the person to confirm.',
          metadata: { action },
        });
      return next();
    };
    // Under a path of their own: `/itam/*` takes no run token.
    router.use(
      '/assistant/*',
      app.container.resolve(authenticationToken).required({ scopedKeys: true }),
      app.container.resolve(authorizationToken).middleware(),
      run,
    );
    router.onError((error, context) =>
      apiErrorHandler(itamApiError(error), context),
    );

    const tags = ['ITAM'];

    router.get(
      '/assistant/context',
      describeRoute({
        tags,
        summary: 'Business context',
        operationId: 'itamContext',
        description:
          "Today's date, who the reader is (their user id and person record), the currency, the reminder thresholds, the administrator's business notes, what needs attention and what waits for the reader. Read it once at the start of a task.",
        ...command(VIEW_ACTION, { command: 'context' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      async (context) =>
        context.json({ data: await businessContext(reader(context)) }),
    );

    router.post(
      '/assistant/search',
      describeRoute({
        tags,
        summary: 'Search records',
        operationId: 'itamSearch',
        description: `Searches one collection the reader may read: ${SEARCHABLE_COLLECTIONS.join(', ')}. \`q\` is free text matched word by word (number, serial, name, a model's or product's name); \`filter\` takes exact values ({"status":"inStock"}, {"status":["inUse","onLoan"]}), date ranges as "field:gte" / "field:lte", and named views as {"view": …}: devices available, idle, warrantyExpiring, auditOverdue; entitlements overAllocated, idle, expiring, ended. \`ids\` reads given records. Rows are summarised with a \`…Name\` beside each reference id; \`record get\` reads one whole.`,
        ...command(VIEW_ACTION, {
          command: 'search',
          args: ['collection'],
        }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('json', SearchInput),
      async (context) =>
        context.json({
          data: await search(reader(context), context.req.valid('json')),
        }),
    );

    router.get(
      '/assistant/records/:collection/:id',
      describeRoute({
        tags,
        summary: 'Get a record',
        operationId: 'itamGetRecord',
        description:
          "One record with its last history events and a `…Name` beside each reference id. Devices come with their components, seats and repairs; people with the devices, stock holdings and seats they hold; entitlements with their seats; stock with its holdings; purchase orders with their lines (a line's id is what receiving names).",
        ...command(VIEW_ACTION, { command: 'record get' }),
        responses: {
          '200': dataResponse(anyData),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator(
        'param',
        z.object({
          collection: z.enum(SEARCHABLE_COLLECTIONS),
          id: z.string().min(1).max(64),
        }),
      ),
      async (context) => {
        const { collection, id } = context.req.valid('param');
        return context.json({
          data: await getRecord(reader(context), collection, id),
        });
      },
    );

    router.post(
      '/assistant/stats',
      describeRoute({
        tags,
        summary: 'Statistics',
        operationId: 'itamStats',
        description:
          'Either devices counted by one field (`devicesBy`: status, categoryId, locationId, departmentId, modelId, manufacturerId), or a preset report (`report`: overview, distribution, costs, perPersonCost, expiry, softwareCompliance, repairs, auditResults, changes) over an optional period (`from`, `to`) and scope.',
        ...command(VIEW_ACTION, { command: 'stats' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('json', StatsInput),
      async (context) =>
        context.json({
          data: await stats(reader(context), context.req.valid('json')),
        }),
    );

    router.post(
      '/assistant/availability',
      describeRoute({
        tags,
        summary: 'What can be handed out',
        operationId: 'itamAvailability',
        description:
          'In-stock, unreserved devices of a model or category, stock quantities by name, and entitlements of a software product with their free seats. Read it before proposing an assignment or a purchase.',
        ...command(VIEW_ACTION, { command: 'availability' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('json', AvailabilityInput),
      async (context) =>
        context.json({
          data: await availability(reader(context), context.req.valid('json')),
        }),
    );

    router.get(
      '/assistant/models/match',
      describeRoute({
        tags,
        summary: 'Match a model',
        operationId: 'itamMatchModel',
        description:
          'The registered models, categories and software products a description ("MacBook Pro 14", "Figma", "USB-C dock") refers to, with their ids.',
        ...command(VIEW_ACTION, { command: 'model match' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('query', z.object({ text: z.string().min(1).max(200) })),
      async (context) =>
        context.json({
          data: await matchModel(
            reader(context),
            context.req.valid('query').text,
          ),
        }),
    );

    router.get(
      '/assistant/onboarding/:personId',
      describeRoute({
        tags,
        summary: "A joiner's onboarding plan",
        operationId: 'itamOnboardingPlan',
        description:
          "The kit for the joiner's department and position, what they hold or have reserved, the device, stock item or seat proposed for the rest (the system's choice, or Asset Steward's pick while still free), what is planned from orders and leavers, and the shortfall. Propose exactly these proposals; never choose other items.",
        ...command(VIEW_ACTION, { command: 'onboarding plan' }),
        responses: {
          '200': dataResponse(anyData),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', z.object({ personId: z.string().min(1).max(64) })),
      async (context) =>
        context.json({
          data: await onboardingPlan(
            reader(context),
            context.req.valid('param').personId,
          ),
        }),
    );

    // Device sync (step 4, 2026-10-15): where the management platforms and
    // the register disagree, the way MDM 核对 lists it.
    router.get(
      '/assistant/device-sync/review',
      describeRoute({
        tags,
        summary: 'Device sync review',
        operationId: 'itamDeviceSyncReview',
        description:
          "Where the device management platforms (Intune, Jamf Pro) and the register disagree. `view`: checks — register devices that are silent (`stale`), with another primary user (`userMismatch`) or online while off duty (`statusMismatch`); unregistered — platform records no device answers to, with `suggestedModelId` and, for a serial several devices share, `candidates`; unmanaged — devices in use of a managed category on no platform; ignored — records kept off the register; exempted — devices marked as not to be managed by any platform, with the reason (no longer `unmanaged`); dismissed — differences a person ignored that still hold, with who and when (no longer in `checks`). With `deviceId`, that device's platform records, differences and `exemption`. `connected: false` means no platform is connected.",
        ...command(VIEW_ACTION, { command: 'device-sync review' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('query', DeviceSyncReviewInput),
      async (context) =>
        context.json({
          data: await deviceSyncReview(
            reader(context),
            context.req.valid('query'),
          ),
        }),
    );

    // The operations a plan's step may be, with their parameters: what
    // `plan create` checks a step against.
    router.get(
      '/assistant/plans/ops',
      describeRoute({
        tags,
        summary: 'Plan operations',
        operationId: 'itamPlanOps',
        description:
          "Every operation a plan's step may be, with the JSON Schema of its `params`, and the fields each collection's `create_record` takes. Read the ones you need before writing a plan.",
        ...command(PLAN_ACTION, { command: 'plan ops' }),
        responses: { '200': dataResponse(anyData), ...apiErrorResponses },
      }),
      (context) => context.json({ data: planOps() }),
    );

    router.post(
      '/assistant/plans',
      describeRoute({
        tags,
        summary: 'Propose a plan',
        operationId: 'itamCreatePlan',
        description:
          'Checks every step as the person and keeps the plan for them to confirm; nothing changes until they do. A step that would be refused is named in the error (`PLAN_STEP_REFUSED`, the step in `metadata.field`, the reason in `metadata.detail`).',
        ...command(PLAN_ACTION, { command: 'plan create', bodyFile: 'file' }),
        responses: { '201': dataResponse(anyData), ...apiErrorResponses },
      }),
      apiValidator('json', CreatePlanInput),
      async (context) => {
        const source = await planSource(app, context.get('auth'));
        const plan = await plans().create(
          principalId(context),
          context.req.valid('json'),
          source,
        );
        return context.json({ data: plan }, 201);
      },
    );

    router.get(
      '/assistant/plans',
      describeRoute({
        tags,
        summary: 'List plans',
        operationId: 'itamListPlans',
        description: 'The plans proposed to the reader, those waiting first.',
        ...command(PLAN_ACTION, {
          command: 'plan list',
          columns: ['id', 'title', 'status', 'createdAt'],
        }),
        responses: {
          '200': listResponse(
            anyData,
            z.object({
              page: z.number().int(),
              pageSize: z.number().int(),
              total: z.number().int(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PlansQuery),
      async (context) => {
        const query = context.req.valid('query');
        const result = await plans().list(principalId(context), query);
        return context.json({
          data: result.data,
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
          },
        });
      },
    );

    router.get(
      '/assistant/plans/:planId',
      describeRoute({
        tags,
        summary: 'Get a plan',
        operationId: 'itamGetPlan',
        ...command(PLAN_ACTION, { command: 'plan get' }),
        responses: {
          '200': dataResponse(anyData),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', PlanParams),
      async (context) =>
        context.json({
          data: await plans().get(
            principalId(context),
            context.req.valid('param').planId,
          ),
        }),
    );

    // Deciding is the person's alone: these accept no run token.
    router.post(
      '/assistant/plans/:planId/execute',
      describeRoute({
        tags,
        summary: 'Carry a plan out',
        operationId: 'itamExecutePlan',
        description:
          'As the person, one step after another; a step refused stops the plan there (`failed`), the steps before it staying done. The outcome goes back to the conversation that proposed it.',
        responses: {
          '200': dataResponse(anyData),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', PlanParams),
      apiValidator('json', DecidePlanInput),
      async (context) =>
        context.json({
          data: await plans().execute(
            principalId(context),
            context.req.valid('param').planId,
            context.req.valid('json'),
          ),
        }),
    );

    router.post(
      '/assistant/plans/:planId/void',
      describeRoute({
        tags,
        summary: 'Decline a plan',
        operationId: 'itamVoidPlan',
        description: 'Nothing is changed; the conversation is told.',
        responses: {
          '200': dataResponse(anyData),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(409),
        },
      }),
      apiValidator('param', PlanParams),
      apiValidator('json', z.strictObject({ revision: z.number().int() })),
      async (context) =>
        context.json({
          data: await plans().void(
            principalId(context),
            context.req.valid('param').planId,
            context.req.valid('json').revision,
          ),
        }),
    );

    const routes = new Hono();
    routes.route('/', router);
    return routes;
  });

/** The person a request is made as: the run's, for a run. */
const principalId = (context: Context<Env>): string =>
  context.get('authz').identity.principal.id;

const PlanParams = z.object({ planId: z.string().min(1).max(64) });

const PlansQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(PLAN_STATUSES).optional(),
  conversationId: z.string().max(64).optional(),
});

const DecidePlanInput = z.strictObject({
  revision: z.number().int(),
  skip: z.array(z.number().int().min(1)).optional(),
});

/** The run that proposed it, and where its outcome goes back to. */
async function planSource(
  app: Application,
  auth: AuthEnv['Variables']['auth'],
): Promise<PlanSource> {
  const none: PlanSource = {
    agentId: null,
    agentName: null,
    runId: null,
    conversationId: null,
  };
  const run = runIdentityOf(auth);
  if (!run?.run || !app.container.has(agentsToken)) return none;
  const agents = app.container.resolve(agentsToken);
  const record = run.run.run;
  // A consulted agent's plan is confirmed where the asking run works.
  const home = await agents.conversations.homeOf(agents.tx.read(), {
    subject: { kind: record.subjectKind, id: record.subjectId },
    actorUserId: record.actorUserId,
    parentRunId: record.parentRunId,
  });
  return {
    agentId: run.agent?.id ?? null,
    agentName: run.agent?.name ?? null,
    runId: record.id,
    conversationId: home?.id ?? null,
  };
}

/** ITAM's errors in the standard body the CLI reads. */
function itamApiError(error: unknown): ApiError {
  const make = (
    status: ConstructorParameters<typeof ApiError>[0]['status'],
    reason: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) =>
    new ApiError({
      status,
      reason,
      domain: DOMAIN,
      message,
      ...(metadata ? { metadata } : {}),
    });
  if (error instanceof ApiError) return error;
  if (error instanceof PlanError) {
    const metadata = {
      ...(error.field ? { field: error.field } : {}),
      ...(error.detail ? { detail: error.detail } : {}),
    };
    switch (error.code) {
      case 'NOT_FOUND':
        return make('NOT_FOUND', error.code, error.message);
      case 'CONFLICT':
        return make('ABORTED', error.code, error.message);
      case 'INVALID_INPUT':
        return make('INVALID_ARGUMENT', error.code, error.message, metadata);
      default:
        return make('FAILED_PRECONDITION', error.code, error.message, metadata);
    }
  }
  if (error instanceof ForbiddenError)
    return make('PERMISSION_DENIED', 'FORBIDDEN', error.message);
  if (error instanceof RecordNotFoundError)
    return make('NOT_FOUND', 'NOT_FOUND', error.message);
  if (error instanceof ValidationError)
    return make('INVALID_ARGUMENT', 'VALIDATION', error.message, {
      ...(error.field ? { field: error.field } : {}),
    });
  if (error instanceof DuplicateValueError)
    return make('ALREADY_EXISTS', 'DUPLICATE', error.message);
  if (error instanceof BusinessRuleError)
    return make('FAILED_PRECONDITION', error.rule, error.message);
  return toApiError(error);
}
