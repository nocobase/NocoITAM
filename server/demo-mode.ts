import type { MiddlewareHandler } from 'hono';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  defineHttpMiddleware,
} from '@nocobase/app-server/router';
import { getRequestLocale, getRequestTranslator } from '@nocobase/i18n/server';
import { isDemoMode } from './providers/itam/demo-mode.js';

/**
 * The plugin guards SQL. Refuse ITAM commands before uploads, model calls or
 * work queued beyond a request can produce an effect. Read-only POST queries
 * used by page initialization remain available; plugin administration keeps
 * its own authorization and lifecycle exemption.
 */
export const demoEffectsHttpMiddleware = defineHttpMiddleware<Application>({
  name: 'itam-demo-effects',
  register(router, app) {
    const guard: MiddlewareHandler = async (context, next) => {
      if (
        !isDemoMode(app.container) ||
        ['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)
      ) {
        await next();
        return;
      }
      const translator = getRequestTranslator(
        context,
        '@nocobase/app-plugin-demo-mode',
      );
      const locale = getRequestLocale(context);
      context.header('Server-Timing', 'demo-read-only');
      return apiErrorHandler(
        new ApiError({
          status: 'FAILED_PRECONDITION',
          reason: 'DEMO_READ_ONLY',
          domain: 'demoMode',
          message: 'This is a demo. Changes cannot be saved.',
          ...(locale
            ? {
                localizedMessage: {
                  locale,
                  message: translator('errors.readOnly', {
                    ns: '@nocobase/app-plugin-demo-mode',
                  }),
                },
              }
            : {}),
        }),
        context,
      );
    };
    for (const path of [
      '/api/itam/*',
      '/api/assistant/*',
      '/api/agents/*',
      '/api/files/*',
      '/api/itamAttachments/uploadOne',
      '/api/itamAttachments/uploadMany',
      '/api/itamAttachments/deleteOne',
      '/api/mail/*',
      '/api/scheduler/*',
    ])
      router.use(path, guard);
  },
});
