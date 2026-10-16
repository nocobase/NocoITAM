import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import { receiptRunServiceToken } from '../../providers/index.js';
import { readSnapshotsToken } from '../../providers/itam-agents/index.js';
import { CONTEXT_KINDS } from '../../providers/itam-agents/context.js';
import {
  discardSearchAnswer,
  keepSearchAnswer,
} from '../../providers/itam-agents/search-answers.js';
import { scopeFor } from '../../providers/itam/ai-bridge.js';
import {
  aiAvailable,
  openSession,
  readSkill,
} from '../../providers/itam/ai-model.js';
import { BusinessRuleError } from '../../providers/itam/errors.js';
import { settingsServiceToken } from '../../providers/itam/settings.js';
import { runEval, SKILL_EVALS } from '../../providers/itam/skill-evals.js';
import {
  READING_GRANTS,
  READING_TASKS,
  readForForm,
} from '../../providers/itam/ai-reading.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import {
  ForbiddenError,
  errorResponse,
  principalId,
  readJsonObject,
  requireGrant,
} from './http.js';

/**
 * `/api/itam/ai`: whether the assistant is available, the readings AI 整理
 * and receiving by delivery document ask for, and what those readings have
 * done. The chat itself is the Agents plugin's (template 1.0.0-beta.64).
 */
export const aiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    routes.use('*', auth.required(), authorization.middleware());

    // Available means a model to ask: Noco's, else the system's default
    // chat model (`itamModel` in ai-model.ts). The shell asks on every load,
    // so this is also where the collections the reader may read are noted
    // for the chat's page context, which is resolved where authorization
    // cannot be asked (itam-agents/context.ts).
    routes.get('/status', async (context) => {
      try {
        const userId = principalId(context);
        if (app.container.has(readSnapshotsToken)) {
          const scope = scopeFor(app.container, userId);
          const readable: string[] = [];
          for (const collection of Object.keys(CONTEXT_KINDS))
            if (await scope.may(collection, 'read').catch(() => undefined))
              readable.push(collection);
          app.container.resolve(readSnapshotsToken).set(userId, readable);
        }
        return context.json({
          data: { available: await aiAvailable(app.container) },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // A form filled from material (AI 整理, a delivery document): the model
    // answers in the shape the form's handler takes, which then checks it
    // as it always has. Each task asks the grant its form needs.
    routes.post('/read', async (context) => {
      try {
        const input = z
          .object({
            task: z.enum(READING_TASKS),
            material: z.string().min(1).max(200_000),
            context: z.record(z.string(), z.unknown()).default({}),
            instruction: z.string().max(2000).optional(),
            language: z.string().min(2).max(32).default('en-US'),
          })
          .strict()
          .parse(await readJsonObject(context));
        const userId = principalId(context);
        const scope = scopeFor(app.container, userId);
        let granted = false;
        for (const [collection, action] of READING_GRANTS[input.task])
          if (await scope.may(collection, action)) granted = true;
        if (!granted) throw new ForbiddenError('Not allowed');
        return context.json({
          data: await readForForm(app.container, userId, input),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // What the assistant has done reading delivery documents: every run by
    // how it ended, what the receivers kept of its proposals field by field
    // — the record the trust ladder reads (guideline 3.5) — and the latest
    // runs, each naming who started it. Shown on the settings page, so it
    // takes the settings grant.
    routes.get(
      '/receipt-runs',
      requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
      async (context) => {
        try {
          const runs = app.container.resolve(receiptRunServiceToken);
          return context.json({
            data: {
              summary: await runs.summary(),
              recent: await runs.recent(10),
            },
          });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    // A method skill's eval set, run against the model Noco answers with
    // (device sync, step 4, 2026-10-15): what to run before changing a
    // skill, its instructions or the model, and attach to the change
    // (NocoSolution guideline 3.5). Slow — one model call per case — and an
    // administrator's, so it takes the settings grant.
    routes.post(
      '/evals/:skill',
      requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
      async (context) => {
        try {
          const skill = context.req.param('skill');
          if (!SKILL_EVALS[skill])
            return context.json(
              { code: 'NOT_FOUND', message: `No eval set for ${skill}` },
              404,
            );
          if (!(await aiAvailable(app.container)))
            throw new BusinessRuleError(
              'No model is configured for the assistant',
              'ai.unavailable',
            );
          const { timeZone } = await app.container
            .resolve(settingsServiceToken)
            .get('general');
          const report = await runEval({
            skill,
            instructions: await readSkill(app.container, skill),
            open: (system) => openSession(app.container, { timeZone, system }),
            signal: AbortSignal.timeout(10 * 60_000),
          });
          return context.json({ data: report });
        } catch (error) {
          return errorResponse(context, error);
        }
      },
    );

    // The global search's answers (itam-agents/search-answers.ts): kept as
    // one of ITAM's conversations when the reader goes on asking, deleted
    // when they leave the answer. Each acts on the reader's own conversation
    // only.
    const conversationIdOf = (raw: string): string =>
      z.string().min(1).max(64).parse(raw);
    routes.post('/search-answers/:conversationId/keep', async (context) => {
      try {
        const { title } = z
          .object({ title: z.string().trim().min(1).max(200).optional() })
          .parse(await readJsonObject(context));
        const kept = await keepSearchAnswer(
          app.container.resolve(databaseManagerToken),
          principalId(context),
          conversationIdOf(context.req.param('conversationId')),
          title,
        );
        if (!kept)
          return context.json(
            { code: 'NOT_FOUND', message: 'No such answer' },
            404,
          );
        return context.json({ data: { kept: true } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });
    routes.delete('/search-answers/:conversationId', async (context) => {
      try {
        await discardSearchAnswer(
          app.container.resolve(databaseManagerToken),
          principalId(context),
          conversationIdOf(context.req.param('conversationId')),
        );
        return context.json({ data: { discarded: true } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/ai', routes);
    return router;
  },
);
