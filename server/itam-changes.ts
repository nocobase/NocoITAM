import type { Application } from '@nocobase/app-server/application';
import { defineHttpMiddleware } from '@nocobase/app-server/router';

import { itamChangesToken } from './providers/itam/changes.js';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ITAM_API = /\/api\/itam\//;

/**
 * Tells the pages showing live to-dos that the register changed
 * (`server/providers/itam/changes.ts`).
 *
 * Application change (ITAM): an application-wide middleware rather than a
 * line in every route, because a to-do moves with almost any write — a
 * device returned, stock taken back, an approval decided, a leaver marked —
 * and one that forgot to signal would leave a page quietly stale. It runs
 * after the route, so a write that failed signals nothing. The few POSTs
 * that only read (an import preview, the AI write screen) signal too; that
 * costs an open page one extra query, coalesced with everything else.
 * Writes made outside these routes — a confirmed AI tool, a scheduled job —
 * signal where they run.
 */
export const itamChangesHttpMiddleware = defineHttpMiddleware<Application>({
  name: 'itam-changes',
  register(router, app) {
    router.use('*', async (context, next) => {
      await next();
      if (
        READS.has(context.req.method) ||
        context.res.status >= 400 ||
        !ITAM_API.test(context.req.path) ||
        !app.container.has(itamChangesToken)
      )
        return;
      app.container.resolve(itamChangesToken).touched();
    });
  },
});
