import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApprovalService } from './approvals.js';
import type { DeviceService, OperationContext } from './devices.js';
import {
  assertInputFields,
  compileAuthzScope,
  outputFields,
  pickFields,
} from './authz-filter.js';
import {
  asText,
  decodeRow,
  listCollection,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { PURCHASE_ORDERS_COLLECTION } from './collections.js';
import {
  BusinessRuleError,
  DeleteBlockedError,
  RecordNotFoundError,
  UnauthorizedFieldsError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { ItamNotifier } from './notifier.js';
import type { EntitlementService } from './entitlements.js';
import type { NumberingService } from './numbering.js';
import type { SettingsService } from './settings.js';
import type { StockService } from './stock.js';
import { addMonths, today } from './dates.js';
import { OPEN_PURCHASE_ORDER_STATUSES } from './recovery.js';

/**
 * Purchase orders: request → approval → order → receipt → stock-in. Receiving
 * a line generates the records its item type calls for — devices (pending
 * receipt), stock quantity, or an entitlement of either kind — inside one
 * transaction with the receipt row, so the ledger and the order agree.
 */
export const PO_REASONS = [
  'newHire',
  'batchReplacement',
  'stockReplenishment',
  'project',
  'faultReplacement',
  'other',
] as const;
export const PO_STATUSES = [
  'draft',
  'pendingApproval',
  'approved',
  'rejected',
  'ordered',
  'partiallyReceived',
  'completed',
  'cancelled',
] as const;
export const LINE_ITEM_TYPES = [
  'device',
  'accessory',
  'consumable',
  'component',
  'perpetual',
  'subscription',
] as const;
export type LineItemType = (typeof LINE_ITEM_TYPES)[number];

export interface LineInput {
  readonly id?: string;
  readonly itemType: LineItemType;
  readonly modelId?: string | null;
  readonly softwareProductId?: string | null;
  readonly quantity: number;
  readonly unitPrice?: number | null;
}

export interface ReceiveInput {
  readonly lineId: string;
  readonly quantity: number;
  readonly notes?: string | null;
  /** Devices: one serial per unit; stock: the item to add to (or created); entitlements: extra fields. */
  readonly serialNos?: readonly string[];
  readonly locationId?: string;
  readonly stockItemId?: string | null;
  /** Entitlements: the record to add the seats to (or created). */
  readonly entitlementId?: string | null;
  readonly extra?: Row;
}

export interface ProcurementService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
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
  lines(id: string): Promise<readonly Row[]>;
  /**
   * Replaces the order's lines. `lineConditions` is the caller's decision on
   * `purchaseOrderLines`: a field they may not read (a price, for a role
   * without cost access) is neither written from the input nor cleared by
   * the null the client sends in its place.
   */
  setLines(
    id: string,
    lines: readonly LineInput[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    lineConditions?: DatabaseAuthorizationConditions,
  ): Promise<readonly Row[]>;
  /** Sends the order for approval; `approverId` is who is being asked. */
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
    decision: 'approved' | 'rejected',
    comment: string | undefined,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  markOrdered(
    id: string,
    input: { orderedAt?: string; expectedAt?: string | null },
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  receive(
    id: string,
    input: ReceiveInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  cancel(
    id: string,
    reason: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  receipts(id: string): Promise<readonly Row[]>;
  /** Records this order generated (devices, stock items, entitlements). */
  generated(id: string): Promise<readonly Row[]>;
}

export const procurementServiceToken: ServiceToken<ProcurementService> =
  createServiceToken<ProcurementService>('itam/procurement-service');

/** Reads a string-ish value from loosely typed input. */
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : fallback;

const LIFECYCLE_FIELDS = new Set([
  'status',
  'orderNo',
  'estimatedTotal',
  'orderedAt',
  'receivedAt',
  'cancelReason',
]);
/**
 * A rejected order is editable like a draft: it may be submitted again
 * (`submit` accepts `draft` and `rejected`), and asking the same approver
 * for the same thing they just refused is the one thing that cannot help.
 * `pendingApproval` is missing on purpose — an order under review does not
 * change under the approver's feet; withdraw it first.
 */
const EDITABLE_STATUSES = new Set([
  'draft',
  'rejected',
  'approved',
  'ordered',
  'partiallyReceived',
]);
/** Where an order is still its 负责人's to shape: nothing decided yet. */
const UNDECIDED_STATUSES = new Set(['draft', 'rejected']);
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

/**
 * Where the request itself is settled: the approval was given for what the
 * order said then, so what it asks for stops changing. What still moves is
 * the delivery — `expectedAt` by hand, `orderedAt` and `receivedAt` through
 * the operations. The lines are fixed too: `setLines` refuses past
 * `UNDECIDED_STATUSES`.
 */
const SETTLED_STATUSES = new Set(['approved', 'ordered', 'partiallyReceived']);
const SETTLED_EDITABLE = new Set(['expectedAt']);

/** What the receipt dialog asks for each kind of line (`extra`). */
const RECEIVE_EXTRA: Readonly<Record<LineItemType, readonly string[]>> = {
  device: ['name', 'departmentId', 'warrantyEndDate', 'ownerId'],
  accessory: ['name', 'minimumQuantity', 'ownerId'],
  consumable: ['name', 'minimumQuantity', 'ownerId'],
  component: ['name', 'minimumQuantity', 'ownerId'],
  perpetual: [
    'name',
    'licensingModel',
    'maintenanceExpiryDate',
    'productKey',
    'reassignable',
    'ownerId',
  ],
  subscription: [
    'name',
    'billingModel',
    'billingCycle',
    'unitPrice',
    'expiryDate',
    'autoRenew',
    'ownerId',
  ],
};

export function createProcurementService(deps: {
  database: DatabaseManager;
  history: HistoryService;
  numbering: NumberingService;
  settings: SettingsService;
  approvals: ApprovalService;
  notifier: ItamNotifier;
  devices: DeviceService;
  stock: StockService;
  entitlements: EntitlementService;
}): ProcurementService {
  const {
    database,
    history,
    notifier,
    numbering,
    settings,
    approvals,
    devices,
    stock,
    entitlements,
  } = deps;
  const definition = PURCHASE_ORDERS_COLLECTION;

  const load = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', '=', id)
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError('purchaseOrders', id);
    return decodeRow(row);
  };
  const findRaw = async (
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('purchaseOrders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row ? decodeRow(row) : undefined;
  };
  const shape = (row: Row, conditions: DatabaseAuthorizationConditions): Row =>
    pickFields(row, outputFields(definition.fields, conditions));

  /** `summary: null` leaves the event to the operation; see `domain-record.ts`. */
  const setStatus = async (
    connection: DatabaseConnection,
    order: Row,
    next: string,
    context: OperationContext,
    summary: string | null,
    payload: Record<string, unknown> = {},
    extra: Row = {},
  ) => {
    await connection.query
      .updateTable('purchaseOrders')
      .set({ status: next, ...extra, updatedAt: new Date() })
      .where('id', '=', String(order.id))
      .execute();
    await history.log(
      {
        subjectType: 'purchaseOrders',
        subjectId: String(order.id),
        action: 'statusChange',
        field: 'status',
        oldValue: order.status,
        newValue: next,
        ...context,
      },
      connection,
    );
    if (summary === null) return;
    await history.record(
      {
        subjectType: 'purchaseOrders',
        subjectId: String(order.id),
        type: 'statusChange',
        summary,
        payload: { from: order.status, to: next, ...payload },
        ...context,
      },
      connection,
    );
  };

  const recomputeTotals = async (
    connection: DatabaseConnection,
    id: string,
  ) => {
    const lines = await connection.query
      .selectFrom('purchaseOrderLines')
      .select(['quantity', 'unitPrice', 'receivedQuantity'])
      .where('purchaseOrderId', '=', id)
      .execute<{
        quantity: number;
        unitPrice: unknown;
        receivedQuantity: number;
      }>();
    const estimated = lines.reduce(
      (sum, line) => sum + Number(line.quantity) * Number(line.unitPrice ?? 0),
      0,
    );
    await connection.query
      .updateTable('purchaseOrders')
      .set({
        estimatedTotal: Math.round(estimated * 100) / 100,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return lines;
  };

  /**
   * The order belongs to its 负责人, or to whoever wrote it before handing it
   * over. Editing it, asking for approval and taking the request back are
   * all theirs. Holding the grant
   * is not enough — the permission set that grants `update` and `submit`
   * also grants `approve`, so without this an approver could rewrite or
   * file a request instead of deciding it. The page hides these actions
   * from everyone else; this is what makes that true. Receiving, ordering
   * and cancelling stay with the grant: they are the buyer's steps, not the
   * 负责人's.
   */
  const raisedTheOrder = (order: Row, context: OperationContext) =>
    context.actorId === asText(order.ownerId) ||
    context.actorId === asText(order.createdById);

  const requireOwner = (order: Row, context: OperationContext) => {
    if (!raisedTheOrder(order, context))
      throw new BusinessRuleError(
        'Only the owner can edit, submit or withdraw this request',
        'NOT_OWNER',
      );
  };

  const requireStatus = (
    order: Row,
    allowed: readonly string[],
    operation: string,
  ) => {
    if (!allowed.includes(String(order.status))) {
      throw new BusinessRuleError(
        `Operation "${operation}" is not allowed from status "${String(order.status)}"`,
        'INVALID_STATUS',
      );
    }
  };

  const mutate = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    fn: (connection: DatabaseConnection, order: Row) => Promise<void>,
  ): Promise<Row> => {
    await database.transaction(async (connection) => {
      const order = await load(id, conditions, connection);
      await fn(connection, order);
    });
    return shape((await findRaw(id)) ?? {}, conditions);
  };

  return {
    async list(options, conditions) {
      const { view, ...rest } = options.filter ?? {};
      const filter: Record<string, string | readonly string[] | Date> = {
        ...rest,
      };
      if (view === 'pendingApproval') filter.status = 'pendingApproval';
      else if (view === 'awaitingReceipt')
        filter.status = ['ordered', 'partiallyReceived'];
      else if (view === 'overdue') {
        filter.status = ['ordered', 'partiallyReceived'];
        filter['expectedAt:lt'] = today();
      } else if (view === 'approvedThisMonth') {
        filter.status = [
          'approved',
          'ordered',
          'partiallyReceived',
          'completed',
        ];
        filter['updatedAt:gte'] = new Date(
          `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`,
        );
      } else if (view !== undefined)
        throw new ValidationError(`Unknown view: ${String(view)}`, 'view');
      return listCollection(
        database,
        definition,
        { ...options, filter },
        conditions,
      );
    },

    async get(id, conditions) {
      const row = await database
        .query()
        .selectFrom('purchaseOrders')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      return row ? shape(decodeRow(row), conditions) : undefined;
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      const id = crypto.randomUUID();
      await database.transaction(async (connection) => {
        const orderNo = await numbering.next('purchaseOrder', { connection });
        const ownerId =
          typeof input.ownerId === 'string' ? input.ownerId : context.actorId;
        const now = new Date();
        await connection.query
          .insertInto('purchaseOrders')
          .values({
            ...input,
            id,
            orderNo,
            ownerId,
            status: 'draft',
            estimatedTotal: 0,
            currency:
              input.currency ??
              (await settings.get('general', connection)).currency,
            createdById: context.actorId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        // The event alone: a change-log "create" would repeat it.
        await history.record(
          {
            subjectType: 'purchaseOrders',
            subjectId: id,
            type: 'created',
            summary: 'Created as draft',
            payload: { to: 'draft' },
            ...context,
          },
          connection,
        );
      });
      return shape((await findRaw(id)) ?? {}, conditions);
    },

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
      return mutate(id, conditions, async (connection, order) => {
        if (onlyHandsOver(input)) {
          if (!OPEN_PURCHASE_ORDER_STATUSES.includes(String(order.status)))
            throw new BusinessRuleError(
              'A closed order keeps the owner it had',
              'INVALID_STATUS',
            );
        } else {
          if (!EDITABLE_STATUSES.has(String(order.status)))
            throw new BusinessRuleError(
              'Order cannot be edited in this status',
              'INVALID_STATUS',
            );
          requireOwner(order, context);
        }
        const settled =
          SETTLED_STATUSES.has(String(order.status)) && !onlyHandsOver(input)
            ? Object.keys(input).filter((field) => !SETTLED_EDITABLE.has(field))
            : [];
        if (settled.length > 0)
          throw new ValidationError(
            `An approved order states what it asks for: ${settled.join(', ')}`,
            settled[0],
          );
        await connection.query
          .updateTable('purchaseOrders')
          .set({ ...input, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'purchaseOrders', subjectId: id },
          order,
          input,
          context,
          connection,
        );
      });
    },

    async deleteImpact(id) {
      const order = await findRaw(id);
      const generated = await this.generated(id);
      if (!order) return { level: 'plain', references: [] };
      if (generated.length > 0) {
        return {
          level: 'blocked',
          references: [
            {
              collection: 'purchaseReceipts',
              field: 'purchaseOrderId',
              count: generated.length,
            },
          ],
        };
      }
      if (order.status !== 'draft' && order.status !== 'cancelled') {
        return {
          level: 'blocked',
          references: [
            { collection: 'approvals', field: 'subjectId', count: 1 },
          ],
        };
      }
      return { level: 'plain', references: [] };
    },

    async delete(id, context, conditions) {
      const impact = await this.deleteImpact(id);
      if (impact.level === 'blocked') throw new DeleteBlockedError(impact);
      await database.transaction(async (connection) => {
        await load(id, conditions, connection);
        await connection.query
          .deleteFrom('purchaseOrderLines')
          .where('purchaseOrderId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('approvals')
          .where('subjectType', '=', 'purchaseOrder')
          .where('subjectId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('purchaseOrders')
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        await history.log(
          {
            subjectType: 'purchaseOrders',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    async lines(id) {
      return (
        await database
          .query()
          .selectFrom('purchaseOrderLines')
          .selectAll()
          .where('purchaseOrderId', '=', id)
          .orderBy('sort', 'asc')
          .execute<Row>()
      ).map((row) => decodeRow(row));
    },

    async setLines(id, lines, context, conditions, lineConditions) {
      const lineOutput = lineConditions?.fieldAccess?.output ?? '*';
      const readableLineField = (field: string) =>
        lineOutput === '*' || lineOutput.includes(field);
      await database.transaction(async (connection) => {
        const order = await load(id, conditions, connection);
        // What was approved is what arrives: once an order has been decided,
        // its lines are fixed. Wrong lines mean cancelling it and asking
        // again, so nobody can read an approval and find it no longer
        // describes the order (decided 2026-09-26).
        if (!UNDECIDED_STATUSES.has(String(order.status)))
          throw new BusinessRuleError(
            'Lines change only before the order is approved',
            'INVALID_STATUS',
          );
        requireOwner(order, context);
        const existing = await connection.query
          .selectFrom('purchaseOrderLines')
          .selectAll()
          .where('purchaseOrderId', '=', id)
          .execute<Row>();
        const keep = new Set(
          lines
            .map((line) => line.id)
            .filter((value): value is string => Boolean(value)),
        );
        for (const line of existing) {
          if (!keep.has(String(line.id))) {
            if (Number(line.receivedQuantity) > 0)
              throw new BusinessRuleError(
                'A line with receipts cannot be removed',
                'LINE_RECEIVED',
              );
            await connection.query
              .deleteFrom('purchaseOrderLines')
              .where('id', '=', String(line.id))
              .execute();
          }
        }
        let sort = 0;
        for (const line of lines) {
          if (!Number.isInteger(line.quantity) || line.quantity < 1)
            throw new ValidationError(
              'quantity must be a positive integer',
              'quantity',
            );
          if (
            ['device', 'accessory', 'consumable', 'component'].includes(
              line.itemType,
            ) &&
            !line.modelId
          )
            throw new ValidationError(
              'modelId is required for hardware lines',
              'modelId',
            );
          // A line's type is its model's kind: a dock ordered as a device
          // would be approved and then refused when it arrives.
          if (line.modelId) {
            const model = await connection.query
              .selectFrom('models')
              .innerJoin('categories', 'categories.id', 'models.categoryId')
              .select('categories.appliesTo as appliesTo')
              .where('models.id', '=', line.modelId)
              .executeTakeFirst<{ appliesTo: unknown }>();
            if (!model) throw new ValidationError('Model not found', 'modelId');
            if (model.appliesTo !== line.itemType)
              throw new ValidationError(
                "The line type does not match the model's category",
                'itemType',
              );
          }
          if (
            ['perpetual', 'subscription'].includes(line.itemType) &&
            !line.softwareProductId
          )
            throw new ValidationError(
              'softwareProductId is required for software lines',
              'softwareProductId',
            );
          const stated = {
            itemType: line.itemType,
            modelId: line.modelId ?? null,
            softwareProductId: line.softwareProductId ?? null,
            quantity: line.quantity,
            unitPrice: line.unitPrice ?? null,
          };
          // A field the caller cannot read is not theirs to write: stating a
          // value for it is refused, and the null their client sends in place
          // of the value it never received leaves the stored one alone.
          const hidden = Object.keys(stated).filter(
            (field) => !readableLineField(field),
          );
          const attempted = hidden.filter(
            (field) => stated[field as keyof typeof stated] !== null,
          );
          if (attempted.length > 0)
            throw new UnauthorizedFieldsError(attempted);
          const values = {
            ...Object.fromEntries(
              Object.entries(stated).filter(
                ([field]) => !hidden.includes(field),
              ),
            ),
            sort: sort++,
            updatedAt: new Date(),
          };
          if (line.id && keep.has(line.id)) {
            const current = existing.find((row) => row.id === line.id);
            if (current && Number(current.receivedQuantity) > line.quantity)
              throw new BusinessRuleError(
                'Quantity is below what was received',
                'LINE_RECEIVED',
              );
            await connection.query
              .updateTable('purchaseOrderLines')
              .set(values)
              .where('id', '=', line.id)
              .where('purchaseOrderId', '=', id)
              .execute();
          } else {
            await connection.query
              .insertInto('purchaseOrderLines')
              .values({
                ...values,
                id: crypto.randomUUID(),
                purchaseOrderId: id,
                receivedQuantity: 0,
                createdAt: new Date(),
              })
              .execute();
          }
        }
        await recomputeTotals(connection, id);
        await history.record(
          {
            subjectType: 'purchaseOrders',
            subjectId: id,
            type: 'linesChanged',
            summary: 'Lines changed',
            payload: { count: lines.length },
            ...context,
          },
          connection,
        );
      });
      return this.lines(id);
    },

    async submit(id, approverId, context, conditions) {
      let asked: readonly string[] = [];
      let title = '';
      const row = await mutate(id, conditions, async (connection, order) => {
        requireStatus(order, ['draft', 'rejected'], 'submit');
        requireOwner(order, context);
        const lines = await recomputeTotals(connection, id);
        if (lines.length === 0)
          throw new BusinessRuleError(
            'Add at least one line before submitting',
            'NO_LINES',
          );
        const refreshed = (await findRaw(id, connection)) ?? order;
        title = `${String(order.orderNo)} ${String(order.reason)}`;
        // Every purchase order is approved by the person its submitter
        // names; there is no switch to skip it (removed 2026-09-27).
        const approval = await approvals.request(
          {
            subjectType: 'purchaseOrder',
            subjectId: id,
            title,
            amount: Number(refreshed.estimatedTotal ?? 0),
            approverId,
          },
          context,
          connection,
        );
        asked = Array.isArray(approval.approverIds)
          ? (approval.approverIds as string[])
          : [];
        // `approvals.request` already wrote the event for this act.
        await setStatus(connection, order, 'pendingApproval', context, null);
      });
      // Only the person asked can act, so only telling them is the point.
      await notifier.notify({
        key: `purchaseOrder:${id}:submitted:${String(row.updatedAt)}`,
        to: asked,
        actorId: context.actorId,
        title: {
          key: 'notifications.approvalRequested',
          params: { title },
        },
        body: { key: 'notifications.approvalBody', params: {} },
        url: `/procurement/${id}`,
        source: { type: 'purchaseOrder', referenceId: id },
      });
      return row;
    },

    withdraw: (id, context, conditions) =>
      mutate(id, conditions, async (connection, order) => {
        requireStatus(order, ['pendingApproval'], 'withdraw');
        requireOwner(order, context);
        await approvals.withdraw('purchaseOrder', id, context, connection);
        await setStatus(connection, order, 'draft', context, null);
      }),

    async decide(id, decision, comment, context, conditions) {
      let ownerId = '';
      let title = '';
      const row = await mutate(id, conditions, async (connection, order) => {
        ownerId = asText(order.ownerId) ?? '';
        title = `${String(order.orderNo)} ${String(order.reason)}`;
        requireStatus(order, ['pendingApproval'], 'decide');
        const pending = (
          await approvals.forSubject('purchaseOrder', id, connection)
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
        await setStatus(
          connection,
          order,
          decision === 'approved' ? 'approved' : 'rejected',
          context,
          null,
        );
      });
      await notifier.notify({
        key: `purchaseOrder:${id}:${decision}:${String(row.updatedAt)}`,
        to: [ownerId],
        actorId: context.actorId,
        title: {
          key:
            decision === 'approved'
              ? 'notifications.approvalApproved'
              : 'notifications.approvalRejected',
          params: { title },
        },
        // The approver's own sentence, passed through as written.
        body: { text: comment ?? '' },
        url: `/procurement/${id}`,
        source: { type: 'purchaseOrder', referenceId: id },
      });
      return row;
    },

    markOrdered: (id, input, context, conditions) =>
      mutate(id, conditions, async (connection, order) => {
        requireStatus(order, ['approved'], 'order');
        await setStatus(
          connection,
          order,
          'ordered',
          context,
          'Order placed',
          {},
          {
            orderedAt: input.orderedAt ?? today(),
            expectedAt: input.expectedAt ?? null,
          },
        );
      }),

    receive: (id, input, context, conditions) =>
      mutate(id, conditions, async (connection, order) => {
        requireStatus(order, ['ordered', 'partiallyReceived'], 'receive');
        const line = await connection.query
          .selectFrom('purchaseOrderLines')
          .selectAll()
          .where('id', '=', input.lineId)
          .where('purchaseOrderId', '=', id)
          .executeTakeFirst<Row>();
        if (!line)
          throw new RecordNotFoundError('purchaseOrderLines', input.lineId);
        if (!Number.isInteger(input.quantity) || input.quantity < 1)
          throw new ValidationError(
            'quantity must be a positive integer',
            'quantity',
          );
        const remaining = Number(line.quantity) - Number(line.receivedQuantity);
        if (input.quantity > remaining)
          throw new BusinessRuleError(
            `Only ${remaining} left to receive on this line`,
            'OVER_RECEIPT',
          );
        const source: OperationContext = {
          ...context,
          sourceType: 'purchaseOrder',
          sourceId: id,
        };
        const generated: { type: string; id: string }[] = [];
        const itemType = String(line.itemType) as LineItemType;
        // `extra` answers the receipt dialog's own questions and nothing
        // else: it is spread over what the order settled, so a key beyond
        // them would rewrite the status, price, vendor or seat count.
        const allowed = RECEIVE_EXTRA[itemType];
        const stray = Object.keys(input.extra ?? {}).filter(
          (key) => !allowed.includes(key),
        );
        if (stray.length > 0)
          throw new ValidationError(
            `Not a receipt field: ${stray.join(', ')}`,
            'extra',
          );

        if (itemType === 'device') {
          const serials = (input.serialNos ?? []).map((serial) =>
            serial.trim(),
          );
          if (!input.locationId)
            throw new ValidationError(
              'locationId is required to receive devices',
              'locationId',
            );
          for (let index = 0; index < input.quantity; index += 1) {
            const device = await devices.createWithin(
              connection,
              {
                modelId: String(line.modelId),
                locationId: input.locationId,
                serialNo: serials[index] ?? null,
                // Receiving is the check: what arrived and was accepted is
                // in stock. There is no second confirmation step (the
                // 待入库 status went with it on 2026-09-26).
                status: 'inStock',
                purchaseOrderId: id,
                vendorId: order.vendorId ?? null,
                purchaseDate: order.orderedAt ?? today(),
                purchasePrice: line.unitPrice ?? null,
                currency: order.currency ?? null,
                // The order says which department asked for it; a line no
                // longer carries a target of its own.
                departmentId: order.departmentId ?? null,
                ...(input.extra ?? {}),
              },
              source,
            );
            generated.push({ type: 'device', id: String(device.id) });
          }
        } else if (
          itemType === 'accessory' ||
          itemType === 'consumable' ||
          itemType === 'component'
        ) {
          let stockItemId = input.stockItemId ?? null;
          if (stockItemId) {
            await stock.stockInWithin(
              connection,
              stockItemId,
              {
                quantity: input.quantity,
                purchaseOrderId: id,
                notes: input.notes,
              },
              source,
            );
          } else {
            if (!input.locationId)
              throw new ValidationError(
                'locationId is required to create a stock item',
                'locationId',
              );
            const model = await connection.query
              .selectFrom('models')
              .selectAll()
              .where('id', '=', String(line.modelId))
              .executeTakeFirst<Row>();
            if (!model) throw new ValidationError('Model not found', 'modelId');
            const item = await stock.createWithin(
              connection,
              {
                kind: itemType,
                name: String(input.extra?.name ?? model.name),
                categoryId: String(input.extra?.categoryId ?? model.categoryId),
                modelId: model.id,
                manufacturerId: model.manufacturerId,
                locationId: input.locationId,
                totalQuantity: input.quantity,
                // What the receiving form states about a new item: its
                // water level, a note, and who answers for it. Each is left
                // to the service's own default when it says nothing.
                ...(input.extra?.minimumQuantity !== undefined
                  ? { minimumQuantity: Number(input.extra.minimumQuantity) }
                  : {}),
                ...(input.extra?.notes === undefined
                  ? {}
                  : { notes: str(input.extra.notes) || null }),
                ...(str(input.extra?.ownerId)
                  ? { ownerId: str(input.extra?.ownerId) }
                  : {}),
              },
              source,
            );
            stockItemId = String(item.id);
          }
          generated.push({ type: 'stockItem', id: stockItemId });
        } else if (
          (itemType === 'perpetual' || itemType === 'subscription') &&
          input.entitlementId
        ) {
          // A further batch of an entitlement already on the books: seats
          // are added (a renewal may also move the expiry) and the receipt
          // is the purchase record.
          const existing = await connection.query
            .selectFrom('entitlements')
            .select(['id', 'kind', 'softwareProductId'])
            .where('id', '=', input.entitlementId)
            .executeTakeFirst<Row>();
          if (!existing)
            throw new ValidationError('Entitlement not found', 'entitlementId');
          if (
            existing.kind !== itemType ||
            existing.softwareProductId !== line.softwareProductId
          )
            throw new ValidationError(
              'The entitlement does not match the line',
              'entitlementId',
            );
          await entitlements.receiveWithin(
            connection,
            String(existing.id),
            {
              quantity: input.quantity,
              expiryDate: str(input.extra?.expiryDate) || null,
            },
            source,
          );
          generated.push({ type: 'entitlement', id: String(existing.id) });
        } else if (itemType === 'perpetual') {
          const entitlement = await entitlements.createWithin(
            connection,
            {
              kind: 'perpetual',
              softwareProductId: String(line.softwareProductId),
              name: str(input.extra?.name) || 'Entitlement',
              licensingModel: str(input.extra?.licensingModel) || 'perUser',
              seatCount: input.quantity,
              maintenanceExpiryDate: input.extra?.maintenanceExpiryDate ?? null,
              // When it was bought and in what money are the order's to
              // answer, not the receiver's: asking again only invites a
              // different answer.
              startDate: order.orderedAt ?? null,
              currency: order.currency ?? null,
              ...(input.extra ?? {}),
            },
            source,
          );
          generated.push({ type: 'entitlement', id: String(entitlement.id) });
        } else if (itemType === 'subscription') {
          const entitlement = await entitlements.createWithin(
            connection,
            {
              kind: 'subscription',
              softwareProductId: String(line.softwareProductId),
              name: str(input.extra?.name) || 'Subscription',
              billingModel: str(input.extra?.billingModel) || 'perSeat',
              seatCount: input.quantity,
              billingCycle: str(input.extra?.billingCycle) || 'year',
              unitPrice: line.unitPrice ?? null,
              currency: order.currency ?? null,
              // The first term starts when it arrives.
              startDate: str(input.extra?.startDate) || today(),
              expiryDate:
                str(input.extra?.expiryDate) || addMonths(today(), 12),
              ...(input.extra ?? {}),
            },
            source,
          );
          generated.push({ type: 'entitlement', id: String(entitlement.id) });
        }

        for (const record of generated.length > 0
          ? generated
          : [{ type: null, id: null }]) {
          await connection.query
            .insertInto('purchaseReceipts')
            .values({
              id: crypto.randomUUID(),
              purchaseOrderId: id,
              lineId: input.lineId,
              quantity: generated.length > 1 ? 1 : input.quantity,
              generatedType: record.type,
              generatedId: record.id,
              notes: input.notes ?? null,
              actorId: context.actorId,
              createdAt: new Date(),
            })
            .execute();
        }
        await connection.query
          .updateTable('purchaseOrderLines')
          .set({
            receivedQuantity: Number(line.receivedQuantity) + input.quantity,
            updatedAt: new Date(),
          })
          .where('id', '=', input.lineId)
          .execute();
        // What arrived, by the name a reader knows it by: its model or
        // software product.
        const itemName =
          (line.modelId
            ? asText(
                (
                  await connection.query
                    .selectFrom('models')
                    .select('name')
                    .where('id', '=', asText(line.modelId) ?? '')
                    .executeTakeFirst<{ name: string }>()
                )?.name,
              )
            : line.softwareProductId
              ? asText(
                  (
                    await connection.query
                      .selectFrom('softwareProducts')
                      .select('name')
                      .where('id', '=', asText(line.softwareProductId) ?? '')
                      .executeTakeFirst<{ name: string }>()
                  )?.name,
                )
              : undefined) ||
          // A stock line names the item it went into.
          asText(
            (
              await connection.query
                .selectFrom('stockItems')
                .select('name')
                .where(
                  'id',
                  '=',
                  String(
                    generated.find((entry) => entry.type === 'stockItem')?.id ??
                      '',
                  ),
                )
                .executeTakeFirst<{ name: string }>()
            )?.name,
          ) ||
          String(line.itemType);
        await history.record(
          {
            subjectType: 'purchaseOrders',
            subjectId: id,
            type: 'received',
            summary: `Received ${input.quantity} × ${itemName}`,
            payload: {
              lineId: input.lineId,
              quantity: input.quantity,
              targetLabel: itemName,
              generated,
            },
            ...context,
          },
          connection,
        );

        const lines = await connection.query
          .selectFrom('purchaseOrderLines')
          .select(['quantity', 'receivedQuantity', 'unitPrice'])
          .where('purchaseOrderId', '=', id)
          .execute<{
            quantity: number;
            receivedQuantity: number;
            unitPrice: unknown;
          }>();
        const complete = lines.every(
          (row) => Number(row.receivedQuantity) >= Number(row.quantity),
        );
        const current = (await findRaw(id, connection)) ?? order;
        if (complete) {
          await setStatus(
            connection,
            current,
            'completed',
            context,
            'All lines received',
            {},
            { receivedAt: today() },
          );
        } else if (current.status !== 'partiallyReceived') {
          await setStatus(
            connection,
            current,
            'partiallyReceived',
            context,
            'Partially received',
          );
        }
      }),

    cancel: (id, reason, context, conditions) =>
      mutate(id, conditions, async (connection, order) => {
        // Not `rejected`: that order is not waiting on anything, and its
        // owner's move is to fix it and ask again. Not for a draft either —
        // that one is deleted.
        requireStatus(
          order,
          ['draft', 'pendingApproval', 'approved', 'ordered'],
          'cancel',
        );
        if (!reason.trim())
          throw new ValidationError('A reason is required', 'reason');
        // Calling the order off is for the people it went through: the side
        // that raised it, and whoever was asked to decide or decided. A
        // draft has no approval, so it is its 负责人's alone.
        if (!raisedTheOrder(order, context)) {
          const trail = await approvals.forSubject(
            'purchaseOrder',
            id,
            connection,
          );
          const asked = trail.some(
            (entry) =>
              asText(entry.decidedById) === context.actorId ||
              (Array.isArray(entry.approverIds) &&
                (entry.approverIds as unknown[]).includes(context.actorId)),
          );
          if (!asked)
            throw new BusinessRuleError(
              'Only the owner or the approver can cancel this order',
              'NOT_INVOLVED',
            );
        }
        if (order.status === 'pendingApproval')
          await approvals
            .withdraw('purchaseOrder', id, context, connection)
            .catch(() => undefined);
        await setStatus(
          connection,
          order,
          'cancelled',
          context,
          `Cancelled: ${reason}`,
          { reason },
          { cancelReason: reason },
        );
      }),

    async receipts(id) {
      return (
        await database
          .query()
          .selectFrom('purchaseReceipts')
          .selectAll()
          .where('purchaseOrderId', '=', id)
          .orderBy('createdAt', 'desc')
          .execute<Row>()
      ).map((row) => decodeRow(row));
    },

    async generated(id) {
      const receipts = await database
        .query()
        .selectFrom('purchaseReceipts')
        .select(['generatedType', 'generatedId'])
        .where('purchaseOrderId', '=', id)
        .where('generatedId', 'is not', null)
        .execute<{ generatedType: string; generatedId: string }>();
      const unique = new Map(
        receipts.map((row) => [`${row.generatedType}:${row.generatedId}`, row]),
      );
      const rows = [...unique.values()];
      // What each record is, beyond its id: stock is three kinds with three
      // pages of their own (a reader sent to the accessory page for a
      // consumable is told the wrong thing), and every record names the
      // model or software product it is of.
      const idsOf = (type: string) =>
        rows
          .filter((row) => row.generatedType === type)
          .map((row) => row.generatedId);
      const kinds = new Map<string, string>();
      const models = new Map<string, string>();
      const products = new Map<string, string>();
      const stockIds = idsOf('stockItem');
      if (stockIds.length > 0)
        for (const item of await database
          .query()
          .selectFrom('stockItems')
          .select(['id', 'kind', 'modelId'])
          .where('id', 'in', stockIds)
          .execute<{ id: string; kind: string; modelId: string | null }>()) {
          kinds.set(item.id, item.kind);
          if (item.modelId) models.set(item.id, item.modelId);
        }
      const deviceIds = idsOf('device');
      if (deviceIds.length > 0)
        for (const device of await database
          .query()
          .selectFrom('devices')
          .select(['id', 'modelId'])
          .where('id', 'in', deviceIds)
          .execute<{ id: string; modelId: string | null }>())
          if (device.modelId) models.set(device.id, device.modelId);
      const entitlementIds = idsOf('entitlement');
      if (entitlementIds.length > 0)
        for (const entitlement of await database
          .query()
          .selectFrom('entitlements')
          .select(['id', 'softwareProductId'])
          .where('id', 'in', entitlementIds)
          .execute<{ id: string; softwareProductId: string | null }>())
          if (entitlement.softwareProductId)
            products.set(entitlement.id, entitlement.softwareProductId);
      return rows.map((row) => ({
        type: row.generatedType,
        id: row.generatedId,
        ...(kinds.has(row.generatedId)
          ? { kind: kinds.get(row.generatedId) }
          : {}),
        ...(models.has(row.generatedId)
          ? { modelId: models.get(row.generatedId) }
          : {}),
        ...(products.has(row.generatedId)
          ? { softwareProductId: products.get(row.generatedId) }
          : {}),
      }));
    },
  };
}
