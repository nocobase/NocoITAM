import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApprovalDecision, ApprovalService } from './approvals.js';
import type { DeviceService, OperationContext } from './devices.js';
import { assertInputFields } from './authz-filter.js';
import {
  asText,
  decodeRow,
  listCollection,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { DISPOSALS_COLLECTION } from './collections.js';
import { createRecordHelpers } from './domain-record.js';
import {
  BusinessRuleError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { EntitlementService } from './entitlements.js';
import type { ItamNotifier } from './notifier.js';
import type { NumberingService } from './numbering.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';
import { today } from './dates.js';

/**
 * Disposal records: draft → pendingApproval → approved → executed, with
 * rejected as the side exit and withdrawal returning it to draft. Approval moves every listed
 * device to pending disposal and reclaims its seats and components in the
 * same transaction; execution moves them to disposed, which is permanent.
 */
export const DISPOSAL_METHODS = [
  'scrap',
  'sale',
  'donation',
  'returnToLessor',
  'lossWriteOff',
  'other',
] as const;
export const DISPOSAL_REASONS = [
  'endOfLife',
  'damaged',
  'uneconomicalRepair',
  'insufficientPerformance',
  'lost',
  'leaseEnded',
  'other',
] as const;
export const DATA_WIPE_OPTIONS = ['wiped', 'notWiped', 'notRequired'] as const;
export const WIPE_METHODS = ['format', 'erase', 'physicalDestruction'] as const;

export interface DisposalInput extends Row {
  readonly method: (typeof DISPOSAL_METHODS)[number];
  readonly reason: (typeof DISPOSAL_REASONS)[number];
  readonly description?: string | null;
  readonly requesterId?: string;
  readonly requestedAt?: string | null;
  readonly currency?: string | null;
  readonly deviceIds?: readonly string[];
}

export interface ExecuteDisposalInput {
  readonly disposedAt?: string;
  readonly proceeds?: number | null;
  readonly expenses?: number | null;
  readonly currency?: string | null;
  readonly recipientVendorId?: string | null;
  readonly recipientName?: string | null;
  readonly dataWipe: (typeof DATA_WIPE_OPTIONS)[number];
  readonly executedById?: string | null;
  readonly wipeMethod?: (typeof WIPE_METHODS)[number] | null;
}

export interface DisposalService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    input: DisposalInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Creates a draft inside a caller-owned transaction (another service's step). */
  createWithin(
    connection: DatabaseConnection,
    input: DisposalInput,
    context: OperationContext,
  ): Promise<Row>;
  update(
    id: string,
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  deleteImpact(id: string): Promise<DeleteImpact>;
  delete(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<void>;
  /** The listed devices with their current device fields. */
  devices(id: string): Promise<readonly Row[]>;
  setDevices(
    id: string,
    deviceIds: readonly string[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<readonly Row[]>;
  /** Sends the disposal for approval; `approverId` is who is being asked. */
  submit(
    id: string,
    approverId: string | undefined,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  withdraw(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  decide(
    id: string,
    decision: ApprovalDecision,
    comment: string | undefined,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  execute(
    id: string,
    input: ExecuteDisposalInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /**
   * Disposals listing a device, newest first: the open ones (draft /
   * pending approval / approved), or every one including executed and
   * rejected.
   */
  forDevice(
    deviceId: string,
    options?: { readonly open?: boolean },
  ): Promise<readonly Row[]>;
}

export const disposalServiceToken: ServiceToken<DisposalService> =
  createServiceToken<DisposalService>('itam/disposal-service');

/**
 * What only an operation writes. The recipient and the data-wipe plan are
 * not among them: the request states them and the execution confirms them,
 * and `update` already refuses anything past `draft` / `rejected`, so they
 * change only while the request is open. Who carried the
 * disposal out is not stated in advance — it is whoever executed it.
 */
const LIFECYCLE_FIELDS = new Set([
  'status',
  'disposalNo',
  'deviceCount',
  'bookValueTotal',
  'disposedAt',
  'executedById',
]);
const OPEN_STATUSES = ['draft', 'pendingApproval', 'approved'] as const;
/**
 * An approved disposal says what was approved — which devices, why and how
 * they go — so its request is fixed. Where they end up and what happens to
 * the data on them is not part of that decision and is often settled later,
 * so it stays editable until the disposal is carried out, the same shape as
 * a purchase order's delivery dates.
 */
const EDITABLE_STATUSES = new Set(['draft', 'rejected', 'approved']);
const SETTLED_EDITABLE = new Set([
  'recipientVendorId',
  'recipientName',
  'dataWipe',
  'wipeMethod',
]);

export function createDisposalService(dependencies: {
  database: DatabaseManager;
  history: HistoryService;
  numbering: NumberingService;
  settings: SettingsService;
  approvals: ApprovalService;
  devices: DeviceService;
  entitlements: EntitlementService;
  stock: StockService;
  notifier: ItamNotifier;
}): DisposalService {
  const {
    database,
    history,
    numbering,
    settings,
    approvals,
    devices,
    entitlements,
    stock,
    notifier,
  } = dependencies;
  const definition = DISPOSALS_COLLECTION;
  const records = createRecordHelpers(database, history, definition);

  const listDevices = async (
    id: string,
    connection?: DatabaseConnection,
  ): Promise<readonly Row[]> => {
    const rows = await (connection ? connection.query : database.query())
      .selectFrom('disposalDevices')
      .innerJoin('devices', 'devices.id', 'disposalDevices.deviceId')
      .select([
        'disposalDevices.id as id',
        'disposalDevices.disposalId as disposalId',
        'disposalDevices.deviceId as deviceId',
        'disposalDevices.bookValue as bookValue',
        'disposalDevices.statusBefore as statusBefore',
        'disposalDevices.createdAt as createdAt',
        'devices.deviceNo as deviceNo',
        'devices.name as name',
        'devices.status as status',
        'devices.modelId as modelId',
        'devices.categoryId as categoryId',
        'devices.purchaseDate as purchaseDate',
        'devices.bookValue as currentBookValue',
      ])
      .orderBy('devices.deviceNo', 'asc')
      .where('disposalDevices.disposalId', '=', id)
      .execute<Row>();
    return rows.map((row) => decodeRow(row));
  };

  const recomputeTotals = async (
    connection: DatabaseConnection,
    id: string,
  ) => {
    const totals = await connection.query
      .selectFrom('disposalDevices')
      .select((eb) => [
        eb.fn.countAll().as('count'),
        eb.fn.sum('bookValue').as('total'),
      ])
      .where('disposalId', '=', id)
      .executeTakeFirst<{ count: number | string; total: unknown }>();
    await connection.query
      .updateTable('disposals')
      .set({
        deviceCount: Number(totals?.count ?? 0),
        bookValueTotal: Number(totals?.total ?? 0),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
  };

  const replaceDevices = async (
    connection: DatabaseConnection,
    id: string,
    deviceIds: readonly string[],
  ) => {
    const unique = [...new Set(deviceIds)];
    await connection.query
      .deleteFrom('disposalDevices')
      .where('disposalId', '=', id)
      .execute();
    for (const deviceId of unique) {
      const device = await connection.query
        .selectFrom('devices')
        .select(['id', 'status', 'bookValue', 'deviceNo'])
        .where('id', '=', deviceId)
        .executeTakeFirst<{
          id: string;
          status: string;
          bookValue: unknown;
          deviceNo: string;
        }>();
      if (!device) throw new ValidationError('Device not found', 'deviceIds');
      if (device.status === 'disposed')
        throw new BusinessRuleError(
          `${device.deviceNo} is already disposed`,
          'DISPOSED',
        );
      const elsewhere = await connection.query
        .selectFrom('disposalDevices')
        .innerJoin('disposals', 'disposals.id', 'disposalDevices.disposalId')
        .select('disposals.disposalNo as disposalNo')
        .where('disposalDevices.deviceId', '=', deviceId)
        .where('disposals.id', '!=', id)
        .where('disposals.status', 'in', [...OPEN_STATUSES])
        .executeTakeFirst<{ disposalNo: string }>();
      if (elsewhere)
        throw new BusinessRuleError(
          `${device.deviceNo} is already listed on ${elsewhere.disposalNo}`,
          'DEVICE_LISTED',
        );
      await connection.query
        .insertInto('disposalDevices')
        .values({
          id: crypto.randomUUID(),
          disposalId: id,
          deviceId,
          bookValue:
            device.bookValue === null || device.bookValue === undefined
              ? null
              : Number(device.bookValue),
          statusBefore: device.status,
          createdAt: new Date(),
        })
        .execute();
    }
    await recomputeTotals(connection, id);
  };

  /**
   * The recipient is one party named one way: a vendor on the books, or a
   * name typed in for anyone who is not. A record holding both says two
   * different things, and nothing downstream could say which one received
   * the devices.
   */
  const assertOneRecipient = (
    vendorId: unknown,
    name: unknown,
    fallback: Row = {},
  ): void => {
    const vendor =
      vendorId === undefined ? fallback.recipientVendorId : vendorId;
    const typed = name === undefined ? fallback.recipientName : name;
    if (vendor && typeof typed === 'string' && typed.trim() !== '')
      throw new ValidationError(
        'Name the recipient once: a vendor or a name',
        'recipientName',
      );
  };

  const createIn = async (
    connection: DatabaseConnection,
    input: DisposalInput,
    context: OperationContext,
  ): Promise<Row> => {
    if (!DISPOSAL_METHODS.includes(input.method))
      throw new ValidationError('Invalid method', 'method');
    if (!DISPOSAL_REASONS.includes(input.reason))
      throw new ValidationError('Invalid reason', 'reason');
    assertOneRecipient(input.recipientVendorId, input.recipientName);
    const { deviceIds, ...fields } = input;
    const id = crypto.randomUUID();
    const now = new Date();
    await connection.query
      .insertInto('disposals')
      .values({
        ...fields,
        id,
        disposalNo: await numbering.next('disposal', { connection }),
        description: input.description ?? null,
        requesterId: input.requesterId ?? context.actorId,
        requestedAt: input.requestedAt ?? today(),
        status: 'draft',
        deviceCount: 0,
        bookValueTotal: 0,
        currency:
          input.currency ??
          (await settings.get('general', connection)).currency,
        createdById: context.actorId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    if (deviceIds && deviceIds.length > 0)
      await replaceDevices(connection, id, deviceIds);
    // One creation line that says what it lists, as a device's says its
    // status; the change log's bare "create" would repeat it.
    await history.record(
      {
        subjectType: 'disposals',
        subjectId: id,
        type: 'created',
        summary: `Created with ${deviceIds?.length ?? 0} device(s)`,
        payload: { to: 'draft', deviceCount: deviceIds?.length ?? 0 },
        ...context,
      },
      connection,
    );
    return (await records.findRaw(id, connection)) ?? {};
  };

  /** Approved: every device to pending disposal, seats and components reclaimed. */
  const applyApproval = async (
    connection: DatabaseConnection,
    disposal: Row,
    context: OperationContext,
  ) => {
    const id = String(disposal.id);
    const source = { ...context, sourceType: 'disposal', sourceId: id };
    for (const entry of await listDevices(id, connection)) {
      const deviceId = String(entry.deviceId);
      const seats = await connection.query
        .selectFrom('entitlementSeats')
        .select(['id', 'entitlementId'])
        .where('holderType', '=', 'device')
        .where('holderId', '=', deviceId)
        .where('releasedAt', 'is', null)
        .execute<{ id: string; entitlementId: string }>();
      const byEntitlement = new Map<string, string[]>();
      for (const seat of seats)
        byEntitlement.set(seat.entitlementId, [
          ...(byEntitlement.get(seat.entitlementId) ?? []),
          seat.id,
        ]);
      for (const [entitlementId, seatIds] of byEntitlement)
        await entitlements.reclaimSeatsWithin(
          connection,
          entitlementId,
          seatIds,
          source,
        );
      const holdings = await connection.query
        .selectFrom('stockHoldings')
        .select(['stockItemId', 'quantity'])
        .where('holderType', '=', 'device')
        .where('holderId', '=', deviceId)
        .where('quantity', '>', 0)
        .execute<{ stockItemId: string; quantity: number }>();
      for (const holding of holdings)
        await stock.takeBackWithin(
          connection,
          holding.stockItemId,
          {
            holderType: 'device',
            holderId: deviceId,
            quantity: Number(holding.quantity),
            notes: `Reclaimed for ${String(disposal.disposalNo)}`,
          },
          source,
        );
      if (entry.status !== 'pendingDisposal') {
        await devices.transition(
          deviceId,
          'markPendingDisposal',
          source,
          connection,
          {
            summary: `Pending disposal (${String(disposal.disposalNo)})`,
            payload: {
              disposalId: id,
              targetLabel: String(disposal.disposalNo),
            },
          },
        );
      }
    }
  };

  const viewFilter = (view: unknown): ListOptions['filter'] => {
    switch (view) {
      case undefined:
        return {};
      case 'pendingApproval':
        return { status: 'pendingApproval' };
      case 'approved':
        return { status: 'approved' };
      case 'executedThisYear':
        return {
          status: 'executed',
          'disposedAt:gte': `${today().slice(0, 4)}-01-01`,
        };
      default:
        throw new ValidationError(`Unknown view: ${String(view)}`, 'view');
    }
  };

  /**
   * Asking for approval, and taking the request back, belong to the side
   * that asked: the person named as the requester, or whoever raised it for
   * them. Holding `submit` is not enough — the permission set that grants it
   * also grants `approve`, so without this an approver could submit or
   * withdraw instead of deciding (the same rule as a purchase order).
   */
  const requireRequester = (disposal: Row, context: OperationContext) => {
    if (
      context.actorId !== asText(disposal.requesterId) &&
      context.actorId !== asText(disposal.createdById)
    )
      throw new BusinessRuleError(
        'Only the requester can submit or withdraw this request',
        'NOT_REQUESTER',
      );
  };

  return {
    async list(options, conditions) {
      const { view, ...rest } = options.filter ?? {};
      return listCollection(
        database,
        definition,
        { ...options, filter: { ...rest, ...viewFilter(view) } },
        conditions,
      );
    },

    async get(id, conditions) {
      const row = await records.load(id, conditions).catch(() => undefined);
      return row ? records.shape(row, conditions) : undefined;
    },

    async create(input, context, conditions) {
      const { deviceIds, ...fields } = input;
      assertInputFields(fields, conditions.fieldAccess?.input ?? '*');
      const created = await database.transaction((connection) =>
        createIn(connection, { ...fields, deviceIds }, context),
      );
      return records.shape(created, conditions);
    },

    createWithin: (connection, input, context) =>
      createIn(connection, input, context),

    async update(id, input, context, conditions) {
      const blocked = Object.keys(input).filter((field) =>
        LIFECYCLE_FIELDS.has(field),
      );
      if (blocked.length > 0)
        throw new ValidationError(
          `Fields change only through operations: ${blocked.join(', ')}`,
          blocked[0],
        );
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      return records.mutate(id, conditions, async (connection, disposal) => {
        if (!EDITABLE_STATUSES.has(String(disposal.status)))
          throw new BusinessRuleError(
            'Disposal cannot be edited in this status',
            'INVALID_STATUS',
          );
        const settled =
          String(disposal.status) === 'approved'
            ? Object.keys(input).filter((field) => !SETTLED_EDITABLE.has(field))
            : [];
        if (settled.length > 0)
          throw new ValidationError(
            `An approved disposal states what was approved: ${settled.join(', ')}`,
            settled[0],
          );
        assertOneRecipient(
          input.recipientVendorId,
          input.recipientName,
          disposal,
        );
        // Wiped says how it was wiped: the two are answered together, so a
        // write that leaves one of them out is half an answer.
        const wipe = input.dataWipe ?? disposal.dataWipe;
        const method =
          input.wipeMethod === undefined
            ? disposal.wipeMethod
            : input.wipeMethod;
        if (wipe === 'wiped' && !method)
          throw new ValidationError('wipeMethod is required', 'wipeMethod');
        await connection.query
          .updateTable('disposals')
          .set({ ...input, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'disposals', subjectId: id },
          disposal,
          input,
          context,
          connection,
        );
      });
    },

    async deleteImpact(id) {
      const disposal = await records.findRaw(id);
      return {
        level:
          disposal && String(disposal.status) === 'draft' ? 'plain' : 'blocked',
        references: [],
      };
    },

    async delete(id, context, conditions) {
      await database.transaction(async (connection) => {
        const disposal = await records.load(id, conditions, connection);
        records.requireStatus(disposal, ['draft'], 'delete');
        await connection.query
          .deleteFrom('disposalDevices')
          .where('disposalId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('disposals')
          .where('id', '=', id)
          .execute();
        await history.log(
          {
            subjectType: 'disposals',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    devices: (id) => listDevices(id),

    async setDevices(id, deviceIds, context, conditions) {
      await records.mutate(id, conditions, async (connection, disposal) => {
        records.requireStatus(disposal, ['draft', 'rejected'], 'setDevices');
        await replaceDevices(connection, id, deviceIds);
        await history.record(
          {
            subjectType: 'disposals',
            subjectId: id,
            type: 'devicesChanged',
            summary: `${deviceIds.length} device(s) listed`,
            payload: { deviceIds },
            ...context,
          },
          connection,
        );
      });
      return listDevices(id);
    },

    async submit(id, approverId, context, conditions) {
      let approverIds: readonly string[] = [];
      let title = '';
      const row = await records.mutate(
        id,
        conditions,
        async (connection, disposal) => {
          records.requireStatus(disposal, ['draft', 'rejected'], 'submit');
          requireRequester(disposal, context);
          await recomputeTotals(connection, id);
          const refreshed = (await records.findRaw(id, connection)) ?? disposal;
          if (Number(refreshed.deviceCount) === 0)
            throw new BusinessRuleError(
              'Add at least one device before submitting',
              'NO_DEVICES',
            );
          title = `${String(disposal.disposalNo)} ${String(disposal.method)}`;
          // Every disposal is approved by the person its submitter names;
          // there is no switch to skip it (removed 2026-09-27).
          const approval = await approvals.request(
            {
              subjectType: 'disposal',
              subjectId: id,
              title,
              amount: Number(refreshed.bookValueTotal ?? 0),
              approverId,
            },
            context,
            connection,
          );
          approverIds = Array.isArray(approval.approverIds)
            ? (approval.approverIds as string[])
            : [];
          // `approvals.request` already wrote the event for this act.
          await records.setStatus(
            connection,
            disposal,
            'pendingApproval',
            context,
            null,
          );
        },
      );
      await notifier.notify({
        key: `disposal:${id}:submitted:${String(row.updatedAt)}`,
        to: approverIds,
        actorId: context.actorId,
        title: `Approval requested: ${title}`,
        body: 'A disposal request is waiting for your decision.',
        url: `/disposals/${id}`,
        source: { type: 'disposal', referenceId: id },
      });
      return row;
    },

    withdraw: (id, context, conditions) =>
      records.mutate(id, conditions, async (connection, disposal) => {
        records.requireStatus(disposal, ['pendingApproval'], 'withdraw');
        requireRequester(disposal, context);
        await approvals.withdraw('disposal', id, context, connection);
        // Taking the request back makes it a draft again, the way a
        // purchase order's withdrawal does; the timeline says it was
        // withdrawn.
        await records.setStatus(connection, disposal, 'draft', context, null);
      }),

    async decide(id, decision, comment, context, conditions) {
      let requesterId: string | undefined;
      let title = '';
      const row = await records.mutate(
        id,
        conditions,
        async (connection, disposal) => {
          records.requireStatus(disposal, ['pendingApproval'], 'decide');
          const pending = (
            await approvals.forSubject('disposal', id, connection)
          ).find((approval) => approval.status === 'pending');
          if (!pending)
            throw new BusinessRuleError('No pending approval', 'NOT_PENDING');
          await approvals.decide(
            String(pending.id),
            decision,
            comment,
            context,
            connection,
          );
          requesterId = String(pending.requestedById);
          title = `${String(disposal.disposalNo)} ${String(disposal.method)}`;
          await records.setStatus(
            connection,
            disposal,
            decision === 'approved' ? 'approved' : 'rejected',
            context,
            null,
          );
          if (decision === 'approved')
            await applyApproval(connection, disposal, context);
        },
      );
      await notifier.notify({
        key: `disposal:${id}:${decision}:${String(row.updatedAt)}`,
        to: [requesterId],
        actorId: context.actorId,
        title: `${decision === 'approved' ? 'Approved' : 'Rejected'}: ${title}`,
        body: comment ?? '',
        url: `/disposals/${id}`,
        source: { type: 'disposal', referenceId: id },
      });
      return row;
    },

    execute: (id, input, context, conditions) =>
      records.mutate(id, conditions, async (connection, disposal) => {
        records.requireStatus(disposal, ['approved'], 'execute');
        // Carrying it out is for the people the request went through: the
        // side that raised it, and whoever was asked to decide or decided.
        if (
          context.actorId !== asText(disposal.requesterId) &&
          context.actorId !== asText(disposal.createdById)
        ) {
          const trail = await approvals.forSubject('disposal', id, connection);
          const asked = trail.some(
            (entry) =>
              asText(entry.decidedById) === context.actorId ||
              (Array.isArray(entry.approverIds) &&
                (entry.approverIds as unknown[]).includes(context.actorId)),
          );
          if (!asked)
            throw new BusinessRuleError(
              'Only the requester or the approver can carry out this disposal',
              'NOT_INVOLVED',
            );
        }
        if (!DATA_WIPE_OPTIONS.includes(input.dataWipe))
          throw new ValidationError('dataWipe is required', 'dataWipe');
        if (input.dataWipe === 'wiped' && !input.wipeMethod)
          throw new ValidationError('wipeMethod is required', 'wipeMethod');
        assertOneRecipient(input.recipientVendorId, input.recipientName);
        const statedRecipientName = input.recipientName?.trim()
          ? input.recipientName
          : null;
        if (input.recipientVendorId) {
          const vendor = await connection.query
            .selectFrom('vendors')
            .select('id')
            .where('id', '=', input.recipientVendorId)
            .executeTakeFirst();
          if (!vendor)
            throw new ValidationError('Vendor not found', 'recipientVendorId');
        }
        const source = { ...context, sourceType: 'disposal', sourceId: id };
        for (const entry of await listDevices(id, connection)) {
          if (entry.status !== 'pendingDisposal')
            throw new BusinessRuleError(
              `${String(entry.deviceNo)} is not pending disposal`,
              'INVALID_STATUS',
            );
          await devices.transition(
            String(entry.deviceId),
            'dispose',
            source,
            connection,
            {
              summary: `Disposed (${String(disposal.disposalNo)}, ${String(disposal.method)})`,
              payload: {
                disposalId: id,
                targetLabel: String(disposal.disposalNo),
                method: disposal.method,
              },
            },
          );
        }
        const devicesDisposed = (await listDevices(id, connection)).length;
        const values = {
          disposedAt: input.disposedAt ?? today(),
          proceeds: input.proceeds ?? null,
          expenses: input.expenses ?? null,
          currency: input.currency ?? disposal.currency ?? null,
          // The request already said where the devices go and what happens
          // to the data on them; the execution confirms that or corrects
          // it, and what it does not mention stands. Naming the recipient
          // the other way replaces it rather than adding a second one.
          recipientVendorId: statedRecipientName
            ? null
            : (input.recipientVendorId ?? disposal.recipientVendorId ?? null),
          recipientName: input.recipientVendorId
            ? null
            : (statedRecipientName ?? disposal.recipientName ?? null),
          dataWipe: input.dataWipe,
          wipeMethod: input.dataWipe === 'wiped' ? input.wipeMethod : null,
          // Who carried it out: the person the executor names, else
          // whoever pressed the button.
          executedById: input.executedById ?? context.actorId,
        };
        // The status change is logged; the line that tells it is the
        // execution itself — how many devices went and what it brought in.
        await records.setStatus(
          connection,
          disposal,
          'executed',
          context,
          null,
          undefined,
          values,
        );
        await history.record(
          {
            subjectType: 'disposals',
            subjectId: id,
            type: 'disposalExecuted',
            summary: `Disposal executed: ${devicesDisposed} device(s)`,
            payload: {
              count: devicesDisposed,
              method: disposal.method,
              proceeds: values.proceeds,
              currency: values.currency,
            },
            ...context,
          },
          connection,
        );
      }),

    async forDevice(deviceId, options = {}) {
      let query = database
        .query()
        .selectFrom('disposals')
        .innerJoin(
          'disposalDevices',
          'disposalDevices.disposalId',
          'disposals.id',
        )
        .select([
          'disposals.id as id',
          'disposals.disposalNo as disposalNo',
          'disposals.method as method',
          'disposals.reason as reason',
          'disposals.status as status',
          'disposals.requestedAt as requestedAt',
          'disposals.createdAt as createdAt',
        ])
        .where('disposalDevices.deviceId', '=', deviceId)
        .orderBy('disposals.createdAt', 'desc');
      if (options.open)
        query = query.where('disposals.status', 'in', [...OPEN_STATUSES]);
      const rows = await query.execute<Row>();
      return rows.map((row) => decodeRow(row));
    },
  };
}
