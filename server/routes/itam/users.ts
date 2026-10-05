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
 * `/api/itam/users`: the people a record may name — its 负责人, an audit's
 * executors — and a name directory for the user ids records already carry.
 * Any signed-in user may ask; it exposes id and name only, never account
 * details. `/api/itam/users/approvers` narrows the candidates to the people
 * who may approve a kind of request, so the submitter picks one rather than
 * guessing.
 */
export const userDirectoryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const database = app.container.resolve(databaseManagerToken);

    /**
     * The sign-ins whose person has left.
     *
     * Somebody who has left answers for nothing new: they cannot be picked
     * as a 负责人, the way they cannot be assigned a device. It
     * is read through `people.userId`, because that is what ties an account
     * to the register — an account with no person record is nobody's leaver
     * and stays pickable.
     *
     * A name lookup (`?ids=`) is never filtered: a record that already
     * names somebody must read back whoever that is, exactly as the
     * approvers endpoint answers for anybody when asked by id.
     */
    const leftUserIds = async (
      userIds: readonly string[],
    ): Promise<ReadonlySet<string>> => {
      if (userIds.length === 0) return new Set();
      const rows = await database
        .query()
        .selectFrom('people')
        .select('userId')
        .where('employmentStatus', '=', 'left')
        .where('userId', 'in', [...userIds])
        .execute<{ userId: string | null }>();
      return new Set(
        rows
          .map((row) => row.userId)
          .filter((id): id is string => id !== null),
      );
    };

    /**
     * The accounts assigned a permission set that grants anything matching
     * `granted`, as user ids. Assignments to a group or a role other than a
     * user are not expanded: this application's sets are assigned to users.
     */
    const assignedTo = async (
      granted: (grant: {
        resource: { type: string; id: string };
        actions: readonly { action: string }[];
      }) => boolean,
    ): Promise<Set<string>> => {
      const ids = new Set<string>();
      if (!app.container.has(authorizationToken)) return ids;
      const permissionSets =
        app.container.resolve(authorizationToken).permissionSets;
      for (const set of await permissionSets.list()) {
        if (!set.grants.some(granted)) continue;
        for (const assignment of await permissionSets.listAssignments(set.key))
          if (assignment.subject.type === 'user')
            ids.add(String(assignment.subject.id));
      }
      return ids;
    };

    /**
     * Who a record may name, or the names of the ids a record already holds.
     *
     * Picking somebody — a 负责人, a purchase order's or a disposal's
     * included, an audit's executors — offers the people in IT and nobody
     * else (2026-10-05): employees do not sign in, so an account belongs to
     * this register only through one of its permission sets, and "in IT" is
     * whoever holds a business operation of this application
     * (`itam.<collection>`) rather than a role name or a department. `root`
     * holds none, so the platform's administrator is not offered either; a
     * leaver is not offered, the way they cannot be assigned a device.
     *
     * Asked for `ids`, this is a name lookup and answers for anybody: a
     * record that already names somebody must read back whoever that is.
     */
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
      const empty = { data: [], total: 0, page: 1, pageSize };
      let candidates: string[] = ids;
      if (ids.length === 0) {
        const staff = await assignedTo(
          (grant) =>
            grant.resource.type === 'composite' &&
            grant.resource.id.startsWith('itam.'),
        );
        const left = await leftUserIds([...staff]);
        candidates = [...staff].filter((id) => !left.has(id));
        if (candidates.length === 0) return context.json(empty);
      }
      const page = await users.list({
        userIds: candidates,
        ...(q ? { search: q } : {}),
        pageSize,
        page: 1,
      });
      const data = page.items
        .filter((user) => ids.length > 0 || !user.disabledAt)
        .map((user) => ({ id: user.id, name: user.name }));
      return context.json({
        data,
        total: page.total - (page.items.length - data.length),
        page: page.page,
        pageSize: page.pageSize,
      });
    });

    /**
     * Who holds one business operation, read from the permission sets that
     * grant it and the users assigned to them. Both pickers are this: an
     * approver of a kind of request, and the 负责人 a repair may be given
     * to. Neither is a role list — it is whoever the deployment's sets let
     * approve, or finish a repair, which is what the service will check.
     */
    const holdersOf = async (
      resource: string,
      action: string,
      q: string,
    ): Promise<{ id: string; name: string }[]> => {
      if (!app.container.has(userAdministrationServiceToken)) return [];
      const ids = await assignedTo(
        (grant) =>
          grant.resource.type === 'composite' &&
          grant.resource.id === resource &&
          grant.actions.some((entry) => entry.action === action),
      );
      if (ids.size === 0) return [];
      const users = app.container.resolve(userAdministrationServiceToken);
      const page = await users.list({ userIds: [...ids], pageSize: 100 });
      const needle = q.trim().toLowerCase();
      const left = await leftUserIds(page.items.map((user) => user.id));
      return page.items
        .filter((user) => !user.disabledAt)
        .filter((user) => !left.has(user.id))
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
    // one, which the deployment's sets decide.
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
