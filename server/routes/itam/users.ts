import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import type { ApprovalSubject } from '../../providers/itam/approvals.js';
import {
  approverDirectoryToken,
  type ApproverCandidate,
} from '../../providers/itam/approvers.js';

/** The kinds of request that are approved, as the picker names them. */
const APPROVAL_SUBJECTS: ReadonlySet<string> = new Set([
  'purchaseOrder',
  'disposal',
]);

/**
 * `/api/itam/users`: the people a record may name — its 负责人, an audit's
 * executors — and a name directory for the user ids records already carry.
 * Any signed-in user may ask; it exposes the id, the name, the username and
 * whether the account is disabled — what a person's 关联登录用户 shows, so
 * the sign-in reads as the one it is (2026-10-05) — never the e-mail or
 * anything else of the account. `/api/itam/users/approvers` narrows the candidates to the people
 * who may approve a kind of request, so the submitter picks one rather than
 * guessing.
 */
export const userDirectoryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    // Who holds what, as the pickers offer people (`approvers.ts`).
    const directory = app.container.resolve(approverDirectoryToken);
    const leftUserIds = (userIds: readonly string[]) =>
      directory.leftUserIds(userIds);
    const rolesOf = () => directory.rolesOf();
    type Holder = ApproverCandidate;

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
      const roles = await rolesOf();
      let candidates: string[] = ids;
      if (ids.length === 0) {
        const left = await leftUserIds([...roles.keys()]);
        candidates = [...roles.keys()].filter((id) => !left.has(id));
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
        .map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username ?? null,
          disabled: Boolean(user.disabledAt),
          roles: roles.get(user.id) ?? [],
        }));
      return context.json({
        data,
        total: page.total - (page.items.length - data.length),
        page: page.page,
        pageSize: page.pageSize,
      });
    });

    const holdersOf = (resource: string, action: string, q: string) =>
      directory.holders(resource, action, q);
    const listed = (data: Holder[]) => ({
      data,
      total: data.length,
      page: 1,
      pageSize: data.length,
    });

    router.get('/itam/users/approvers', auth.required(), async (context) => {
      const url = new URL(context.req.url);
      const subject = url.searchParams.get('filter[subject]') ?? '';
      if (!APPROVAL_SUBJECTS.has(subject)) return context.json(listed([]));
      // Whoever holds the approval, narrowed by the kind's approver range
      // (设置 → 流程; disposals 2026-10-18, purchase orders 2026-10-19). The
      // requester is a candidate like anyone else who may approve: an Asset
      // Manager filing a request has nobody else to ask when they are the
      // only one (2026-09-27).
      return context.json(
        listed(
          await directory.approversFor(
            subject as ApprovalSubject,
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
