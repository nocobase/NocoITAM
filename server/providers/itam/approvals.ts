import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { compileAuthzScope } from './authz-filter.js';
import {
  decodeRow,
  listCollection,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { APPROVALS_COLLECTION } from './collections.js';
import {
  BusinessRuleError,
  RecordNotFoundError,
  ValidationError,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { OperationContext } from './devices.js';

/**
 * One approval record per submitted request. The workflow plugin ships no
 * human-approval Instruction, so the durable "waiting for a person" state
 * lives here: create → pending → approved | rejected | withdrawn. The
 * submitter names the approver — one person who holds that approval, who may
 * be the submitter: a deployment with one Asset Manager has nobody else to
 * ask, and refusing that left their own requests undecidable (2026-09-27).
 */
export type ApprovalSubject = 'purchaseOrder' | 'disposal';
export type ApprovalDecision = 'approved' | 'rejected';

export interface ApprovalRequest {
  readonly subjectType: ApprovalSubject;
  readonly subjectId: string;
  readonly title: string;
  readonly amount?: number | null;
  /**
   * Who is being asked. The submitter picks one person who holds the
   * approval, so a request is addressed rather than routed: with none named
   * anyone who may approve can take it.
   */
  readonly approverId?: string | null;
}

export interface ApprovalService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  /** Approvals the caller may decide now; `null` asks for every pending one. */
  pendingFor(
    userId: string | null,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<readonly Row[]>;
  forSubject(
    subjectType: ApprovalSubject,
    subjectId: string,
    connection?: DatabaseConnection,
  ): Promise<readonly Row[]>;
  request(
    input: ApprovalRequest,
    context: OperationContext,
    connection: DatabaseConnection,
  ): Promise<Row>;
  withdraw(
    subjectType: ApprovalSubject,
    subjectId: string,
    context: OperationContext,
    connection: DatabaseConnection,
  ): Promise<void>;
  decide(
    id: string,
    decision: ApprovalDecision,
    comment: string | undefined,
    context: OperationContext,
    connection: DatabaseConnection,
  ): Promise<Row>;
}

export const approvalServiceToken: ServiceToken<ApprovalService> =
  createServiceToken<ApprovalService>('itam/approval-service');

const JSON_FIELDS = ['approverIds'] as const;

export function createApprovalService(
  database: DatabaseManager,
  history: HistoryService,
): ApprovalService {
  const definition = APPROVALS_COLLECTION;
  const decode = (row: Row): Row => decodeRow(row, { jsonFields: JSON_FIELDS });

  return {
    list: (options, conditions) =>
      listCollection(database, definition, options, conditions, {
        jsonFields: JSON_FIELDS,
      }),

    async pendingFor(userId, conditions) {
      const rows = await database
        .query()
        .selectFrom('approvals')
        .selectAll()
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .where('status', '=', 'pending')
        .orderBy('requestedAt', 'asc')
        .execute<Row>();
      return rows.map(decode).filter((row) => {
        const approvers = Array.isArray(row.approverIds)
          ? (row.approverIds as string[])
          : [];
        // An addressed approval is waiting on whoever it names, even when
        // that is the requester: naming yourself has been allowed since
        // 2026-09-27, and hiding it here left the lone Asset Manager's own
        // request decidable only from the record page, with 待我审批
        // reporting nothing waiting. An approval that names nobody is
        // anybody's but its own requester's.
        // Without a reader, every pending approval (the administrator's
        // view of everybody's queue).
        if (userId === null) return true;
        return approvers.length === 0
          ? row.requestedById !== userId
          : approvers.includes(userId);
      });
    },

    async forSubject(subjectType, subjectId, connection) {
      const rows = await (connection ? connection.query : database.query())
        .selectFrom('approvals')
        .selectAll()
        .where('subjectType', '=', subjectType)
        .where('subjectId', '=', subjectId)
        .orderBy('requestedAt', 'desc')
        .execute<Row>();
      return rows.map(decode);
    },

    async request(input, context, connection) {
      // Every request names who decides it: an open request anyone could
      // pick up was one nobody was told about.
      if (!input.approverId)
        throw new ValidationError('Choose an approver', 'approverId');
      const open = await connection.query
        .selectFrom('approvals')
        .select('id')
        .where('subjectType', '=', input.subjectType)
        .where('subjectId', '=', input.subjectId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (open)
        throw new BusinessRuleError(
          'An approval is already pending',
          'APPROVAL_PENDING',
        );
      const id = crypto.randomUUID();
      const values = {
        id,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        title: input.title,
        amount: input.amount ?? null,
        status: 'pending',
        requestedById: context.actorId,
        requestedAt: new Date(),
        approverIds: [input.approverId],
        decidedById: null,
        decidedAt: null,
        comment: null,
      };
      await connection.query.insertInto('approvals').values(values).execute();
      await history.record(
        {
          subjectType:
            input.subjectType === 'purchaseOrder'
              ? 'purchaseOrders'
              : 'disposals',
          subjectId: input.subjectId,
          type: 'approvalRequested',
          summary: `Approval requested: ${input.title}`,
          payload: {
            approvalId: id,
            amount: input.amount,
            approverId: input.approverId,
          },
          ...context,
        },
        connection,
      );
      return decode(values);
    },

    async withdraw(subjectType, subjectId, context, connection) {
      const open = await connection.query
        .selectFrom('approvals')
        .selectAll()
        .where('subjectType', '=', subjectType)
        .where('subjectId', '=', subjectId)
        .where('status', '=', 'pending')
        .executeTakeFirst<Row>();
      if (!open)
        throw new BusinessRuleError('No pending approval', 'NOT_PENDING');
      if (open.requestedById !== context.actorId) {
        throw new BusinessRuleError(
          'Only the requester can withdraw',
          'NOT_REQUESTER',
        );
      }
      await connection.query
        .updateTable('approvals')
        .set({
          status: 'withdrawn',
          decidedById: context.actorId,
          decidedAt: new Date(),
        })
        .where('id', '=', String(open.id))
        .execute();
      await history.record(
        {
          subjectType:
            subjectType === 'purchaseOrder' ? 'purchaseOrders' : 'disposals',
          subjectId,
          type: 'approvalWithdrawn',
          summary: 'Approval withdrawn',
          payload: { approvalId: open.id },
          ...context,
        },
        connection,
      );
    },

    async decide(id, decision, comment, context, connection) {
      const approval = await connection.query
        .selectFrom('approvals')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      if (!approval) throw new RecordNotFoundError('approvals', id);
      const row = decode(approval);
      if (row.status !== 'pending')
        throw new BusinessRuleError('Approval is not pending', 'NOT_PENDING');
      const approvers = Array.isArray(row.approverIds)
        ? (row.approverIds as string[])
        : [];
      if (approvers.length > 0 && !approvers.includes(context.actorId)) {
        throw new BusinessRuleError(
          'You are not an approver for this amount',
          'NOT_APPROVER',
        );
      }
      await connection.query
        .updateTable('approvals')
        .set({
          status: decision,
          decidedById: context.actorId,
          decidedAt: new Date(),
          comment: comment ?? null,
        })
        .where('id', '=', id)
        .execute();
      await history.record(
        {
          subjectType:
            row.subjectType === 'purchaseOrder'
              ? 'purchaseOrders'
              : 'disposals',
          subjectId: String(row.subjectId),
          type:
            decision === 'approved' ? 'approvalApproved' : 'approvalRejected',
          summary: decision === 'approved' ? 'Approved' : 'Rejected',
          payload: { approvalId: id, comment },
          ...context,
        },
        connection,
      );
      const after = await connection.query
        .selectFrom('approvals')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      return decode(after ?? row);
    },
  };
}
