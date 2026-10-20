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
import {
  BusinessRuleError,
  ValidationError,
} from '../../providers/itam/errors.js';
import { OWNED_BY_USER, recoveryPlan } from '../../providers/itam/recovery.js';
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
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { leaverAccountsToken } from '../../providers/itam/leaver-accounts.js';
import { onboardingServiceToken } from '../../providers/itam/onboarding.js';
import { onboardingAdvisorToken } from '../../providers/itam/onboarding-advisor.js';
import {
  MASTER_CAPTURE_COLLECTIONS,
  matchMasterCapture,
  type MasterCaptureCollection,
} from '../../providers/itam/master-capture.js';
import { databaseManagerToken } from '@nocobase/db';

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

/** What AI 整理 hands back for a new model or software product. */
const masterCaptureSchema = z.object({
  name: z.string().nullish(),
  code: z.string().nullish(),
  manufacturerName: z.string().nullish(),
  categoryId: z.string().nullish(),
  specification: z.string().nullish(),
  warrantyMonths: z.number().nullish(),
  releaseDate: z.string().nullish(),
  eolDate: z.string().nullish(),
  eosDate: z.string().nullish(),
  deliveryMethod: z.string().nullish(),
  description: z.string().nullish(),
  website: z.string().nullish(),
  attributes: z.record(z.string(), z.unknown()).nullish(),
  uncertain: z.array(z.string()).max(50).nullish(),
  sources: z
    .array(z.object({ title: z.string().nullish(), url: z.string().nullish() }))
    .max(50)
    .nullish(),
});

const moveSchema = z.object({
  parentId: z.string().min(1).nullable(),
  index: z.number().int().min(0),
});

/**
 * `?origin=ai`: what is saved was filled or changed by AI 整理 or 完善 and
 * checked by the person saving it (2026-10-20); its history says so. Only
 * that value; any other is ignored.
 */
const aiOrigin = (context: {
  req: { query(name: string): string | undefined };
}): 'ai' | undefined =>
  context.req.query('origin') === 'ai' ? 'ai' : undefined;

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
    // 入职配备: the kit that applies to this person, what they already have
    // and what stock would make up the rest. Read under the people grant;
    // every proposal is carried out by its own operation, which checks its
    // own grant.
    routes.get('/people/:id/onboarding', async (context) => {
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
        return context.json({
          data: await app.container.resolve(onboardingServiceToken).plan(id),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // 不需要: an item of this person's kit they will not be given — they
    // brought their own monitor, they work on Windows — or the mark taken
    // back. It is part of the person, so it takes the people `update`
    // grant; nothing is proposed or ordered for a marked item, and it no
    // longer keeps them in 入职准备.
    routes.post('/people/:id/onboarding/waive', async (context) => {
      try {
        const conditions = await decideCollection(context, 'people', 'update');
        const id = context.req.param('id');
        const person = await masterData.get('people', id, {
          ...conditions,
          fieldAccess: undefined,
        });
        if (!person) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        const input = z
          .object({ key: z.string().min(1).max(200), waived: z.boolean() })
          .strict()
          .parse(await readJsonObject(context));
        return context.json({
          data: await app.container
            .resolve(onboardingServiceToken)
            .waive(id, input.key, input.waived, principalId(context)),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // A department's 入职配置 tab: its default kit (or the one it takes from
    // above), and each of its positions with its own kit or the default's.
    // Read under the department's read grant; every change is the kits' or
    // the department's own write.
    routes.get('/departments/:id/onboarding-kits', async (context) => {
      try {
        const conditions = await decideCollection(
          context,
          'departments',
          'read',
        );
        const id = context.req.param('id');
        const department = await masterData.get('departments', id, conditions);
        if (!department) {
          return context.json(
            { code: 'NOT_FOUND', message: 'Record not found' },
            404,
          );
        }
        return context.json({
          data: await app.container
            .resolve(onboardingServiceToken)
            .departmentKits(id),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    // 重新建议: Asset Steward chooses this joiner's equipment again, in the
    // background. Only their 入职负责人 may ask, because the run is made as
    // that person, under their grants and in their conversations; anybody
    // else hands the joiner over first. Answers at once — the card follows
    // the run through the plan's `advice`.
    routes.post('/people/:id/onboarding/advise', async (context) => {
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
        if (person.onboardingOwnerId !== principalId(context))
          throw new BusinessRuleError(
            'Only the onboarding owner can ask Asset Steward for suggestions',
            'NOT_OWNER',
          );
        const result = await app.container
          .resolve(onboardingAdvisorToken)
          .advise(id);
        return context.json({ data: result }, result.started ? 202 : 200);
      } catch (error) {
        return errorResponse(context, error);
      }
    });

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
        // The sign-in they had, and whether it still signs in. Leaving does
        // not end it — the register marks a person, not an account — so the
        // page says so, and says once it is done. Whether this reader may
        // disable it decides whether the page offers the way there or names
        // who can: the users page is root's in this application.
        let account: {
          readonly name: string;
          readonly username: string | null;
          readonly disabled: boolean;
          /** Disabled by leaving, rather than by somebody's hand. */
          readonly disabledOnLeaving: boolean;
          readonly canDisable: boolean;
        } | null = null;
        const userId =
          typeof person.userId === 'string' && person.userId
            ? person.userId
            : null;
        if (userId && app.container.has(userAdministrationServiceToken)) {
          const user = await app.container
            .resolve(userAdministrationServiceToken)
            .get(userId);
          if (user)
            account = {
              name: user.name,
              username: user.username ?? null,
              disabled: user.disabledAt !== null,
              disabledOnLeaving: app.container.has(leaverAccountsToken)
                ? await app.container
                    .resolve(leaverAccountsToken)
                    .disabledOnLeaving(id)
                : false,
              canDisable:
                (
                  await context.get('authz').authorize({
                    resource: { type: 'user', id: userId },
                    action: 'disable',
                  })
                ).effect !== 'deny',
            };
        }
        return context.json({
          data: {
            // The page shows the leaving sentence only for somebody who has
            // left, and that answer belongs with the plan rather than to a
            // second request for the record.
            // Named, so an act on one of their things elsewhere — a device's
            // own page — can say whose handover it moved.
            name: typeof person.name === 'string' ? person.name : null,
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
            account,
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

    // AI 整理 in 新建型号 / 新建软件产品: the assistant's reading, checked
    // against the master data before the dialog takes it. Asks for
    // `create`, the grant the dialog itself needs; writes nothing.
    routes.post('/:collection/capture/match', async (context) => {
      const collection = context.req.param('collection');
      try {
        if (
          !MASTER_CAPTURE_COLLECTIONS.includes(
            collection as MasterCaptureCollection,
          )
        )
          throw new ValidationError('Unknown collection');
        await decideFor(context, collection, 'create');
        const input = masterCaptureSchema.parse(await readJsonObject(context));
        return context.json({
          data: await matchMasterCapture(
            app.container.resolve(databaseManagerToken),
            collection as MasterCaptureCollection,
            input,
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
          aiOrigin(context),
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
          aiOrigin(context),
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
