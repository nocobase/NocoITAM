import { buildRepositoryPolicy } from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineFileRepositoryApiRoutes,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  defineRootRoutes,
  type AppRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  attachmentServiceToken,
  documentReaderToken,
} from '../../providers/index.js';
import {
  ATTACHMENT_OWNER_TYPES,
  type AttachmentOwnerType,
} from '../../providers/itam/attachments.js';
import {
  errorResponse,
  principalId,
  readJsonObject,
  type ItamContext,
} from './http.js';

/**
 * File upload / download for ITAM attachments, plus the links between files
 * and records. The file plugin's routes are public by design; every path
 * they expose is listed here and put behind authentication. Linking a file
 * to a record requires the record's `update` grant; reading its attachments
 * requires `read`.
 */
export const ATTACHMENT_RESOURCE = 'itamAttachments';
const ACCESS_PATH = '/uploads/itam';

/**
 * Since template beta.43 a file Repository is bound to a Policy. These routes
 * authorize every call themselves against the owner record's grants (an
 * upload needs the record's `update`, a read its `read`), so the Repository
 * Policy leaves the rows open and the route stays the gate — the same
 * arrangement as `unrestricted()` for the ITAM services.
 */
const FILE_POLICY = buildRepositoryPolicy((policy) =>
  policy.read(true).create(true).update(true).delete(true),
);
const FILE_ACTIONS = [
  'findMany',
  'findOne',
  'deleteOne',
  'uploadOne',
  'uploadMany',
] as const;

const fileContributions = defineFileRepositoryApiRoutes({
  repositories: [
    {
      name: ATTACHMENT_RESOURCE,
      collection: 'itamFiles',
      disk: 'local',
      accessPath: ACCESS_PATH,
      accessMode: 'stream',
      policy: FILE_POLICY,
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        deleteOne: {},
        uploadOne: { maxSize: 20 * 1024 * 1024 },
        uploadMany: { maxSize: 60 * 1024 * 1024 },
      },
    },
  ],
});

/** The plugin's routers, each mounted behind `auth.required()` on its exact paths. */
export const attachmentFileRoutes: readonly AppRouteContribution<Application>[] =
  fileContributions.map((contribution) =>
    contribution.scope === 'api'
      ? defineApiRoutes<Application>(async (app) => {
          const auth = app.container.resolve(authenticationToken);
          const router = new Hono();
          for (const action of FILE_ACTIONS) {
            router.use(`/${ATTACHMENT_RESOURCE}:${action}`, auth.required());
          }
          router.route('/', await contribution.createRouter(app));
          return router;
        })
      : defineRootRoutes<Application>(async (app) => {
          const auth = app.container.resolve(authenticationToken);
          const router = new Hono();
          router.use(`${ACCESS_PATH}/*`, auth.required());
          router.route('/', await contribution.createRouter(app));
          return router;
        }),
  );

const ownerType = z.enum(ATTACHMENT_OWNER_TYPES);

export const attachmentLinkRoutes: AppRouteContribution<Application> =
  defineApiRoutes<Application>((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const attachments = app.container.resolve(attachmentServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    const allowed = async (
      context: ItamContext,
      type: AttachmentOwnerType,
      action: 'read' | 'update',
    ) => {
      const decision = await context.get('authz').authorize({
        resource: { type: 'database.collection', id: `main.${type}` },
        action,
      });
      return decision.effect !== 'deny';
    };

    routes.get('/:ownerType/:ownerId', async (context) => {
      try {
        const type = ownerType.parse(context.req.param('ownerType'));
        if (!(await allowed(context, type, 'read')))
          return context.json(
            { code: 'FORBIDDEN', message: 'Not allowed' },
            403,
          );
        const groups = await attachments.grouped(
          type,
          context.req.param('ownerId'),
        );
        const files = app.container
          .resolve(serverFileRepositoryManagerToken)
          .repository('itamFiles', {
            disk: 'local',
            accessPath: ACCESS_PATH,
            policy: FILE_POLICY,
          });
        const basePath = (app.publicBasePath ?? '').replace(/\/$/, '');
        return context.json({
          // Raw database rows do not carry the file plugin's derived content URL.
          // Match its public route decoration, including the deployment base path.
          data: groups.map((group) => ({
            ...group,
            files: group.files.map((file) => ({
              ...file,
              contentUrl: `${basePath}${files.getUrl({ id: String(file.id), ext: typeof file.ext === 'string' ? file.ext : '' })}`,
            })),
          })),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/:ownerType/:ownerId', async (context) => {
      try {
        const type = ownerType.parse(context.req.param('ownerType'));
        if (!(await allowed(context, type, 'update')))
          return context.json(
            { code: 'FORBIDDEN', message: 'Not allowed' },
            403,
          );
        const { fileIds } = z
          .object({
            fileIds: z.array(z.string().min(1).max(64)).min(1).max(50),
          })
          .strict()
          .parse(await readJsonObject(context));
        return context.json(
          {
            data: await attachments.link(
              type,
              context.req.param('ownerId'),
              fileIds,
              { actorId: principalId(context) },
            ),
          },
          201,
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // The text of a document attached to a record, for AI to read into a
    // form on it (2026-10-23: a repair's report, a disposal's certificate).
    // Only a file linked to that record is read, under the record's `read`:
    // it is the text of a file the reader may already open.
    routes.post('/:ownerType/:ownerId/document-text', async (context) => {
      try {
        const type = ownerType.parse(context.req.param('ownerType'));
        if (!(await allowed(context, type, 'read')))
          return context.json(
            { code: 'FORBIDDEN', message: 'Not allowed' },
            403,
          );
        const { fileId } = z
          .object({ fileId: z.string().min(1).max(64) })
          .strict()
          .parse(await readJsonObject(context));
        const groups = await attachments.grouped(
          type,
          context.req.param('ownerId'),
        );
        if (
          !groups.some((group) =>
            group.files.some((file) => String(file.id) === fileId),
          )
        )
          return context.json(
            { code: 'NOT_FOUND', message: 'File not found' },
            404,
          );
        const document = await app.container
          .resolve(documentReaderToken)(fileId)
          .catch(() => undefined);
        return context.json({
          data: {
            text: document?.text ?? null,
            truncated: document?.truncated ?? false,
          },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.delete('/links/:linkId', async (context) => {
      try {
        // The link's owner grant is checked through the collection the link
        // belongs to; the service resolves it from the link itself.
        await attachments.unlink(context.req.param('linkId'), {
          actorId: principalId(context),
        });
        return context.json({ data: { deleted: 1 } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/attachments', routes);
    return router;
  });
