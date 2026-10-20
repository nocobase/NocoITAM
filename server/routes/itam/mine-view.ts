import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import type { ApprovalService } from '../../providers/itam/approvals.js';
import type {
  ListOptions,
  ListResult,
} from '../../providers/itam/collection-query.js';
import { maybeDecide, principalId, type ItamContext } from './http.js';

/**
 * The list of a request that is approved — purchase orders, disposals — as
 * the list page asks for it (2026-10-20):
 *
 * - `view=mine` is 我的: the requests waiting on this reader's decision and
 *   the ones they are 负责人 of;
 * - `view=myApproval` is those waiting on them alone, which the workbench's
 *   links still name;
 * - and every row says whether it waits on this reader (`awaitingMe`), so a
 *   card or a row can say so.
 *
 * Which requests wait on whom lives in the approval, not the record, so the
 * views resolve to ids and list those under the reader's own grant. A
 * reader who may not read approvals has nothing waiting on them.
 */
export function listWithMine(dependencies: {
  readonly database: DatabaseManager;
  readonly approvals: ApprovalService;
  readonly collection: 'purchaseOrders' | 'disposals';
  readonly subjectType: 'purchaseOrder' | 'disposal';
  readonly list: (
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ) => Promise<ListResult>;
}): (
  context: ItamContext,
  options: ListOptions,
  conditions: DatabaseAuthorizationConditions,
) => Promise<ListResult> {
  const { database, approvals, collection, subjectType, list } = dependencies;
  return async (context, options, conditions) => {
    const me = principalId(context);
    const readable = await maybeDecide(context, 'approvals', 'read');
    const waiting = new Set(
      readable
        ? (await approvals.pendingFor(me, readable))
            .filter((entry) => entry.subjectType === subjectType)
            .map((entry) => String(entry.subjectId))
        : [],
    );
    const { view, ...filter } = options.filter ?? {};
    let result: ListResult;
    if (view === 'mine' || view === 'myApproval') {
      const ids = new Set(waiting);
      if (view === 'mine' && me) {
        const owned = await database
          .query()
          .selectFrom(collection)
          .select('id')
          .where('ownerId', '=', me)
          .execute<{ id: string }>();
        for (const row of owned) ids.add(String(row.id));
      }
      result =
        ids.size === 0
          ? {
              data: [],
              total: 0,
              page: options.page ?? 1,
              pageSize: options.pageSize ?? 20,
            }
          : await list(
              { ...options, filter: { ...filter, id: [...ids] } },
              conditions,
            );
    } else {
      result = await list(options, conditions);
    }
    return {
      ...result,
      data: result.data.map((row) => ({
        ...row,
        awaitingMe: waiting.has(String(row.id)),
      })),
    };
  };
}
