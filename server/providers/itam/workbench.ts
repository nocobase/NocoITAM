import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import { addDays, dbDateTime, today as todayIso } from './dates.js';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApprovalService, ApprovalSubject } from './approvals.js';
import { compileAuthzScope } from './authz-filter.js';
import { asText, type Row } from './collection-query.js';
import { OWNED_BY_USER, RECOVERABLE_DEVICE_STATUSES } from './recovery.js';

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
  /**
   * The record itself answers to the reader, where the record *is* the work —
   * a device whose loan is overdue. The card lists everybody's, because the
   * act is granted by permission, so each row says whether this one is the
   * reader's rather than leaving the list looking like all of it is.
   */
  readonly mine?: boolean;
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

/** A to-do the reader finished lately, and when. */
export interface DoneWorkRecord extends MyWorkRecord {
  readonly key: MyWorkItem['key'];
  /**
   * When it was done: the moment of the act, or — for a leaver, whose
   * handover is many acts by many people — the day they left.
   */
  readonly doneAt: string;
}

/** How far back 已完成 reaches. */
export const DONE_WINDOW_DAYS = 30;
/** How many it lists: the team's month can be long. */
export const DONE_LIMIT = 100;

export interface WorkbenchService {
  /**
   * The team's queue, one for everybody (2026-10-05): every card lists
   * everyone's records, so whatever waits is seen by the whole of IT
   * rather than only in the inbox of whoever it is addressed to — somebody
   * away no longer hides work. `scope: 'mine'` narrows each card back to
   * what is the reader's: the approvals that name them, the orders and
   * disposals they own or wrote, their repairs and stocktakes, the loans of
   * devices they own and the leavers holding something they own. A row's
   * buttons follow their own rules either way — another person's approval
   * is still theirs to decide.
   */
  myWork(
    userId: string,
    decide: Decider,
    options?: { readonly scope?: 'all' | 'mine' },
  ): Promise<readonly MyWorkItem[]>;
  /**
   * What was finished in the last `DONE_WINDOW_DAYS` days, newest first:
   * each to-do's own act, read back from the history it wrote. Like the
   * queue it is the team's by default; `scope: 'mine'` keeps the reader's
   * own acts.
   */
  doneWork(
    userId: string,
    decide: Decider,
    options?: { readonly scope?: 'all' | 'mine' },
  ): Promise<readonly DoneWorkRecord[]>;
}

/** How many records a card lists before it says "see all". */
export const MY_WORK_PREVIEW = 5;

export const workbenchServiceToken: ServiceToken<WorkbenchService> =
  createServiceToken<WorkbenchService>('itam/workbench-service');

/**
 * An audit task is mine when I answer for it or am named to run it. Its
 * 负责人 took the place its creator held (2026-10-05): the creator is
 * stamped once, so a task handed over stayed on the old organiser's list.
 */
function isMine(row: Row, userId: string): boolean {
  const executors =
    typeof row.executorIds === 'string'
      ? (JSON.parse(row.executorIds) as string[])
      : Array.isArray(row.executorIds)
        ? (row.executorIds as string[])
        : [];
  return row.ownerId === userId || executors.includes(userId);
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

  /**
   * Who has left with something still unsettled — a device in a status
   * offboarding acts on, a stock holding, an unreleased seat, or an open
   * record still naming them — counted per person, everybody's and the
   * reader's share. 离职交接 lists the people in it; its 已完成 is the
   * people who left lately and are not in it, so the two read one rule.
   */
  const unsettled = async (
    userId: string,
    decide: Decider,
    peopleConditions: DatabaseAuthorizationConditions,
  ): Promise<{
    readonly open: Map<string, number>;
    readonly mine: Map<string, number>;
  }> => {
    /** Everybody's, and the reader's share of it, per person. */
    const open = new Map<string, number>();
    const mine = new Map<string, number>();
    const add = (
      rows: readonly Row[],
      column: string,
      owner = 'ownerId',
    ): void => {
      for (const row of rows) {
        const holder = asText(row[column]);
        if (!holder) continue;
        open.set(holder, (open.get(holder) ?? 0) + 1);
        if (asText(row[owner]) === userId)
          mine.set(holder, (mine.get(holder) ?? 0) + 1);
      }
    };
    const readable = (
      table: string,
      scope: DatabaseAuthorizationConditions,
    ) =>
      database
        .query()
        .selectFrom(table)
        .where((eb) => compileAuthzScope(eb, scope.scope));

    // Each half counts only when the reader may carry out its own act,
    // not merely read it: a to-do nobody can act on is not a to-do, and
    // reading is the weaker test — a permission set with people and
    // devices but no 归还 would see a card of buttons that refuse.
    const deviceConditions =
      (await decide('devices', 'return')) &&
      (await decide('devices', 'read'));
    if (deviceConditions)
      add(
        await readable('devices', deviceConditions)
          .where('assigneeType', '=', 'person')
          // Only the statuses offboarding has anything to say about, so
          // the count agrees with the page it opens.
          .where('status', 'in', [...RECOVERABLE_DEVICE_STATUSES])
          .select(['assigneeId', 'ownerId'])
          .execute<Row>(),
        'assigneeId',
      );

    // Stock and seats are held through the item and the entitlement,
    // which is where the owner is, so the holding rows are joined back
    // to the parent the reader may already read.
    // Taking stock back is authorized as `issue`, the grant that moves a
    // quantity between stock and a holder either way.
    const stockConditions =
      (await decide('stockItems', 'issue')) &&
      (await decide('stockItems', 'read'));
    if (stockConditions) {
      const owners = new Map(
        (
          await readable('stockItems', stockConditions)
            .select(['id', 'ownerId'])
            .execute<Row>()
        ).map((row) => [String(row.id), asText(row.ownerId)]),
      );
      if (owners.size > 0)
        add(
          (
            await database
              .query()
              .selectFrom('stockHoldings')
              .where('stockItemId', 'in', [...owners.keys()])
              .where('holderType', '=', 'person')
              .where('quantity', '>', 0)
              .select(['holderId', 'stockItemId'])
              .execute<Row>()
          ).map((row) => ({
            ...row,
            ownerId: owners.get(String(row.stockItemId)) ?? null,
          })),
          'holderId',
        );
    }

    const entitlementConditions =
      (await decide('entitlements', 'assignSeat')) &&
      (await decide('entitlements', 'read'));
    if (entitlementConditions) {
      const owners = new Map(
        (
          await readable('entitlements', entitlementConditions)
            .select(['id', 'ownerId'])
            .execute<Row>()
        ).map((row) => [String(row.id), asText(row.ownerId)]),
      );
      if (owners.size > 0)
        add(
          (
            await database
              .query()
              .selectFrom('entitlementSeats')
              .where('entitlementId', 'in', [...owners.keys()])
              .where('holderType', '=', 'person')
              .where('releasedAt', 'is', null)
              .select(['holderId', 'entitlementId'])
              .execute<Row>()
          ).map((row) => ({
            ...row,
            ownerId: owners.get(String(row.entitlementId)) ?? null,
          })),
          'holderId',
        );
    }

    // The other half: records that still name them. They are keyed by
    // sign-in, so a leaver with no linked account answers for none —
    // and they count towards the person being unsettled without
    // counting towards anybody's share, because handing one over is a
    // decision rather than a thing in somebody's name.
    const accounts = new Map(
      (
        await readable('people', peopleConditions)
          .where('employmentStatus', '=', 'left')
          .where('userId', 'is not', null)
          .select(['id', 'userId'])
          .execute<Row>()
      ).map((row) => [String(row.userId), String(row.id)]),
    );
    if (accounts.size > 0) {
      for (const entry of OWNED_BY_USER) {
        // Handing one over is a plain `update` of the field that names
        // them — which the service may still refuse on a purchase order
        // or a disposal, where only its 负责人 or the creator may
        // make it. That is the button's answer, not the row's.
        const conditions =
          (await decide(entry.collection, 'update')) &&
          (await decide(entry.collection, 'read'));
        if (!conditions) continue;
        let query = readable(entry.collection, conditions).select([
          entry.field,
        ]);
        // Only what is still waiting.
        if (entry.open)
          query = query.where(entry.open.column, 'in', [
            ...entry.open.values,
          ]);
        const rows = await query
          .where(entry.field, 'in', [...accounts.keys()])
          .execute<Row>();
        for (const row of rows) {
          const person = accounts.get(asText(row[entry.field]) ?? '');
          if (person) open.set(person, (open.get(person) ?? 0) + 1);
        }
      }
    }
    return { open, mine };
  };

  return {
    async myWork(userId, decide, { scope = 'all' } = {}) {
      const today = todayIso();
      const everyone = scope === 'all';
      // Whose records a card lists: everybody's, or the reader's own.
      const reader = everyone ? null : userId;
      const raisedBy = (
        query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
      ) =>
        reader === null
          ? query
          : query.where((eb) =>
              eb.or([
                eb('ownerId', '=', reader),
                eb('createdById', '=', reader),
              ]),
            );
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
        const pending = await approvals.pendingFor(reader, approvalConditions);
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
            url: everyone
              ? '/procurement?status=pendingApproval'
              : '/procurement?view=myApproval',
            columns: ['id', 'orderNo', 'neededBy'],
          },
          {
            key: 'pendingDisposalApprovals',
            subjectType: 'disposal',
            collection: 'disposals',
            route: '/disposals',
            url: everyone
              ? '/disposals?status=pendingApproval'
              : '/disposals?view=myApproval',
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
        // The orders that are this reader's, by the same rule the service
        // uses for everything else on the order (`raisedTheOrder` in
        // `procurement.ts`: its 负责人, or whoever wrote it before handing it
        // over). Handing the order over hands this card over with it.
        const awaiting = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) =>
          raisedBy(
            query.where('status', 'in', ['ordered', 'partiallyReceived']),
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

      // An approved disposal is waiting to be carried out, and it is its
      // 负责人's to carry out — or whoever wrote it before handing it over,
      // the same rule 待验收到货 goes by. The service also lets the approver
      // execute it (`NOT_INVOLVED`), but that is a permission, not their
      // work; the card stays narrower than the rule, never wider.
      const disposals = await decide('disposals', 'read');
      if (disposals && (await decide('disposals', 'execute'))) {
        const toExecute = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) => raisedBy(query.where('status', '=', 'approved'));
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
        ) => {
          const inProgress = query.where('result', '=', 'inProgress');
          return reader === null
            ? inProgress
            : inProgress.where('ownerId', '=', reader);
        };
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
          .select(['id', 'name', 'plannedEnd', 'executorIds', 'ownerId'])
          .where((eb) => compileAuthzScope(eb, audits.scope))
          .where('status', 'in', ['inProgress', 'pendingDifferences'])
          .orderBy('plannedEnd', 'asc')
          .execute<Row>();
        const mine = rows.filter(
          (row) => reader === null || isMine(row, reader),
        );
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

      // 离职交接: somebody marked as left who still has anything unsettled —
      // something they hold, or a record that still names them.
      //
      // Every reader who may recover sees every one of them, and the row says
      // how much of it answers to this reader. It used to be scoped to the
      // owner of the thing held, reasoning that recovering a device belongs
      // to its 负责人 the way chasing a loan back does. Two things were wrong
      // with that. Returning one thing emptied the reader's share and the
      // whole person left their queue, at 已处理 1 / 8 — the membership rule
      // counted the reader's part while the progress beside it counted the
      // person's. And a leaver's own records, which no owner holds, gave
      // nobody a to-do at all: changing the name on a purchase order is the
      // creator's to make, and holding a device is not what makes somebody
      // the person to do it. Recovering is granted by permission, so the
      // owner scope was a convention, not the rule — and the one thing a
      // convention must not do is hide work in one person's inbox while
      // they are away.
      const peopleConditions = await decide('people', 'read');
      if (peopleConditions) {
        const { open, mine } = await unsettled(
          userId,
          decide,
          peopleConditions,
        );

        // Narrowed to the reader: only a leaver holding something they own.
        if (reader !== null)
          for (const person of [...open.keys()])
            if (!mine.has(person)) open.delete(person);
        if (open.size > 0) {
          const leavers = (
            query: ReturnType<
              ReturnType<DatabaseManager['query']>['selectFrom']
            >,
          ) =>
            query
              .where('employmentStatus', '=', 'left')
              .where('id', 'in', [...open.keys()]);
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
                // Nothing of theirs is this reader's: say nothing rather
                // than 其中你负责 0 项, which is a line about the reader
                // on a row that is not about them.
                count: mine.get(String(row.id)) || undefined,
              })),
            });
          }
        }
      }

      const devices = await decide('devices', 'read');
      if (devices && (await decide('devices', 'assign'))) {
        // Past its date, not due on it — a loan due this afternoon is not
        // yet anybody's to chase. The same set the nightly job notifies
        // about (`notifyOverdueLoans` in `maintenance.ts`); there is no
        // reminder for it, so this card is the one place that lists them.
        //
        // Everybody who may assign sees every one of them, each row saying
        // whether it is the reader's. It was scoped to `ownerId` on the
        // reasoning that chasing a device back belongs to its 负责人 — but
        // taking it back is granted by permission, so that was a
        // convention, and its cost is that a device lent by somebody on
        // holiday is overdue in one inbox nobody is reading. The 负责人 is
        // still who to ask; it is on the row rather than in the query.
        const dueBack = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) => {
          const overdue = query
            .where('status', '=', 'onLoan')
            .where('expectedReturnDate', '<', today);
          return reader === null
            ? overdue
            : overdue.where('ownerId', '=', reader);
        };
        // The reader's own first, then the longest overdue: a list that now
        // holds everybody's starts with the part that is theirs. Two reads
        // rather than one ordered by a case expression, which also keeps a
        // device with no 负责人 out of a comparison against the reader.
        const columns = [
          'id',
          'deviceNo',
          'name',
          'expectedReturnDate',
          'ownerId',
        ];
        const soonest = (
          query: ReturnType<ReturnType<DatabaseManager['query']>['selectFrom']>,
        ) => dueBack(query).orderBy('expectedReturnDate', 'asc');
        const ours = await take('devices', devices, columns, (query) =>
          soonest(query).where('ownerId', '=', userId),
        );
        const seen = new Set(ours.map((row) => String(row.id)));
        const rows = [
          ...ours,
          ...(await take('devices', devices, columns, soonest)).filter(
            (row) => !seen.has(String(row.id)),
          ),
        ].slice(0, MY_WORK_PREVIEW);
        items.push({
          key: 'loansDueToday',
          count: await count('devices', devices, dueBack),
          url: '/devices?status=onLoan',
          records: rows.map((row) => ({
            id: String(row.id),
            title: `${String(row.deviceNo)} / ${String(row.name)}`,
            date: asText(row.expectedReturnDate) ?? null,
            url: `/devices/${String(row.id)}`,
            mine: asText(row.ownerId) === userId,
          })),
        });
      }
      return items;
    },

    async doneWork(userId, decide, options) {
      // The team's by default, like the queue; `mine` keeps the reader's
      // own acts.
      const mineOnly = options?.scope === 'mine';
      const since = addDays(todayIso(), -DONE_WINDOW_DAYS);
      const sinceAt = dbDateTime(new Date(`${since}T00:00:00`));
      // A to-do is done by its own act, which wrote history: what it was
      // about, and the column that names it on the row.
      const KINDS: Readonly<
        Record<
          string,
          {
            readonly key: MyWorkItem['key'];
            readonly collection: string;
            readonly route: string;
            readonly title: readonly string[];
          }
        >
      > = {
        'approval:purchaseOrders': {
          key: 'pendingPurchaseApprovals',
          collection: 'purchaseOrders',
          route: '/procurement',
          title: ['orderNo'],
        },
        'approval:disposals': {
          key: 'pendingDisposalApprovals',
          collection: 'disposals',
          route: '/disposals',
          title: ['disposalNo'],
        },
        repairCompleted: {
          key: 'activeRepairs',
          collection: 'repairs',
          route: '/repairs',
          title: ['repairNo'],
        },
        disposalExecuted: {
          key: 'pendingDisposalExecution',
          collection: 'disposals',
          route: '/disposals',
          title: ['disposalNo'],
        },
        auditCompleted: {
          key: 'activeAudits',
          collection: 'auditTasks',
          route: '/audits',
          title: ['name'],
        },
        orderCompleted: {
          key: 'awaitingReceipt',
          collection: 'purchaseOrders',
          route: '/procurement',
          title: ['orderNo'],
        },
        loanReturned: {
          key: 'loansDueToday',
          collection: 'devices',
          route: '/devices',
          title: ['deviceNo', 'name'],
        },
      };
      /** The newest act per record and kind of to-do. */
      const acts = new Map<string, { kind: string; id: string; at: string }>();
      const note = (kind: string, id: string, at: string) => {
        const key = `${kind}:${id}`;
        const seen = acts.get(key);
        if (!seen || seen.at < at) acts.set(key, { kind, id, at });
      };

      // Decided, finished, carried out: events the act wrote.
      let events = database
        .query()
        .selectFrom('historyEvents')
        .select(['subjectType', 'subjectId', 'type', 'createdAt']);
      if (mineOnly) events = events.where('actorId', '=', userId);
      for (const row of await events
        .where('type', 'in', [
          'approvalApproved',
          'approvalRejected',
          'repairCompleted',
          'disposalExecuted',
        ])
        .where('createdAt', '>=', sinceAt)
        .execute<Row>()) {
        const type = String(row.type);
        note(
          type.startsWith('approval')
            ? `approval:${String(row.subjectType)}`
            : type,
          String(row.subjectId),
          String(row.createdAt),
        );
      }
      // A count closed, an order fully received, a loan brought back: the
      // status the act set, read from the change log, which every status
      // change writes. Values are decoded here rather than compared in the
      // query — a JSON value bound into a condition matches nothing.
      const valueOf = (value: unknown): unknown => {
        if (typeof value !== 'string') return value;
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      };
      let changes = database
        .query()
        .selectFrom('changeLogs')
        .select(['subjectType', 'subjectId', 'oldValue', 'newValue', 'createdAt']);
      if (mineOnly) changes = changes.where('actorId', '=', userId);
      for (const row of await changes
        .where('action', '=', 'statusChange')
        .where('subjectType', 'in', ['auditTasks', 'purchaseOrders', 'devices'])
        .where('createdAt', '>=', sinceAt)
        .execute<Row>()) {
        const type = String(row.subjectType);
        const to = valueOf(row.newValue);
        const kind =
          type === 'auditTasks' && to === 'completed'
            ? 'auditCompleted'
            : type === 'purchaseOrders' && to === 'completed'
              ? 'orderCompleted'
              : type === 'devices' && valueOf(row.oldValue) === 'onLoan'
                ? 'loanReturned'
                : undefined;
        if (kind) note(kind, String(row.subjectId), String(row.createdAt));
      }

      // Each record named the way its own row names it, under the reader's
      // read grant: a record they may no longer read is left out.
      const done: DoneWorkRecord[] = [];
      const byCollection = new Map<string, Set<string>>();
      for (const act of acts.values()) {
        const collection = KINDS[act.kind].collection;
        byCollection.set(
          collection,
          (byCollection.get(collection) ?? new Set()).add(act.id),
        );
      }
      const rowsOf = new Map<string, Map<string, Row>>();
      for (const [collection, ids] of byCollection) {
        const conditions = await decide(collection, 'read');
        if (!conditions) continue;
        const rows = await database
          .query()
          .selectFrom(collection)
          .selectAll()
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .where('id', 'in', [...ids])
          .execute<Row>();
        rowsOf.set(
          collection,
          new Map(rows.map((row) => [String(row.id), row])),
        );
      }
      for (const act of acts.values()) {
        const kind = KINDS[act.kind];
        const row = rowsOf.get(kind.collection)?.get(act.id);
        if (!row) continue;
        done.push({
          key: kind.key,
          id: act.id,
          title: kind.title
            .map((column) => asText(row[column]))
            .filter(Boolean)
            .join(' / '),
          date: null,
          url: `${kind.route}/${act.id}`,
          doneAt: act.at,
        });
      }

      // 离职交接 by the rule its card reads, inverted: somebody who left in
      // the window with something to hand over (a snapshot was taken), and
      // has nothing unsettled now. The team's only: a handover is many acts
      // by many people, and once it is settled nothing records which of
      // them was the reader's share.
      const peopleConditions = mineOnly
        ? undefined
        : await decide('people', 'read');
      if (peopleConditions) {
        const { open } = await unsettled(userId, decide, peopleConditions);
        const leavers = await database
          .query()
          .selectFrom('people')
          .select(['id', 'name', 'position', 'leaveDate'])
          .where((eb) => compileAuthzScope(eb, peopleConditions.scope))
          .where('employmentStatus', '=', 'left')
          .where('leaveDate', '>=', since)
          .execute<Row>();
        const settled = leavers.filter((row) => !open.has(String(row.id)));
        const snapped =
          settled.length === 0
            ? new Set<string>()
            : new Set(
                (
                  await database
                    .query()
                    .selectFrom('historyEvents')
                    .select(['subjectId'])
                    .where('subjectType', '=', 'people')
                    .where('type', '=', 'belongingsSnapshot')
                    .where(
                      'subjectId',
                      'in',
                      settled.map((row) => String(row.id)),
                    )
                    .execute<Row>()
                ).map((row) => String(row.subjectId)),
              );
        for (const row of settled) {
          if (!snapped.has(String(row.id))) continue;
          done.push({
            key: 'leaverRecovery',
            id: String(row.id),
            title: String(row.name),
            subtitle: asText(row.position) ?? null,
            date: null,
            url: `/people/${String(row.id)}`,
            doneAt: String(row.leaveDate),
          });
        }
      }

      return done
        .sort((a, b) => b.doneAt.localeCompare(a.doneAt))
        .slice(0, DONE_LIMIT);
    },
  };
}
