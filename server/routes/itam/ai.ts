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
import { Hono } from 'hono';
import { z } from 'zod';

import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';

import { scopeFor } from '../../providers/itam/ai-bridge.js';
import { screenWrite } from '../../providers/itam/ai-writes.js';
import { AI_RECORD_TOOLS, screenRecord } from './ai-records.js';
import { errorResponse, principalId, readJsonObject } from './http.js';

/**
 * `/api/itam/ai`: whether the assistant is available, and the pre-check the
 * write tools' cards ask. Everything else — the chat, its tools, the
 * confirmation cards — runs on the AI employee plugin's `/api/ai`.
 */
export const aiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);

    routes.use('*', auth.required(), authorization.middleware());

    // Available means what the plugin says: a model it can use, and Noco
    // switched on at 设置 → AI 员工 (the CRM decides the same way). There is
    // no ITAM switch of its own beside those (removed 2026-09-27).
    routes.get('/status', async (context) => {
      try {
        let configured = false;
        let enabled = false;
        if (app.container.has(aiManagerToken)) {
          const ai = app.container.resolve(aiManagerToken);
          try {
            await ai.llmProviderManager.resolveModel();
            configured = true;
          } catch {
            configured = false;
          }
          const employee = await ai.employeeManager.getEmployee('itam');
          enabled = employee !== undefined && employee.enabled !== false;
        }
        return context.json({
          data: { configured, enabled, employee: 'itam' },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // Whether the signed-in user could run a write tool's call as it
    // stands, asked by its card before confirmation is offered: the
    // arguments and every grant the operation needs. The operation itself
    // still decides the rules that depend on the record's state.
    routes.post('/screen', async (context) => {
      try {
        const input = z
          .object({ tool: z.string().min(1).max(64), args: z.unknown() })
          .strict()
          .parse(await readJsonObject(context));
        const scope = scopeFor(app.container, principalId(context));
        return context.json({
          data: (AI_RECORD_TOOLS as string[]).includes(input.tool)
            ? await screenRecord(app.container, scope, input.tool, input.args)
            : await screenWrite(app.container, scope, input.tool, input.args),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/ai', routes);
    return router;
  },
);
