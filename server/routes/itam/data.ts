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
import { databaseManagerToken } from '@nocobase/db';
import { z } from 'zod';

import { demoServiceToken, importServiceToken } from '../../providers/index.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { findItamCollection } from '../../providers/itam/collections.js';
import { toCsv } from '../../providers/itam/csv.js';
import {
  nameOf,
  referenceNames,
} from '../../providers/itam/reference-names.js';
import {
  createDomainAccess,
  LISTABLE_COLLECTIONS,
} from '../../providers/itam/domains.js';
import { outputFields } from '../../providers/itam/authz-filter.js';
import { IMPORT_SPECS } from '../../providers/itam/imports.js';
import {
  decideCollection,
  errorResponse,
  parseListOptions,
  principalId,
  readJsonObject,
} from './http.js';

/**
 * Data in and out. `/api/itam/imports/:collection/{preview,validate,commit}`
 * run the CSV wizard (commit needs `create` and, for updates, `update` on the
 * collection); `/api/itam/exports/:collection` returns the current filter as
 * CSV with the caller's readable columns.
 */
const collectionParam = z.enum(LISTABLE_COLLECTIONS);
const importBody = z
  .object({
    csv: z.string().min(1).max(10_000_000),
    mapping: z.record(z.string(), z.string().optional()).optional(),
  })
  .strict();

export const dataRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const imports = app.container.resolve(importServiceToken);
    const demo = app.container.resolve(demoServiceToken);
    const domains = createDomainAccess(app.container);

    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/imports/:collection/spec', async (context) => {
      try {
        const collection = collectionParam.parse(
          context.req.param('collection'),
        );
        const spec = IMPORT_SPECS[collection];
        if (!spec)
          return context.json(
            { code: 'NOT_FOUND', message: 'Import not supported' },
            404,
          );
        await decideCollection(context, collection, 'create');
        return context.json({
          data: { fields: spec.fields, match: spec.match ?? [] },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });
    routes.post('/imports/:collection/:step', async (context) => {
      try {
        const collection = collectionParam.parse(
          context.req.param('collection'),
        );
        const step = z
          .enum(['preview', 'validate', 'commit'])
          .parse(context.req.param('step'));
        const body = importBody.parse(await readJsonObject(context));
        const conditions = await decideCollection(
          context,
          collection,
          'create',
        );
        if (step === 'preview')
          return context.json({ data: imports.preview(collection, body.csv) });
        const mapping =
          body.mapping ?? imports.preview(collection, body.csv).mapping;
        if (step === 'validate')
          return context.json({
            data: await imports.validate(
              collection,
              body.csv,
              mapping,
              conditions,
            ),
          });
        return context.json({
          data: await imports.commit(
            collection,
            body.csv,
            mapping,
            { actorId: principalId(context), sourceType: 'import' },
            conditions,
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/exports/:collection', async (context) => {
      try {
        const collection = collectionParam.parse(
          context.req.param('collection'),
        );
        const conditions = await decideCollection(context, collection, 'read');
        const options = parseListOptions(context);
        const result = await domains.list(
          collection,
          { ...options, page: 1, pageSize: 5000 },
          conditions,
        );
        const requested = new URL(context.req.url).searchParams.get('columns');
        const readable = outputFields(
          findItamCollection(collection)?.fields ??
            Object.keys(result.data[0] ?? {}),
          conditions,
        );
        const columns = requested
          ? requested.split(',').filter((column) => readable.includes(column))
          : readable;
        // References export as the names the pages show (a model, a
        // location, a person), which is also what an import accepts; a
        // collection the caller may not read keeps its ids.
        const names = await referenceNames(
          app.container.resolve(databaseManagerToken),
          result.data,
          {
            ownCollection: collection,
            readable: async (other) =>
              other === 'user' ||
              other === collection ||
              (await decideCollection(context, other, 'read').then(
                () => true,
                () => false,
              )),
          },
        );
        const rows = result.data.map((row) =>
          Object.fromEntries(
            columns.map((column) => [
              column,
              nameOf(names, row, column, collection),
            ]),
          ),
        );
        return context.body(toCsv(columns, rows), 200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${collection}.csv"`,
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // Demo data: administrators generate or clear it from the settings page.
    const admin = authorization.guard(() => ({
      resource: ITAM_SETTINGS_RESOURCE,
      action: 'update',
    }));
    routes.get('/demo', admin, async (context) => {
      try {
        return context.json({ data: await demo.status() });
      } catch (error) {
        return errorResponse(context, error);
      }
    });
    routes.post('/demo/generate', admin, async (context) => {
      try {
        return context.json({
          data: await demo.generate(principalId(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });
    routes.post('/demo/clear', admin, async (context) => {
      try {
        return context.json({ data: await demo.clear(principalId(context)) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam', routes);
    return router;
  },
);
