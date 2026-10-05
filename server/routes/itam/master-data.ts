import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import { MASTER_DATA_COLLECTIONS } from '../../providers/itam/collections.js';
import {
  historyServiceToken,
  masterDataServiceToken,
} from '../../providers/index.js';
import { ValidationError } from '../../providers/itam/errors.js';
import {
  OWNED_BY_USER,
  recoveryPlan,
} from '../../providers/itam/recovery.js';
import {
  errorResponse,
  parseListOptions,
  principalId,
  readJsonObject,
  decideFor,
  historyKind,
  decideCollection,
  maybeDecide,
} from './http.js';

import { CREATE_DEFAULTS, masterDataSchema } from './master-data-schemas.js';

/**
 * Generic CRUD for the master-data collections at
 * `/api/itam/master/:collection`. Every handler asks authorization for a
 * decision and hands its conditions to the service, which applies them in
 * the query.
 */
/**
 * The collections whose records name whoever answers for them, which a
 * person's recovery reads to say what has to change hands. The service holds
 * the field each one names them in; this is only which decisions to take.
 */
/**
 * Derived rather than listed: `OWNED_BY_USER` is what offboarding reads, and
 * a second copy here would have to be remembered — the stocktake added on
 * 2026-10-05 would have been listed but never decided.
 */
const OWNED_COLLECTIONS: readonly string[] = [
  ...new Set(OWNED_BY_USER.map((entry): string => entry.collection)),
];

const COLLECTION_NAMES = new Set(
  MASTER_DATA_COLLECTIONS.map((collection) => collection.name),
);

const moveSchema = z.object({
  parentId: z.string().min(1).nullable(),
  index: z.number().int().min(0),
});

export const masterDataRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const masterData = app.container.resolve(masterDataServiceToken);
    const history = app.container.resolve(historyServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    routes.use('/:collection/*', async (context, next) => {
      if (!COLLECTION_NAMES.has(context.req.param('collection'))) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Unknown collection' },
          404,
        );
      }
      await next();
    });
    routes.use('/:collection', async (context, next) => {
      if (!COLLECTION_NAMES.has(context.req.param('collection'))) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Unknown collection' },
          404,
        );
      }
      await next();
    });

    routes.get('/:collection', async (context) => {
      const collection = context.req.param('collection');
      try {
        const conditions = await decideCollection(context, collection, 'read');
        return context.json(
          await masterData.list(
            collection,
            parseListOptions(context),
            conditions,
          ),
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/people/stats', async (context) => {
      try {
        await decideCollection(context, 'people', 'read');
        return context.json({ data: await masterData.peopleStats() });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:collection/counts', async (context) => {
      const collection = context.req.param('collection');
      try {
        await decideCollection(context, collection, 'read');
        return context.json({ data: await masterData.listCounts(collection) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:collection/:id', async (context) => {
      const collection = context.req.param('collection');
      try {
        const conditions = await decideCollection(context, collection, 'read');
        const record = await masterData.get(
          collection,
          context.req.param('id'),
          conditions,
        );
        return record
          ? context.json({ data: record })
          : context.json(
              { code: 'NOT_FOUND', message: 'Record not found' },
              404,
            );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:collection/:id/delete-impact', async (context) => {
      const collection = context.req.param('collection');
      try {
        await decideCollection(context, collection, 'delete');
        return context.json({
          data: await masterData.deleteImpact(
            collection,
            context.req.param('id'),
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:collection/:id/stats', async (context) => {
      const collection = context.req.param('collection');
      try {
        const conditions = await decideCollection(context, collection, 'read');
        const id = context.req.param('id');
        if (!(await masterData.get(collection, id, conditions))) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        return context.json({ data: await masterData.stats(collection, id) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/:collection/:id/history', async (context) => {
      const collection = context.req.param('collection');
      try {
        const conditions = await decideCollection(context, collection, 'read');
        const id = context.req.param('id');
        if (!(await masterData.get(collection, id, conditions))) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        const options = parseListOptions(context);
        const limit = options.pageSize ?? 30;
        const offset = ((options.page ?? 1) - 1) * limit;
        const subject = { subjectType: collection, subjectId: id };
        return context.json(
          await history.timeline(subject, {
            limit,
            offset,
            kind: historyKind(context),
          }),
        );
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.get('/people/:id/holdings', async (context) => {
      try {
        const conditions = await decideCollection(context, 'people', 'read');
        const id = context.req.param('id');
        if (!(await masterData.get('people', id, conditions))) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        return context.json({ data: await masterData.personHoldings(id) });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    /**
     * What is still to be recovered from a person, and what is to be done
     * with each item.
     *
     * The same plan the nightly job prepares (`recoveryPlan`), read live: the
     * stored one is a snapshot of the night it was made, and somebody working
     * through the list needs to see what is left now. Items whose handling is
     * `none` are left out — a device already lost or disposed of is not in
     * anybody's hands to give back. Read under the person's own `read`
     * decision, like the holdings beside it; each action the page then offers
     * is authorized by its own endpoint.
     */
    routes.get('/people/:id/recovery', async (context) => {
      try {
        const conditions = await decideCollection(context, 'people', 'read');
        const id = context.req.param('id');
        const person = await masterData.get('people', id, conditions);
        if (!person) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        const items = recoveryPlan(await masterData.personHoldings(id)).filter(
          (item) => item.handling !== 'none',
        );
        // What they answer for is read under each collection's own `read`
        // decision, and a collection this caller cannot read is left out
        // rather than refusing the whole answer.
        const allowed = new Map<string, DatabaseAuthorizationConditions>();
        for (const collection of OWNED_COLLECTIONS) {
          const conditions = await maybeDecide(context, collection, 'read');
          if (conditions) allowed.set(collection, conditions);
        }
        // What they had the moment they left, which is what the live list
        // is progress against. Anything in it that is no longer held has
        // been settled — the list stays whole so the reader sees what was
        // done as well as what is left, and a count of five that becomes a
        // count of two says nothing about which three.
        const snapshot = await masterData.belongingsSnapshot(id);
        const owned = await masterData.personOwnedRecords(id, allowed);
        const outstanding = new Set(
          items.map((item) => `${item.kind}:${item.id}`),
        );
        const settled = (snapshot?.items ?? []).filter(
          (item) => !outstanding.has(`${item.kind}:${item.id}`),
        );
        // A record handed over leaves the list the same way a device
        // returned does, so it counts the same. Only the collections this
        // caller may read are counted, as only those are listed.
        const stillOwned = new Set(
          owned.map((record) => `${record.collection}:${record.id}`),
        );
        const settledOwned = (snapshot?.owned ?? []).filter(
          (record) =>
            allowed.has(record.collection) &&
            !stillOwned.has(`${record.collection}:${record.id}`),
        );
        const done = settled.length + settledOwned.length;
        const total = done + items.length + owned.length;
        return context.json({
          data: {
            // The page shows the leaving sentence only for somebody who has
            // left, and that answer belongs with the plan rather than to a
            // second request for the record.
            employmentStatus: person.employmentStatus ?? null,
            leaveDate: person.leaveDate ?? null,
            items,
            settled,
            owned,
            settledOwned,
            // Shown from the moment there is a snapshot, including before
            // anything is settled: 0 / 5 is the size of the job, which is
            // worth knowing before starting it.
            progress: snapshot ? { done, total } : null,
          },
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/people/:id/mark-left', async (context) => {
      try {
        // A business operation, so it is decided on its own resource.
        const conditions = await decideFor(context, 'people', 'markLeft');
        return context.json({
          data: await masterData.markPersonLeft(
            context.req.param('id'),
            principalId(context),
            conditions,
          ),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/:collection/:id/move', async (context) => {
      const collection = context.req.param('collection');
      try {
        const body = moveSchema.parse(await readJsonObject(context));
        const conditions = await decideFor(context, collection, 'update', {
          fields: { input: ['parentId', 'sort'] },
        });
        await masterData.move(
          collection,
          context.req.param('id'),
          body,
          principalId(context),
          conditions,
        );
        return context.json({ data: { ok: true } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.post('/:collection', async (context) => {
      const collection = context.req.param('collection');
      try {
        const schema = masterDataSchema(collection);
        if (!schema) throw new ValidationError('Unknown collection');
        const input = {
          ...CREATE_DEFAULTS[collection],
          ...schema.strict().parse(await readJsonObject(context)),
        };
        const conditions = await decideFor(context, collection, 'create', {
          fields: { input: Object.keys(input) },
        });
        const created = await masterData.create(
          collection,
          input,
          principalId(context),
          conditions,
        );
        return context.json({ data: created }, 201);
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.patch('/:collection/:id', async (context) => {
      const collection = context.req.param('collection');
      try {
        const schema = masterDataSchema(collection);
        if (!schema) throw new ValidationError('Unknown collection');
        const input = schema
          .strict()
          .partial()
          .parse(await readJsonObject(context));
        if (Object.keys(input).length === 0) {
          throw new ValidationError('Nothing to update');
        }
        const conditions = await decideFor(context, collection, 'update', {
          fields: { input: Object.keys(input) },
        });
        const updated = await masterData.update(
          collection,
          context.req.param('id'),
          input,
          principalId(context),
          conditions,
        );
        return context.json({ data: updated });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    routes.delete('/:collection/:id', async (context) => {
      const collection = context.req.param('collection');
      try {
        const conditions = await decideCollection(
          context,
          collection,
          'delete',
        );
        await masterData.delete(
          collection,
          context.req.param('id'),
          principalId(context),
          conditions,
        );
        return context.json({ data: { deleted: 1 } });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/master', routes);
    return router;
  });
