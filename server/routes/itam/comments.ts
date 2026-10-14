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

import { commentServiceToken } from '../../providers/index.js';
import { compileAuthzScope } from '../../providers/itam/authz-filter.js';
import {
  COMMENT_LIMIT,
  COMMENT_SUBJECTS,
} from '../../providers/itam/comments.js';
import { RecordNotFoundError } from '../../providers/itam/errors.js';
import {
  decideFor,
  errorResponse,
  principalId,
  readJsonObject,
  type ItamContext,
} from './http.js';

const id = z.string().min(1).max(64);
const subjectType = z.enum(
  Object.keys(COMMENT_SUBJECTS) as [string, ...string[]],
);
const mentions = z.array(id).max(50).optional();

const addSchema = z
  .object({
    subjectType,
    subjectId: id,
    body: z.string().max(COMMENT_LIMIT),
    mentions,
    fileIds: z.array(id).max(20).optional(),
    replyToId: id.optional(),
  })
  .strict();

const editSchema = z
  .object({ body: z.string().max(COMMENT_LIMIT), mentions })
  .strict();

/**
 * `/api/itam/comments`: what people write on a record's history. Whoever
 * may read a record may comment on it and reply, as in NocoCRM; a comment
 * is changed or deleted by its author alone (the service's rule). The
 * comments themselves are read with the record's history.
 */
export const commentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const comments = app.container.resolve(commentServiceToken);
    const database = app.container.resolve(databaseManagerToken);
    routes.use('*', auth.required(), authorization.middleware());

    // The caller may read the record itself, not only its collection.
    const requireReadable = async (
      context: ItamContext,
      type: string,
      subjectId: string,
    ): Promise<void> => {
      const conditions = await decideFor(context, type, 'read');
      const row = await database
        .query()
        .selectFrom(type)
        .select('id')
        .where('id', '=', subjectId)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst();
      if (!row) throw new RecordNotFoundError(type, subjectId);
    };

    routes.post('/', async (context) => {
      try {
        const input = addSchema.parse(await readJsonObject(context));
        await requireReadable(context, input.subjectType, input.subjectId);
        return context.json(
          { data: await comments.add(principalId(context), input) },
          201,
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.patch('/:id', async (context) => {
      try {
        const input = editSchema.parse(await readJsonObject(context));
        const subject = await comments.subjectOf(context.req.param('id'));
        await requireReadable(context, subject.subjectType, subject.subjectId);
        return context.json({
          data: await comments.edit(
            principalId(context),
            context.req.param('id'),
            input,
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.delete('/:id', async (context) => {
      try {
        const subject = await comments.subjectOf(context.req.param('id'));
        await requireReadable(context, subject.subjectType, subject.subjectId);
        await comments.remove(principalId(context), context.req.param('id'));
        return context.json({ data: { id: context.req.param('id') } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/comments', routes);
    return router;
  });
