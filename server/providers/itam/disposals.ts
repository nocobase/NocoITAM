import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { JsonObject, LifecycleRuntime } from '@nocobase/lifecycle';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  DISPOSAL_LIFECYCLE,
  type DisposalState,
} from '../../lifecycles/disposals.js';
import {
  requestTitle,
  type ApprovalDecision,
  type ApprovalService,
} from './approvals.js';
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
import type { ApproverDirectory } from './approvers.js';
import { lifecycleRefusal } from './lifecycles.js';
import type { NumberingService } from './numbering.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';
import { today } from './dates.js';
import { OPEN_DISPOSAL_STATUSES } from './recovery.js';

/**
 * Disposal records: draft → pendingApproval → approved → executed, with
 * rejected as the side exit and withdrawal returning it to draft. Approval moves every listed
 * device to pending disposal and reclaims its seats and components in the
 * same transaction; execution moves them to disposed, which is permanent.
 *
 * The state moves only through the disposal's lifecycle
 * (`server/lifecycles/disposals.ts`, 2026-10-18): each operation fires its
 * transition inside its own transaction, which checks the state, who may do
 * it and the version, and owes the notifications; what the transition
 * carries along — the approval request, the devices — is written here, in
 * the same transaction.
 */
export const DISPOSAL_METHODS = [
  'scrap',
  'sale',
  'donation',
  'returnToLessor',
  'lossWriteOff',
  'other',
] as const;
/**
 * The methods a disposal may name no recipient for (2026-10-20): a lost
 * device goes to nobody, and 其他 may not either. The form's
 * `RECIPIENT_OPTIONAL` (`client/lib/itam/operations.ts`) must agree.
 */
export const RECIPIENT_OPTIONAL: readonly (typeof DISPOSAL_METHODS)[number][] =
  ['lossWriteOff', 'other'];
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
  readonly ownerId?: string;
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
  'statusChangedAt',
  'lifecycleVersion',
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
/**
 * Whether a write only hands the record over — changes who answers for it
 * and nothing else. Anyone who may update the record may do that while it is
 * open (2026-10-05), whoever they are and whatever else the status would
 * refuse: handing a request over is not editing what it asks for, and a
 * request whose 负责人 had left was stuck, since only its owner or its
 * creator could touch it and in the ordinary case both were the person who
 * had gone.
 */
const onlyHandsOver = (input: object): boolean => {
  const keys = Object.keys(input);
  return keys.length === 1 && keys[0] === 'ownerId';
};

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
  lifecycles: LifecycleRuntime;
  approvers: ApproverDirectory;
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
    lifecycles,
    approvers,
  } = dependencies;
  const definition = DISPOSALS_COLLECTION;
  const records = createRecordHelpers(database, history, definition);

  /**
   * Fires a transition in the operation's transaction: the runtime checks
   * the state, the guard and the version, and writes the state with its log
   * entry; the change log keeps its status line, as every other record's.
   */
  const move = async (
    connection: DatabaseConnection,
    disposal: Row,
    transition: string,
    context: OperationContext,
    input: JsonObject = {},
  ): Promise<DisposalState> => {
    const id = String(disposal.id);
    let next: DisposalState;
    try {
      const result = await lifecycles.fire(DISPOSAL_LIFECYCLE, id, transition, {
        actor: { id: context.actorId },
        input,
        transaction: connection,
      });
      next = result.record.status as DisposalState;
    } catch (error) {
      throw lifecycleRefusal(error);
    }
    await history.log(
      {
        subjectType: 'disposals',
        subjectId: id,
        action: 'statusChange',
        field: 'status',
        oldValue: disposal.status,
        newValue: next,
        ...context,
      },
      connection,
    );
    return next;
  };

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
    // Why the devices go, in words (2026-10-20).
    if (!input.description?.trim())
      throw new ValidationError('description is required', 'description');
    assertOneRecipient(input.recipientVendorId, input.recipientName);
    // A disposal is of devices (2026-10-23): the form asks for them, and so
    // does the service, so none is left empty.
    if (!input.deviceIds?.length)
      throw new ValidationError('Choose at least one device', 'deviceIds');
    const { deviceIds, ...fields } = input;
    const id = crypto.randomUUID();
    const now = new Date();
    // Created through the lifecycle, which starts it as a draft and opens
    // its log.
    await lifecycles
      .create(
        DISPOSAL_LIFECYCLE,
        {
          ...fields,
          id,
          disposalNo: await numbering.next('disposal', { connection }),
          description: input.description ?? null,
          ownerId: input.ownerId ?? context.actorId,
          requestedAt: input.requestedAt ?? today(),
          deviceCount: 0,
          bookValueTotal: 0,
          currency:
            input.currency ??
            (await settings.get('general', connection)).currency,
          createdById: context.actorId,
          createdAt: now,
          updatedAt: now,
        },
        { actor: { id: context.actorId }, transaction: connection },
      )
      .catch((error: unknown) => {
        throw lifecycleRefusal(error);
      });
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
      // Where the devices go is stated with the request, draft or not
      // (2026-10-16), rather than first asked at execution — unless nobody
      // receives them (2026-10-20): a lost device, or 其他.
      if (
        !RECIPIENT_OPTIONAL.includes(input.method) &&
        !input.recipientVendorId &&
        !(typeof input.recipientName === 'string' && input.recipientName.trim())
      )
        throw new ValidationError(
          'Name the recipient: a vendor or a name',
          'recipientVendorId',
        );
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
        if (onlyHandsOver(input)) {
          if (!OPEN_DISPOSAL_STATUSES.includes(String(disposal.status)))
            throw new BusinessRuleError(
              'A closed disposal keeps the owner it had',
              'INVALID_STATUS',
            );
        } else if (!EDITABLE_STATUSES.has(String(disposal.status)))
          throw new BusinessRuleError(
            'Disposal cannot be edited in this status',
            'INVALID_STATUS',
          );
        const settled =
          String(disposal.status) === 'approved' && !onlyHandsOver(input)
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
        // Its lifecycle log goes with it: the tables name records by id
        // and hold no key to remove them by.
        for (const table of ['lifecycleEffectRuns', 'lifecycleTransitions'])
          await connection.query
            .deleteFrom(table)
            .where('lifecycle', '=', DISPOSAL_LIFECYCLE)
            .where('recordId', '=', id)
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
        if (deviceIds.length === 0)
          throw new ValidationError('Keep at least one device', 'deviceIds');
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

    // The approver hears of it, and the requester of the decision, through
    // the lifecycle's effects once the transaction commits.
    async submit(id, approverId, context, conditions) {
      // Asked before the transaction opens: who holds which permission set
      // is read outside SQLite's one connection.
      if (approverId && !(await approvers.mayApprove('disposal', approverId)))
        throw new BusinessRuleError(
          'Choose an approver from the range set for disposals',
          'APPROVER_NOT_IN_RANGE',
        );
      return records.mutate(id, conditions, async (connection, disposal) => {
        // The guard reads the count the devices make now.
        await recomputeTotals(connection, id);
        // Who it asks, and who asks: what the approver is told.
        await move(connection, disposal, 'submit', context, {
          approverIds: approverId ? [approverId] : [],
          requestedById: context.actorId,
        });
        const refreshed = (await records.findRaw(id, connection)) ?? disposal;
        // Every disposal is approved by the person its submitter names;
        // there is no switch to skip it (removed 2026-09-27). It writes the
        // event for this act.
        await approvals.request(
          {
            subjectType: 'disposal',
            subjectId: id,
            title: requestTitle(disposal.disposalNo, disposal.description),
            amount: Number(refreshed.bookValueTotal ?? 0),
            approverId,
          },
          context,
          connection,
        );
      });
    },

    withdraw: (id, context, conditions) =>
      records.mutate(id, conditions, async (connection, disposal) => {
        // Taking the request back makes it a draft again, the way a
        // purchase order's withdrawal does; the timeline says it was
        // withdrawn.
        await move(connection, disposal, 'withdraw', context);
        await approvals.withdraw('disposal', id, context, connection);
      }),

    decide: (id, decision, comment, context, conditions) =>
      records.mutate(id, conditions, async (connection, disposal) => {
        const pending = (
          await approvals.forSubject('disposal', id, connection)
        ).find((approval) => approval.status === 'pending');
        await move(
          connection,
          disposal,
          decision === 'approved' ? 'approve' : 'reject',
          context,
          // Who asked hears the decision, in the approver's own words.
          {
            comment: comment ?? '',
            requestedById: asText(pending?.requestedById) ?? null,
            decidedById: context.actorId,
          },
        );
        // The guard refuses a disposal with no request open.
        if (!pending)
          throw new BusinessRuleError('No pending approval', 'NOT_PENDING');
        await approvals.decide(
          String(pending.id),
          decision,
          comment,
          context,
          connection,
        );
        if (decision === 'approved')
          await applyApproval(connection, disposal, context);
      }),

    execute: (id, input, context, conditions) =>
      records.mutate(id, conditions, async (connection, disposal) => {
        // Who may carry it out — the people the request went through — is
        // the transition's guard, asked when it fires below.
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
        const values = {
          disposedAt: input.disposedAt ?? today(),
          proceeds: input.proceeds ?? null,
          expenses: input.expenses ?? null,
          currency: input.currency ?? asText(disposal.currency) ?? null,
          // The request already said where the devices go and what happens
          // to the data on them; the execution confirms that or corrects
          // it, and what it does not mention stands. Naming the recipient
          // the other way replaces it rather than adding a second one.
          recipientVendorId: statedRecipientName
            ? null
            : (input.recipientVendorId ??
              asText(disposal.recipientVendorId) ??
              null),
          recipientName: input.recipientVendorId
            ? null
            : (statedRecipientName ?? asText(disposal.recipientName) ?? null),
          dataWipe: input.dataWipe,
          wipeMethod:
            input.dataWipe === 'wiped' ? (input.wipeMethod ?? null) : null,
          // Who carried it out: the person the executor names, else
          // whoever pressed the button.
          executedById: input.executedById ?? context.actorId,
        };
        // Written with the state: the execution and what it states commit
        // together or not at all.
        await move(connection, disposal, 'execute', context, values);
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
        // The line that tells it is the execution itself — how many devices
        // went and what it brought in.
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
