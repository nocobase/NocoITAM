import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import { today as todayIso } from './dates.js';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApprovalService, ApprovalSubject } from './approvals.js';
import { compileAuthzScope } from './authz-filter.js';
import { asText, type Row } from './collection-query.js';

/**
 * "My work" on the workbench: what waits for the signed-in user right now.
 * Each item is computed only when the caller may read the collection it
 * comes from, under that collection's record filter.
 */
export interface Decider {
  (
    collection: string,
    action: string,
  ): Promise<DatabaseAuthorizationConditions | undefined>;
}

/** One record behind a to-do, for the workbench's expanded row. */
export interface MyWorkRecord {
  readonly id: string;
  /** How the record names itself: its number, or its number and name. */
  readonly title: string;
  /** What the title does not say on its own — a person's job. */
  readonly subtitle?: string | null;
  /** The date that makes it a to-do, as stored. */
  readonly date: string | null;
  /** Application route of the record; the workbench opens it in the drawer. */
  readonly url: string;
  /**
   * How many things behind this record are the reader's own, where the record
   * stands for several — a leaver holds a number of things, and only some of
   * them answer to the person reading. Absent where the record is the work.
   */
  readonly count?: number;
}

export interface MyWorkItem {
  readonly key:
    | 'pendingPurchaseApprovals'
    | 'pendingDisposalApprovals'
    | 'awaitingReceipt'
    | 'pendingDisposalExecution'
    | 'activeRepairs'
    | 'activeAudits'
    | 'loansDueToday'
    | 'leaverRecovery';
  readonly count: number;
  /** Application route with the matching filter. */
  readonly url: string;
  /** The first few records behind it, oldest or soonest first. */
  readonly records: readonly MyWorkRecord[];
}

export interface WorkbenchService {
  myWork(userId: string, decide: Decider): Promise<readonly MyWorkItem[]>;
}

/** How many records a card lists before it says "see all". */
export const MY_WORK_PREVIEW = 5;

export const workbenchServiceToken: ServiceToken<WorkbenchService> =
  createServiceToken<WorkbenchService>('itam/workbench-service');

/** An audit task is mine when I raised it or am named to run it. */
function isMine(row: Row, userId: string): boolean {
  const executors =
    typeof row.executorIds === 'string'
      ? (JSON.parse(row.executorIds) as string[])
      : Array.isArray(row.executorIds)
        ? (row.executorIds as string[])
        : [];
  return row.createdById === userId || executors.includes(userId);
}

export function createWorkbenchService(dependencies: {
  database: DatabaseManager;
  approvals: ApprovalService;
}): WorkbenchService {
  const { database, approvals } = dependencies;

  const count = async (
    table: string,
    conditions: DatabaseAuthorizationConditions,
    refine: (
      query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
    ) => ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
  ): Promise<number> => {
    const row = await refine(
      database
        .query()
        .selectFrom(table)
        .where((eb) => compileAuthzScope(eb, conditions.scope)),
    )
      .select((eb) => [eb.fn.countAll().as('total')])
      .executeTakeFirst<{ total: number | string }>();
    return Number(row?.total ?? 0);
  };

  return {
    async myWork(userId, decide) {
      const today = todayIso();
      const items: MyWorkItem[] = [];
      // Each to-do carries the first few records behind it: the card shows
      // them straight away, so a count never says something is waiting
      // without saying what. They come back with the counts rather than on
      // demand, because the card is never collapsed.
      const take = async (
        table: string,
        conditions: DatabaseAuthorizationConditions,
        columns: readonly string[],
        refine: (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) => ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
      ) =>
        refine(
          database
            .query()
            .selectFrom(table)
            .where((eb) => compileAuthzScope(eb, conditions.scope)),
        )
          .select([...columns])
          .limit(MY_WORK_PREVIEW)
          .execute<Row>();

      // 待我审批 stays one item per kind of request, each with its own count
      // and its own list: one item counting both could only link to one of
      // them. The workbench shows them as a single card, tagging each record
      // with the kind it is.
      const approvalConditions = await decide('approvals', 'read');
      if (approvalConditions) {
        const pending = await approvals.pendingFor(userId, approvalConditions);
        // An approval names its subject in the singular (`ApprovalSubject`),
        // which is not the collection the grant is asked for.
        const waiting: readonly {
          readonly key: MyWorkItem['key'];
          readonly subjectType: ApprovalSubject;
          readonly collection: string;
          readonly route: string;
          readonly url: string;
          readonly columns: readonly string[];
        }[] = [
          {
            key: 'pendingPurchaseApprovals',
            subjectType: 'purchaseOrder',
            collection: 'purchaseOrders',
            route: '/procurement',
            url: '/procurement?view=myApproval',
            columns: ['id', 'orderNo', 'neededBy'],
          },
          {
            key: 'pendingDisposalApprovals',
            subjectType: 'disposal',
            collection: 'disposals',
            route: '/disposals',
            url: '/disposals?view=myApproval',
            columns: ['id', 'disposalNo', 'requestedAt'],
          },
        ];
        for (const entry of waiting) {
          // Only for a reader who may decide that kind — the same condition
          // the list page shows its 待我审批 toggle under.
          if (!(await decide(entry.collection, 'approve'))) continue;
          const read = await decide(entry.collection, 'read');
          const mine = pending.filter(
            (row) => row.subjectType === entry.subjectType,
          );
          // Oldest first, the order `pendingFor` returns them in: what has
          // waited longest is what to decide first.
          const ids = mine
            .map((row) => String(row.subjectId))
            .slice(0, MY_WORK_PREVIEW);
          const rows =
            read && ids.length > 0
              ? await take(entry.collection, read, entry.columns, (query) =>
                  query.where('id', 'in', ids),
                )
              : [];
          const byId = new Map(rows.map((row) => [String(row.id), row]));
          items.push({
            key: entry.key,
            count: mine.length,
            url: entry.url,
            records: ids.flatMap((id) => {
              const row = byId.get(id);
              if (!row) return [];
              const [, no, date] = entry.columns;
              return [
                {
                  id,
                  title: String(row[no]),
                  date: asText(row[date]) ?? null,
                  url: `${entry.route}/${id}`,
                },
              ];
            }),
          });
        }
      }

      const orders = await decide('purchaseOrders', 'read');
      if (orders && (await decide('purchaseOrders', 'receive'))) {
        // The orders this reader raised, by the same rule the service uses
        // for everything else that belongs to the requesting side
        // (`raisedTheOrder` in `procurement.ts`: the requester it names, or
        // whoever wrote it for them). A purchase order has no 负责人 of its
        // own and does not need one — that field existed twice and was
        // dropped twice for holding a copy of the requester. Handing the
        // request over hands this card over with it.
        const awaiting = (query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>) =>
          query
            .where('status', 'in', ['ordered', 'partiallyReceived'])
            .where((eb) =>
              eb.or([
                eb('requesterId', '=', userId),
                eb('createdById', '=', userId),
              ]),
            );
        const rows = await take(
          'purchaseOrders',
          orders,
          ['id', 'orderNo', 'expectedAt'],
          (query) => awaiting(query).orderBy('expectedAt', 'asc'),
        );
        items.push({
          key: 'awaitingReceipt',
          count: await count('purchaseOrders', orders, awaiting),
          url: '/procurement?view=awaitingReceipt',
          records: rows.map((row) => ({
            id: String(row.id),
            title: String(row.orderNo),
            date: asText(row.expectedAt) ?? null,
            url: `/procurement/${String(row.id)}`,
          })),
        });
      }

      // An approved disposal is waiting to be carried out, and it is the
      // requesting side's to carry out — the requester it names, or whoever
      // wrote it for them, the same rule 待验收到货 goes by. The service
      // also lets the approver execute it (`NOT_INVOLVED`), but that is a
      // permission, not their work; the card stays narrower than the rule,
      // never wider. A disposal needs no 负责人: 申请人 is that person.
      const disposals = await decide('disposals', 'read');
      if (disposals && (await decide('disposals', 'execute'))) {
        const toExecute = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) =>
          query
            .where('status', '=', 'approved')
            .where((eb) =>
              eb.or([
                eb('requesterId', '=', userId),
                eb('createdById', '=', userId),
              ]),
            );
        const rows = await take(
          'disposals',
          disposals,
          ['id', 'disposalNo', 'requestedAt'],
          (query) => toExecute(query).orderBy('requestedAt', 'asc'),
        );
        items.push({
          key: 'pendingDisposalExecution',
          count: await count('disposals', disposals, toExecute),
          url: '/disposals?status=approved',
          records: rows.map((row) => ({
            id: String(row.id),
            title: String(row.disposalNo),
            date: asText(row.requestedAt) ?? null,
            url: `/disposals/${String(row.id)}`,
          })),
        });
      }

      // A repair that has not come back is open work: chase it, or finish it
      // when the device returns. `result` is the flag — there is no separate
      // status column. Only the reader's own: a repair is finished by its
      // 负责人 (2026-09-28), so somebody else's is not this reader's to-do.
      const repairs = await decide('repairs', 'complete');
      if (repairs) {
        const open = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) =>
          query
            .where('result', '=', 'inProgress')
            .where('ownerId', '=', userId);
        const rows = await take(
          'repairs',
          repairs,
          ['id', 'repairNo', 'expectedReturnAt'],
          (query) => open(query).orderBy('expectedReturnAt', 'asc'),
        );
        items.push({
          key: 'activeRepairs',
          count: await count('repairs', repairs, open),
          url: '/repairs?result=inProgress',
          records: rows.map((row) => ({
            id: String(row.id),
            title: String(row.repairNo),
            date: asText(row.expectedReturnAt) ?? null,
            url: `/repairs/${String(row.id)}`,
          })),
        });
      }

      const audits = await decide('auditTasks', 'read');
      if (audits) {
        // `executorIds` is JSON, which a scope may not reach into, so the
        // tasks in progress are read and narrowed here. The same rows give
        // the count and the records.
        const rows = await database
          .query()
          .selectFrom('auditTasks')
          .select(['id', 'name', 'plannedEnd', 'executorIds', 'createdById'])
          .where((eb) => compileAuthzScope(eb, audits.scope))
          .where('status', 'in', ['inProgress', 'pendingDifferences'])
          .orderBy('plannedEnd', 'asc')
          .execute<Row>();
        const mine = rows.filter((row) => isMine(row, userId));
        items.push({
          key: 'activeAudits',
          count: mine.length,
          url: '/audits?view=inProgress',
          records: mine.slice(0, MY_WORK_PREVIEW).map((row) => ({
            id: String(row.id),
            title: String(row.name),
            date: asText(row.plannedEnd) ?? null,
            url: `/audits/${String(row.id)}`,
          })),
        });
      }

      // 离职资产回收: somebody marked as left who still holds something the
      // reader is responsible for. Scoped by the owner of the thing held, not
      // by the grant: recovering a device belongs to its 负责人, the way
      // chasing a loan back does. A leaver whose holdings answer to two people
      // is a to-do for both, each seeing the part that is theirs — which is
      // also why this replaced the `leftPersonHoldings` reminder rather than
      // joining it: the same people on one screen as both work and risk read
      // as two problems.
      const peopleConditions = await decide('people', 'read');
      if (peopleConditions) {
        // How many of each leaver's holdings are this reader's, not just
        // which leavers have any: the row says 2 项 without being opened, and
        // a leaver whose other four things answer to somebody else does not
        // look like four more than it is.
        const mine = new Map<string, number>();
        const addHolders = (rows: readonly Row[], column: string): void => {
          for (const row of rows) {
            const holder = asText(row[column]);
            if (holder) mine.set(holder, (mine.get(holder) ?? 0) + 1);
          }
        };
        const owned = (table: string, scope: DatabaseAuthorizationConditions) =>
          database
            .query()
            .selectFrom(table)
            .where((eb) => compileAuthzScope(eb, scope.scope))
            .where('ownerId', '=', userId);

        const deviceConditions = await decide('devices', 'read');
        if (deviceConditions)
          addHolders(
            await owned('devices', deviceConditions)
              .where('assigneeType', '=', 'person')
              .select(['assigneeId'])
              .execute<Row>(),
            'assigneeId',
          );

        // Stock and seats are held through the item and the entitlement, which
        // is where the owner is; the holding rows themselves are reached
        // through the parent the reader may already read.
        const stockConditions = await decide('stockItems', 'read');
        if (stockConditions) {
          const ids = (
            await owned('stockItems', stockConditions).select(['id']).execute<Row>()
          ).map((row) => String(row.id));
          if (ids.length > 0)
            addHolders(
              await database
                .query()
                .selectFrom('stockHoldings')
                .where('stockItemId', 'in', ids)
                .where('holderType', '=', 'person')
                .where('quantity', '>', 0)
                .select(['holderId'])
                .execute<Row>(),
              'holderId',
            );
        }

        const entitlementConditions = await decide('entitlements', 'read');
        if (entitlementConditions) {
          const ids = (
            await owned('entitlements', entitlementConditions)
              .select(['id'])
              .execute<Row>()
          ).map((row) => String(row.id));
          if (ids.length > 0)
            addHolders(
              await database
                .query()
                .selectFrom('entitlementSeats')
                .where('entitlementId', 'in', ids)
                .where('holderType', '=', 'person')
                .where('releasedAt', 'is', null)
                .select(['holderId'])
                .execute<Row>(),
              'holderId',
            );
        }

        if (mine.size > 0) {
          const leavers = (
            query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
          ) =>
            query
              .where('employmentStatus', '=', 'left')
              .where('id', 'in', [...mine.keys()]);
          const total = await count('people', peopleConditions, leavers);
          if (total > 0) {
            const rows = await take(
              'people',
              peopleConditions,
              ['id', 'name', 'leaveDate', 'position'],
              leavers,
            );
            items.push({
              key: 'leaverRecovery',
              count: total,
              url: '/people?employmentStatus=left',
              records: rows.map((row) => ({
                id: String(row.id),
                title: String(row.name),
                // A name alone says who, not what they did here; the job is
                // what tells the reader whose work is coming their way.
                subtitle: asText(row.position) ?? null,
                date: asText(row.leaveDate) ?? null,
                url: `/people/${String(row.id)}`,
                count: mine.get(String(row.id)) ?? 0,
              })),
            });
          }
        }
      }

      const devices = await decide('devices', 'read');
      if (devices && (await decide('devices', 'assign'))) {
        // Past its date, not due on it — a loan due this afternoon is not
        // yet anybody's to chase. The same set the 借出逾期未还 reminder
        // counts (`maintenance.ts`): the reminder says how many, the card
        // says which ones and opens them. Only the reader's own devices:
        // chasing one back belongs to its 负责人, the way finishing a repair
        // belongs to that repair's. Without this the card was not "mine" at
        // all — everyone who may assign saw every overdue loan.
        const dueBack = (query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>) =>
          query
            .where('status', '=', 'onLoan')
            .where('expectedReturnDate', '<', today)
            .where('ownerId', '=', userId);
        const rows = await take(
          'devices',
          devices,
          ['id', 'deviceNo', 'name', 'expectedReturnDate'],
          dueBack,
        );
        items.push({
          key: 'loansDueToday',
          count: await count('devices', devices, dueBack),
          url: '/devices?status=onLoan',
          records: rows.map((row) => ({
            id: String(row.id),
            title: `${String(row.deviceNo)} / ${String(row.name)}`,
            date: asText(row.expectedReturnDate) ?? null,
            url: `/devices/${String(row.id)}`,
          })),
        });
      }
      return items;
    },
  };
}
