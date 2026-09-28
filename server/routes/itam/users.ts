import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';

/** Which collection's `approve` an approver of this subject must hold. */
const APPROVAL_SUBJECTS: Readonly<Record<string, string>> = {
  purchaseOrder: 'purchaseOrders',
  disposal: 'disposals',
};

/**
 * `/api/itam/users`: a name directory for user ids that ITAM records carry
 * (audit executors, requesters). Any signed-in user may
 * resolve names; it exposes id and name only, never account details.
 * `/api/itam/users/approvers` narrows it to the people who may approve a
 * kind of request — minus the requester, who may not decide their own — so
 * the submitter picks one rather than guessing.
 */
export const userDirectoryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);

    router.get('/itam/users', auth.required(), async (context) => {
      if (!app.container.has(userAdministrationServiceToken))
        return context.json({ data: [], total: 0, page: 1, pageSize: 0 });
      const users = app.container.resolve(userAdministrationServiceToken);
      const url = new URL(context.req.url);
      const ids = url.searchParams
        .getAll('ids')
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 100);
      const q = url.searchParams.get('q') ?? undefined;
      const pageSize = Math.min(
        Number(url.searchParams.get('pageSize') ?? 20) || 20,
        100,
      );
      const page = await users.list({
        ...(ids.length > 0 ? { userIds: ids } : {}),
        ...(q ? { search: q } : {}),
        pageSize,
        page: 1,
      });
      // The department each one belongs to, through the person record that
      // links to them: a form that asks who is requesting can then fill in
      // the department instead of asking twice.
      const departments = new Map<string, string>();
      if (page.items.length > 0) {
        const people = await database
          .query()
          .selectFrom('people')
          .select(['userId', 'departmentId'])
          .where(
            'userId',
            'in',
            page.items.map((user) => user.id),
          )
          .execute<{ userId: string | null; departmentId: string | null }>();
        for (const person of people)
          if (person.userId && person.departmentId)
            departments.set(person.userId, person.departmentId);
      }
      return context.json({
        data: page.items.map((user) => ({
          id: user.id,
          name: user.name,
          departmentId: departments.get(user.id) ?? null,
        })),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      });
    });

    /**
     * Who holds one business operation, read from the permission sets that
     * grant it and the users assigned to them. Both pickers are this: an
     * approver of a kind of request, and the 负责人 a repair may be given
     * to. "Everybody but an employee" is not a role list — it is whoever
     * the deployment's sets let finish a repair, which is what the service
     * will check.
     */
    const holdersOf = async (
      resource: string,
      action: string,
      q: string,
    ): Promise<{ id: string; name: string }[]> => {
      if (
        !app.container.has(authorizationToken) ||
        !app.container.has(userAdministrationServiceToken)
      )
        return [];
      const permissionSets =
        app.container.resolve(authorizationToken).permissionSets;
      const sets = (await permissionSets.list()).filter((set) =>
        set.grants.some(
          (grant) =>
            grant.resource.type === 'composite' &&
            grant.resource.id === resource &&
            grant.actions.some((entry) => entry.action === action),
        ),
      );
      const ids = new Set<string>();
      for (const set of sets)
        for (const assignment of await permissionSets.listAssignments(set.key))
          if (assignment.subject.type === 'user')
            ids.add(String(assignment.subject.id));
      if (ids.size === 0) return [];
      const users = app.container.resolve(userAdministrationServiceToken);
      const page = await users.list({ userIds: [...ids], pageSize: 100 });
      const needle = q.trim().toLowerCase();
      return page.items
        .filter((user) => !user.disabledAt)
        .filter((user) => !needle || user.name.toLowerCase().includes(needle))
        .map((user) => ({ id: user.id, name: user.name }));
    };
    const listed = (data: { id: string; name: string }[]) => ({
      data,
      total: data.length,
      page: 1,
      pageSize: data.length,
    });

    router.get('/itam/users/approvers', auth.required(), async (context) => {
      const url = new URL(context.req.url);
      const subject = url.searchParams.get('filter[subject]') ?? '';
      const collection = APPROVAL_SUBJECTS[subject];
      if (!collection) return context.json(listed([]));
      // The requester is a candidate like anyone else who may approve: an
      // Asset Manager filing a request has nobody else to ask when they are
      // the only one (2026-09-27). The operation lives on the business
      // resource, not the Collection.
      return context.json(
        listed(
          await holdersOf(
            `itam.${collection}`,
            'approve',
            url.searchParams.get('q') ?? '',
          ),
        ),
      );
    });

    // Who a repair may be made the responsibility of: whoever may finish
    // one. An employee holds no repair grant, so they are not offered.
    router.get(
      '/itam/users/repair-owners',
      auth.required(),
      async (context) => {
        const url = new URL(context.req.url);
        // Asked for particular ids, this is a name lookup, not a candidate
        // list: the owner a repair already holds must read back even when
        // they are not a candidate now — `root` belongs to no permission set
        // of this application's, and a set may be changed after the fact.
        const ids = url.searchParams
          .getAll('ids')
          .flatMap((value) => value.split(','))
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 100);
        if (ids.length > 0) {
          if (!app.container.has(userAdministrationServiceToken))
            return context.json(listed([]));
          const page = await app.container
            .resolve(userAdministrationServiceToken)
            .list({ userIds: ids, pageSize: ids.length });
          return context.json(
            listed(
              page.items.map((user) => ({ id: user.id, name: user.name })),
            ),
          );
        }
        return context.json(
          listed(
            await holdersOf(
              'itam.repairs',
              'complete',
              url.searchParams.get('q') ?? '',
            ),
          ),
        );
      },
    );
    router.get(
      '/itam/users/repair-owners/:id',
      auth.required(),
      async (context) => {
        if (!app.container.has(userAdministrationServiceToken))
          return context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
        const user = await app.container
          .resolve(userAdministrationServiceToken)
          .get(context.req.param('id'));
        return user
          ? context.json({ data: { id: user.id, name: user.name } })
          : context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
      },
    );
    // The picker reads the name of the approver it already holds through the
    // same path it lists them from.
    router.get(
      '/itam/users/approvers/:id',
      auth.required(),
      async (context) => {
        if (!app.container.has(userAdministrationServiceToken))
          return context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
        const user = await app.container
          .resolve(userAdministrationServiceToken)
          .get(context.req.param('id'));
        return user
          ? context.json({ data: { id: user.id, name: user.name } })
          : context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
      },
    );
    router.get('/itam/users/:id', auth.required(), async (context) => {
      if (!app.container.has(userAdministrationServiceToken))
        return context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
      const user = await app.container
        .resolve(userAdministrationServiceToken)
        .get(context.req.param('id'));
      return user
        ? context.json({ data: { id: user.id, name: user.name } })
        : context.json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    });

    return router;
  });
