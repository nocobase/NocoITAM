import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { readerFor } from '../../providers/itam-agents/reads.js';
import {
  SKILLS_MARKER,
  skillIdsOf,
} from '../../providers/itam-agents/library.js';
import { readMarker } from '../../providers/itam-agents/markers.js';
import {
  WORK_AGENTS,
  workAgentIds,
} from '../../providers/itam-agents/work-agents.js';
import {
  AGENTS,
  RUN_STATUSES,
  agentRunServiceToken,
  type AgentName,
  type AgentRun,
} from '../../providers/itam/agent-runs.js';
import {
  AGENT_TRIGGERS,
  agentSwitches,
  saveAgentSwitch,
} from '../../providers/itam/agent-switches.js';
import { workRun } from '../../providers/itam/ai-model.js';
import { approvalReviewerToken } from '../../providers/itam/approval-review.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { RecordNotFoundError } from '../../providers/itam/errors.js';
import {
  decideCollection,
  errorResponse,
  operationContextOf,
  principalId,
  readJsonObject,
  requireGrant,
  type ItamContext,
} from './http.js';

/**
 * The work agents (2026-10-16, plan "Work agents", step 1):
 *
 * - `/itam/agents` — 智能体工作: each agent with its model, skill,
 *   switches and how it did over 7 and 30 days; its runs, on the records the
 *   reader may read; switching it is an `itam.settings` update.
 * - `/itam/inbox` — 收件箱's 待我决定: the runs the reader decides,
 *   waiting first, then those handled lately; and how many wait.
 * - `/itam/agentRuns` — one review: the newest on a record (its result for
 *   its decider alone), asking for one or redoing it, and deciding on it.
 *   Approving or rejecting from a review is the request's own decision,
 *   under the same `approve` grant its page's button needs.
 *
 * Every path needs a session; what each run says goes to its decider.
 */

const tags = ['ITAM agents'];
const AgentParam = z.enum(AGENTS);
const DAY = 24 * 60 * 60_000;

export const agentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const container = app.container;
    const runs = () => container.resolve(agentRunServiceToken);
    const database = () => container.resolve(databaseManagerToken);
    // Each prefix owns its session check, scoped to its own paths.
    const scoped = () => {
      const routes = new Hono<AuthorizationEnv>();
      routes.use(
        '*',
        container.resolve(authenticationToken).required(),
        container.resolve(authorizationToken).middleware(),
      );
      return routes;
    };
    const agents = scoped();
    const inbox = scoped();
    const agentRuns = scoped();

    /** The request a run is about, named as its decider reads it. */
    const subjectsOf = async (
      list: readonly AgentRun[],
    ): Promise<Map<string, string>> => {
      const ids = [...new Set(list.map((run) => run.refId).filter(Boolean))];
      if (!ids.length) return new Map();
      const rows = await database()
        .query()
        .selectFrom('approvals')
        .select(['id', 'title'])
        .where('id', 'in', ids as string[])
        .execute<{ id: unknown; title: unknown }>();
      return new Map(rows.map((row) => [String(row.id), String(row.title)]));
    };

    /** A run as the reader may see it: its result only when they decide it. */
    const shown = (
      run: AgentRun,
      reader: string,
      titles: Map<string, string>,
    ) => ({
      ...run,
      result: run.deciderId === reader ? run.result : null,
      comment: run.deciderId === reader ? run.comment : null,
      instruction: run.deciderId === reader ? run.instruction : null,
      title: (run.refId && titles.get(run.refId)) ?? null,
    });

    agents.get(
      '/',
      describeRoute({
        tags,
        summary: 'The work agents',
        operationId: 'itamAgents',
        description:
          'Each work agent with its model, its skill, its switches and its runs counted over the last 7 and 30 days.',
      }),
      async (context) => {
        try {
          const now = Date.now();
          const ids = await workAgentIds(database());
          const skills = skillIdsOf(
            await readMarker(database(), SKILLS_MARKER).catch(() => null),
          );
          const switches = await agentSwitches(database());
          const working = await runs().workingNow();
          const data = await Promise.all(
            AGENTS.map(async (agent) => {
              const run = await workRun(container, agent).catch(() => null);
              return {
                agent,
                agentId: ids[agent] ?? null,
                skill: WORK_AGENTS[agent].skill,
                skillId: skills[WORK_AGENTS[agent].skill] ?? null,
                model: run?.model ?? null,
                triggers: AGENT_TRIGGERS[agent],
                switches: switches[agent],
                working: working[agent] ?? 0,
                last7: await runs().counts(agent, new Date(now - 7 * DAY)),
                last30: await runs().counts(agent, new Date(now - 30 * DAY)),
              };
            }),
          );
          return context.json({ data });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agents.put(
      '/:agent/switches',
      describeRoute({
        tags,
        summary: "Switch a work agent's triggers",
        operationId: 'itamAgentSwitches',
        description:
          'Whether the agent runs on its own at all, and on each of its triggers. A person asking by hand is never switched off.',
      }),
      requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
      async (context) => {
        try {
          const agent = AgentParam.parse(context.req.param('agent'));
          const input = z
            .object({
              enabled: z.boolean().optional(),
              triggers: z.record(z.string(), z.boolean()).optional(),
            })
            .strict()
            .parse(await readJsonObject(context));
          const saved = await saveAgentSwitch(database(), agent, input);
          return context.json({ data: saved[agent] });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agents.get(
      '/:agent/runs',
      describeRoute({
        tags,
        summary: "A work agent's runs",
        operationId: 'itamAgentRuns',
        description:
          'The runs of the last `days` (at most 90) on records the reader may read, newest first; `status` narrows them.',
      }),
      async (context) => {
        try {
          const agent: AgentName = AgentParam.parse(context.req.param('agent'));
          const query = z
            .object({
              status: z.enum(RUN_STATUSES).optional(),
              days: z.coerce.number().int().min(1).max(90).default(90),
            })
            .parse(context.req.query());
          const me = principalId(context);
          const listed = await runs().list(agent, {
            since: new Date(Date.now() - query.days * DAY),
            ...(query.status ? { statuses: [query.status] } : {}),
            limit: 200,
          });
          // A run on a record the reader may not read is not theirs to see.
          const reader = readerFor(container, me);
          const readable = new Map<string, boolean>();
          const visible: AgentRun[] = [];
          for (const run of listed) {
            const key = `${run.subjectType}:${run.subjectId}`;
            if (!readable.has(key))
              readable.set(
                key,
                Boolean(
                  await reader
                    .get(run.subjectType, run.subjectId)
                    .catch(() => undefined),
                ),
              );
            if (readable.get(key)) visible.push(run);
            if (visible.length >= 100) break;
          }
          const titles = await subjectsOf(visible);
          return context.json({
            data: visible.map((run) => shown(run, me, titles)),
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    inbox.get(
      '/',
      describeRoute({
        tags,
        summary: '待我决定',
        operationId: 'itamInbox',
        description:
          'The runs the reader decides: waiting, running and failed first, then those handled in the last 30 days.',
      }),
      async (context) => {
        try {
          const me = principalId(context);
          const { open, handled } = await runs().inbox(me);
          const titles = await subjectsOf([...open, ...handled]);
          return context.json({
            data: {
              open: open.map((run) => shown(run, me, titles)),
              handled: handled.map((run) => shown(run, me, titles)),
            },
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    inbox.get(
      '/count',
      describeRoute({
        tags,
        summary: 'How many wait for the reader',
        operationId: 'itamInboxCount',
        description: "The number of runs waiting for the reader's decision.",
      }),
      async (context) => {
        try {
          return context.json({
            data: { waiting: await runs().waitingCount(principalId(context)) },
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agentRuns.get(
      '/latest',
      describeRoute({
        tags,
        summary: "A record's newest review",
        operationId: 'itamLatestAgentRun',
        description:
          'The newest run of an agent on a record the reader may read; its result only for its decider. Null when there is none.',
      }),
      async (context) => {
        try {
          const query = z
            .object({
              agent: AgentParam,
              subjectType: z.enum(['purchaseOrders', 'disposals']),
              subjectId: z.string().min(1).max(64),
            })
            .parse(context.req.query());
          await decideCollection(context, query.subjectType, 'read');
          const me = principalId(context);
          const record = await readerFor(container, me)
            .get(query.subjectType, query.subjectId)
            .catch(() => undefined);
          if (!record)
            throw new RecordNotFoundError(query.subjectType, query.subjectId);
          const run = await runs().latest(
            query.agent,
            query.subjectType,
            query.subjectId,
          );
          if (!run) return context.json({ data: null });
          return context.json({
            data: shown(run, me, await subjectsOf([run])),
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agentRuns.post(
      '/',
      describeRoute({
        tags,
        summary: 'Ask for a review',
        operationId: 'itamAskAgentRun',
        description:
          'The approver asks for a review of a request waiting on them, or redoes a waiting one with their own words (`revise`).',
      }),
      async (context) => {
        try {
          const input = z
            .object({
              agent: z.literal('approvalReview'),
              subjectType: z.enum(['purchaseOrders', 'disposals']),
              subjectId: z.string().min(1).max(64),
              revise: z
                .object({
                  runId: z.string().min(1).max(64),
                  instruction: z.string().min(1).max(1000),
                })
                .strict()
                .optional(),
            })
            .strict()
            .parse(await readJsonObject(context));
          await decideCollection(context, input.subjectType, 'approve');
          const approval = await database()
            .query()
            .selectFrom('approvals')
            .select(['id'])
            .where(
              'subjectType',
              '=',
              input.subjectType === 'purchaseOrders'
                ? 'purchaseOrder'
                : 'disposal',
            )
            .where('subjectId', '=', input.subjectId)
            .where('status', '=', 'pending')
            .executeTakeFirst<{ id: unknown }>();
          if (!approval)
            throw new RecordNotFoundError('approvals', input.subjectId);
          const run = await container.resolve(approvalReviewerToken).request({
            approvalId: String(approval.id),
            trigger: 'asked',
            by: principalId(context),
            ...(input.revise ? { revise: input.revise } : {}),
          });
          return context.json({ data: run }, 201);
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agentRuns.post(
      '/:id/decide',
      describeRoute({
        tags,
        summary: 'Decide on a review',
        operationId: 'itamDecideAgentRun',
        description:
          "The approver approves or rejects the request from its review, with the comment as they leave it; the review is accepted. Needs the request's `approve`.",
      }),
      async (context) => {
        try {
          const input = z
            .object({
              decision: z.enum(['approved', 'rejected']),
              comment: z.string().max(2000).default(''),
            })
            .strict()
            .parse(await readJsonObject(context));
          const run = await runs().get(context.req.param('id'));
          if (!run)
            throw new RecordNotFoundError(
              'itamAgentRuns',
              context.req.param('id'),
            );
          const conditions = await decideCollection(
            context,
            run.subjectType,
            'approve',
          );
          const decided = await container
            .resolve(approvalReviewerToken)
            .decide(
              run.id,
              input,
              operationContextOf(context as ItamContext),
              conditions,
            );
          return context.json({ data: decided });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    agentRuns.post(
      '/:id/dismiss',
      describeRoute({
        tags,
        summary: 'Set a review aside',
        operationId: 'itamDismissAgentRun',
        description:
          'The approver sets the review aside; the request still waits on them.',
      }),
      async (context) => {
        try {
          const run = await container
            .resolve(approvalReviewerToken)
            .dismiss(context.req.param('id'), principalId(context));
          return context.json({ data: run });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    router.route('/itam/agents', agents);
    router.route('/itam/inbox', inbox);
    router.route('/itam/agentRuns', agentRuns);
    return router;
  });
