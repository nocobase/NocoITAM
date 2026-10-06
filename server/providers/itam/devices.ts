import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  assertInputFields,
  compileAuthzScope,
  outputFields,
  pickFields,
  unrestricted,
} from './authz-filter.js';
import {
  IN_USE_STATUSES,
  OPERATION_FROM,
  RETURN_TARGETS,
  type DeviceOperation,
  type DeviceStatus,
  type AssigneeType,
  type ReservationType,
} from './device-status.js';
import {
  countCollection,
  decodeRow,
  listCollection,
  type ExtraWhere,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { DEVICES_COLLECTION } from './collections.js';
import {
  BusinessRuleError,
  DeleteBlockedError,
  DuplicateValueError,
  RecordNotFoundError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import { addMonths, isoDate, today } from './dates.js';
import type { HistoryService, HistorySource } from './history.js';
import type { NumberingService } from './numbering.js';
import type { SettingsService } from './settings.js';

/**
 * Individually tracked devices: creation with category / model defaults, the
 * lifecycle operations of the state machine, and the statistics the device
 * page shows. Every operation runs in one transaction that also records the
 * allocation event and the history entry.
 */
export interface DeviceInput extends Row {
  readonly modelId?: string;
  readonly deviceNo?: string | null;
  readonly serialNo?: string | null;
  readonly name?: string | null;
  readonly locationId?: string;
  readonly ownership?: string;
  readonly status?: string;
}

export interface AssignInput {
  readonly targetType: AssigneeType;
  readonly targetId: string;
  /** Where the device will be; derived from the target when omitted. */
  readonly locationId?: string | null;
}

export interface LoanInput extends AssignInput {
  readonly expectedReturnDate: string;
}

export interface ReturnInput {
  readonly nextStatus?: DeviceStatus;
  /** Where the returned device is put; unchanged when omitted. */
  readonly locationId?: string;
  /** What state it came back in; kept on the allocation record. */
  readonly condition?: string;
}

export interface ReserveInput {
  readonly reservedForType: ReservationType;
  readonly reservedForId: string;
  readonly reservedUntil: string;
}

export interface CorrectStatusInput {
  readonly status: DeviceStatus;
  readonly reason: string;
}

export interface BatchCreateInput {
  readonly modelId: string;
  readonly locationId: string;
  readonly quantity: number;
  readonly serialNos?: readonly string[];
  readonly common?: Row;
}

export const COUNT_FIELDS = [
  'locationId',
  'departmentId',
  'categoryId',
  'modelId',
  'status',
  'manufacturerId',
] as const;
export type CountField = (typeof COUNT_FIELDS)[number];

export interface DeviceStats {
  readonly total: number;
  readonly available: number;
  readonly availableIdle: number;
  readonly reserved: number;
  readonly warrantyExpiring: number;
  readonly warrantyExpired: number;
  readonly auditOverdue: number;
  readonly inRepair: number;
  readonly createdThisMonth: number;
  readonly disposedThisMonth: number;
  readonly thresholds: {
    readonly idleDays: number;
    readonly warrantyDays: number;
    readonly auditDays: number;
  };
}

export interface OperationContext extends HistorySource {
  readonly actorId: string;
}

export interface DeviceService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  stats(conditions: DatabaseAuthorizationConditions): Promise<DeviceStats>;
  /** Non-disposed device counts grouped by one field, under the caller's record filter. */
  countsBy(
    field: CountField,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Readonly<Record<string, number>>>;
  create(
    input: DeviceInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Creates inside a caller-owned transaction (receiving a purchase order); the caller authorized. */
  createWithin(
    connection: DatabaseConnection,
    input: DeviceInput,
    context: OperationContext,
  ): Promise<Row>;
  batchCreate(
    input: BatchCreateInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<readonly Row[]>;
  update(
    id: string,
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row>;
  deleteImpact(id: string): Promise<DeleteImpact>;
  delete(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<void>;
  assign(
    id: string,
    input: AssignInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  loan(
    id: string,
    input: LoanInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  return(
    id: string,
    input: ReturnInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  transfer(
    id: string,
    input: AssignInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row>;
  reserve(
    id: string,
    input: ReserveInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  unreserve(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  markLost(
    id: string,
    notes: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row>;
  restore(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  retire(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  reactivate(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  correctStatus(
    id: string,
    input: CorrectStatusInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row>;
  /** Lifecycle transitions other services drive (repairs, disposals, receiving). */
  transition(
    id: string,
    operation: LifecycleTransition,
    context: OperationContext,
    connection?: DatabaseConnection,
    options?: { readonly summary?: string; readonly payload?: Row },
  ): Promise<Row>;
  /** Assigns inside a caller-owned transaction (another service's step). */
  assignWithin(
    connection: DatabaseConnection,
    id: string,
    input: AssignInput,
    context: OperationContext,
  ): Promise<Row>;
  /** Loans inside a caller-owned transaction (a repair loaner). */
  loanWithin(
    connection: DatabaseConnection,
    id: string,
    input: LoanInput,
    context: OperationContext,
  ): Promise<Row>;
  /** Returns inside a caller-owned transaction. */
  returnWithin(
    connection: DatabaseConnection,
    id: string,
    input: ReturnInput,
    context: OperationContext,
  ): Promise<Row>;
  /** Releases reservations whose deadline has passed; returns the released ids. */
  releaseExpiredReservations(today: string): Promise<readonly string[]>;
  /** Recomputes straight-line depreciation for every depreciating device. */
  recomputeDepreciation(asOf: Date): Promise<number>;
}

export const deviceServiceToken: ServiceToken<DeviceService> =
  createServiceToken<DeviceService>('itam/device-service');

/**
 * Transitions driven by other domains. `repairDone` returns the device to
 * whoever still holds it (in use / on loan) or to stock; `markPendingDisposal`
 * ends any holding; `dispose` is the terminal, read-only state.
 */
export type LifecycleTransition =
  'sendToRepair' | 'repairDone' | 'markPendingDisposal' | 'dispose';

const JSON_FIELDS = ['attributes'] as const;
const decode = (row: Row): Row => decodeRow(row, { jsonFields: JSON_FIELDS });

/** Fields only the lifecycle operations may change. */
const LIFECYCLE_FIELDS = new Set([
  'status',
  'assigneeType',
  'assigneeId',
  'assignedAt',
  'expectedReturnDate',
  'reservedForType',
  'reservedForId',
  'reservedUntil',
  'bookValue',
  'depreciatedAmount',
  'lastAuditedAt',
  'deviceNo',
  'categoryId',
  'manufacturerId',
  // Written by receiving an order only.
  'purchaseOrderId',
]);

/** What the purchase order decides for a device that came in through one. */
const ORDER_FIELDS = ['vendorId', 'purchasePrice', 'purchaseDate', 'currency'];

const TRANSITION_SUMMARIES: Readonly<Record<LifecycleTransition, string>> = {
  sendToRepair: 'Sent to repair',
  repairDone: 'Back from repair',
  markPendingDisposal: 'Marked pending disposal',
  dispose: 'Disposed',
};

/**
 * The dates a purchase date implies: the warranty end from the model's
 * (else category's) warranty months, and the planned replacement from the
 * category's replacement cycle; null when either input is missing.
 */
function impliedDates(
  purchaseDate: unknown,
  model: Row,
  category: Row,
): { warrantyEndDate: string | null; plannedReplacementDate: string | null } {
  const date = typeof purchaseDate === 'string' ? purchaseDate : null;
  const warrantyMonths = Number(
    model.warrantyMonths ?? category.warrantyMonths ?? 0,
  );
  const replacementMonths = Number(category.replacementMonths ?? 0);
  return {
    warrantyEndDate:
      date && warrantyMonths > 0 ? addMonths(date, warrantyMonths) : null,
    plannedReplacementDate:
      date && replacementMonths > 0 ? addMonths(date, replacementMonths) : null,
  };
}

/** Straight-line depreciation needs a useful life to compute anything. */
function assertDepreciation(record: Readonly<Record<string, unknown>>): void {
  if (record.depreciationMethod !== 'straightLine') return;
  const life = Number(record.usefulLifeMonths);
  if (!Number.isFinite(life) || life <= 0) {
    throw new ValidationError(
      'usefulLifeMonths is required for straight-line depreciation',
      'usefulLifeMonths',
    );
  }
}

function monthsBetween(from: string, to: Date): number {
  const [year, month] = from.split('-').map(Number);
  return Math.max(
    0,
    (to.getUTCFullYear() - (year ?? to.getUTCFullYear())) * 12 +
      (to.getUTCMonth() + 1 - (month ?? to.getUTCMonth() + 1)),
  );
}

/** Straight-line book value; `undefined` when the device does not depreciate. */
export function computeBookValue(
  device: {
    readonly depreciationMethod: unknown;
    readonly purchasePrice: unknown;
    readonly purchaseDate: unknown;
    readonly usefulLifeMonths: unknown;
    readonly residualRate: unknown;
  },
  asOf: Date,
): { bookValue: number; depreciatedAmount: number } | undefined {
  if (device.depreciationMethod !== 'straightLine') return undefined;
  const price = Number(device.purchasePrice);
  const life = Number(device.usefulLifeMonths);
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(life) ||
    life <= 0 ||
    typeof device.purchaseDate !== 'string'
  ) {
    return undefined;
  }
  const residual =
    price * Math.min(1, Math.max(0, Number(device.residualRate) || 0));
  const elapsed = Math.min(life, monthsBetween(device.purchaseDate, asOf));
  const depreciated = ((price - residual) * elapsed) / life;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    bookValue: round(price - depreciated),
    depreciatedAmount: round(depreciated),
  };
}

export function createDeviceService(
  database: DatabaseManager,
  history: HistoryService,
  numbering: NumberingService,
  settings: SettingsService,
): DeviceService {
  const definition = DEVICES_COLLECTION;

  const findRaw = async (
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    return row ? decode(row) : undefined;
  };

  /** Loads the device under the caller's record filter; 404 when it is out of scope. */
  const load = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', id)
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError('devices', id);
    return decode(row);
  };

  const shape = (row: Row, conditions: DatabaseAuthorizationConditions): Row =>
    pickFields(row, outputFields(definition.fields, conditions));

  const requireStatus = (device: Row, operation: DeviceOperation) => {
    const allowed = OPERATION_FROM[operation];
    if (!allowed.includes(device.status as DeviceStatus)) {
      throw new BusinessRuleError(
        `Operation "${operation}" is not allowed from status "${String(device.status)}"`,
        'INVALID_STATUS',
      );
    }
  };

  const assertTarget = async (
    connection: DatabaseConnection,
    targetType: AssigneeType,
    targetId: string,
    deviceId: string,
  ): Promise<Row> => {
    const table =
      targetType === 'person'
        ? 'people'
        : targetType === 'location'
          ? 'locations'
          : 'devices';
    if (targetType === 'device' && targetId === deviceId) {
      throw new ValidationError(
        'A device cannot be assigned to itself',
        'targetId',
      );
    }
    const target = await connection.query
      .selectFrom(table)
      .selectAll()
      .where('id', '=', targetId)
      .executeTakeFirst<Row>();
    if (!target)
      throw new ValidationError(`${targetType} not found`, 'targetId');
    if (targetType === 'person' && target.employmentStatus === 'left') {
      throw new BusinessRuleError(
        'Cannot assign to a person who has left',
        'PERSON_LEFT',
      );
    }
    return target;
  };

  const write = async (
    connection: DatabaseConnection,
    id: string,
    values: Row,
  ): Promise<void> => {
    await connection.query
      .updateTable('devices')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  };

  const statusChange = async (
    connection: DatabaseConnection,
    device: Row,
    next: DeviceStatus,
    context: OperationContext,
    summary: string,
    payload: Record<string, unknown> = {},
    // The change log always gets the field change; the history timeline
    // gets an event only when no business event of its own says it
    // (assign / return / repair events already imply the status).
    event = true,
  ) => {
    if (device.status === next) return;
    await history.log(
      {
        subjectType: 'devices',
        subjectId: String(device.id),
        action: 'statusChange',
        field: 'status',
        oldValue: device.status,
        newValue: next,
        ...context,
      },
      connection,
    );
    if (!event) return;
    await history.record(
      {
        subjectType: 'devices',
        subjectId: String(device.id),
        type: 'statusChange',
        summary,
        payload: {
          from: device.status,
          to: next,
          // Changed because an audit said so: the event names the audit and
          // links to it, the way a disposal's does.
          ...(context.sourceType === 'auditTask' && context.sourceId
            ? {
                auditTaskId: context.sourceId,
                targetLabel: context.sourceLabel,
              }
            : {}),
          ...payload,
        },
        ...context,
      },
      connection,
    );
  };

  const closeActiveAllocation = async (
    connection: DatabaseConnection,
    deviceId: string,
  ) => {
    await connection.query
      .updateTable('allocations')
      .set({ endedAt: new Date() })
      .where('subjectType', '=', 'device')
      .where('subjectId', '=', deviceId)
      .where('endedAt', 'is', null)
      .execute();
  };

  const openAllocation = async (
    connection: DatabaseConnection,
    device: Row,
    action: 'assign' | 'loan' | 'transfer',
    input: AssignInput & { expectedReturnDate?: string },
    context: OperationContext,
  ): Promise<string> => {
    const id = crypto.randomUUID();
    await connection.query
      .insertInto('allocations')
      .values({
        id,
        subjectType: 'device',
        subjectId: device.id,
        action,
        targetType: input.targetType,
        targetId: input.targetId,
        previousTargetType: device.assigneeType ?? null,
        previousTargetId: device.assigneeId ?? null,
        quantity: 1,
        expectedReturnDate: input.expectedReturnDate ?? null,
        notes: null,
        sourceType: context.sourceType ?? null,
        sourceId: context.sourceId ?? null,
        actorId: context.actorId,
        createdAt: new Date(),
        endedAt: null,
      })
      .execute();
    return id;
  };

  const targetLabel = (target: Row, targetType: AssigneeType): string =>
    targetType === 'device'
      ? `${String(target.deviceNo)} / ${String(target.name)}`
      : String(target.name);

  /** The name of a current holder, for the record; the id when it is gone. */
  const labelOfTarget = async (
    connection: DatabaseConnection,
    targetType: AssigneeType,
    targetId: string,
  ): Promise<string> => {
    const table =
      targetType === 'person'
        ? 'people'
        : targetType === 'location'
          ? 'locations'
          : 'devices';
    const row = await connection.query
      .selectFrom(table)
      .selectAll()
      .where('id', '=', targetId)
      .executeTakeFirst<Row>();
    return row ? targetLabel(row, targetType) : targetId;
  };

  const reservedLabel = (
    connection: DatabaseConnection,
    device: Row,
  ): Promise<string> =>
    typeof device.reservedForType === 'string' &&
    typeof device.reservedForId === 'string'
      ? labelOfTarget(
          connection,
          device.reservedForType as AssigneeType,
          device.reservedForId,
        )
      : Promise.resolve('');

  const departmentOf = (
    target: Row,
    targetType: AssigneeType,
    fallback: unknown,
  ): unknown =>
    targetType === 'person' ? (target.departmentId ?? fallback) : fallback;

  /**
   * Where the device now is, as far as the assignment tells: a person's
   * office, the location itself, or the holding device's location. Kept
   * editable for the exceptions (travel, a lend-out).
   */
  const locationOf = (
    target: Row,
    targetType: AssigneeType,
    fallback: unknown,
  ): unknown => {
    if (targetType === 'location') return target.id;
    const known = target.locationId;
    return typeof known === 'string' && known ? known : fallback;
  };

  const assignInternal = async (
    connection: DatabaseConnection,
    device: Row,
    input: AssignInput & { expectedReturnDate?: string },
    context: OperationContext,
    mode: 'assign' | 'loan' | 'transfer',
  ): Promise<void> => {
    const target = await assertTarget(
      connection,
      input.targetType,
      input.targetId,
      String(device.id),
    );
    if (mode === 'transfer')
      await closeActiveAllocation(connection, String(device.id));
    await openAllocation(connection, device, mode, input, context);
    const nextStatus: DeviceStatus = mode === 'loan' ? 'onLoan' : 'inUse';
    await write(connection, String(device.id), {
      status: nextStatus,
      assigneeType: input.targetType,
      assigneeId: input.targetId,
      assignedAt: new Date(),
      expectedReturnDate: input.expectedReturnDate ?? null,
      reservedForType: null,
      reservedForId: null,
      reservedUntil: null,
      departmentId: departmentOf(target, input.targetType, device.departmentId),
      locationId:
        input.locationId ??
        locationOf(target, input.targetType, device.locationId),
    });
    const label = targetLabel(target, input.targetType);
    const previousLabel =
      mode === 'transfer' &&
      typeof device.assigneeType === 'string' &&
      typeof device.assigneeId === 'string'
        ? await labelOfTarget(
            connection,
            device.assigneeType as AssigneeType,
            device.assigneeId,
          )
        : '';
    await history.record(
      {
        subjectType: 'devices',
        subjectId: String(device.id),
        type: mode,
        summary:
          mode === 'loan'
            ? `Loaned to ${label}, due ${input.expectedReturnDate ?? ''}`
            : mode === 'transfer'
              ? `Transferred from ${previousLabel} to ${label}`
              : `Assigned to ${label}`,
        payload: {
          targetType: input.targetType,
          targetId: input.targetId,
          targetLabel: label,
          previousTargetType: device.assigneeType,
          previousTargetId: device.assigneeId,
          previousTargetLabel: previousLabel,
          expectedReturnDate: input.expectedReturnDate,
        },
        ...context,
      },
      connection,
    );
    await statusChange(
      connection,
      device,
      nextStatus,
      context,
      `Status changed to ${nextStatus}`,
      {},
      false,
    );
  };

  // With `within`, runs inside the caller's transaction (another service's
  // operation) instead of opening its own.
  const loanOp = (
    id: string,
    input: LoanInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    within?: DatabaseConnection,
  ) =>
    mutate(
      id,
      conditions,
      'loan',
      async (connection, device) => {
        if (!input.expectedReturnDate) {
          throw new ValidationError(
            'expectedReturnDate is required for a loan',
            'expectedReturnDate',
          );
        }
        if (input.expectedReturnDate < today())
          throw new ValidationError(
            'expectedReturnDate must not be in the past',
            'expectedReturnDate',
          );
        if (device.reservedForId)
          throw new BusinessRuleError('Device is reserved', 'RESERVED');
        await assignInternal(connection, device, input, context, 'loan');
      },
      within,
    );

  const mutate = async (
    id: string,
    conditions: DatabaseAuthorizationConditions,
    operation: DeviceOperation | undefined,
    fn: (connection: DatabaseConnection, device: Row) => Promise<void>,
    within?: DatabaseConnection,
  ): Promise<Row> => {
    const run = async (connection: DatabaseConnection) => {
      const device = await load(id, conditions, connection);
      if (operation) requireStatus(device, operation);
      await fn(connection, device);
    };
    if (within) await run(within);
    else await database.transaction(run);
    const after = await findRaw(id, within);
    return shape(after ?? {}, conditions);
  };

  const buildCreateValues = async (
    connection: DatabaseConnection,
    input: DeviceInput,
    context: OperationContext,
  ): Promise<Row> => {
    if (!input.modelId)
      throw new ValidationError('modelId is required', 'modelId');
    if (!input.locationId)
      throw new ValidationError('locationId is required', 'locationId');
    const model = await connection.query
      .selectFrom('models')
      .selectAll()
      .where('id', '=', input.modelId)
      .executeTakeFirst<Row>();
    if (!model) throw new ValidationError('Model not found', 'modelId');
    const category = await connection.query
      .selectFrom('categories')
      .selectAll()
      .where('id', '=', String(model.categoryId))
      .executeTakeFirst<Row>();
    if (!category)
      throw new ValidationError('Model has no category', 'modelId');
    if (category.appliesTo !== 'device') {
      throw new ValidationError('The model is not a device model', 'modelId');
    }
    const location = await connection.query
      .selectFrom('locations')
      .select('id')
      .where('id', '=', input.locationId)
      .executeTakeFirst();
    if (!location)
      throw new ValidationError('Location not found', 'locationId');

    const serialNo =
      typeof input.serialNo === 'string' && input.serialNo.trim()
        ? input.serialNo.trim()
        : null;
    if (Boolean(category.requiresSerial) && !serialNo) {
      throw new ValidationError(
        'This category requires a serial number',
        'serialNo',
      );
    }
    if (serialNo) {
      const duplicate = await connection.query
        .selectFrom('devices')
        .select('id')
        .where('serialNo', '=', serialNo)
        .where('manufacturerId', '=', String(model.manufacturerId))
        .executeTakeFirst();
      if (duplicate) throw new DuplicateValueError('serialNo', serialNo);
    }
    const ownership = input.ownership ?? 'owned';
    if (
      (ownership === 'leased' || ownership === 'borrowed') &&
      (!input.lenderVendorId || !input.returnDueDate)
    ) {
      throw new ValidationError(
        'Leased and borrowed devices need a lender and a return date',
        'lenderVendorId',
      );
    }

    let deviceNo =
      typeof input.deviceNo === 'string' && input.deviceNo.trim()
        ? input.deviceNo.trim()
        : undefined;
    if (deviceNo) {
      const duplicate = await connection.query
        .selectFrom('devices')
        .select('id')
        .where('deviceNo', '=', deviceNo)
        .executeTakeFirst();
      if (duplicate) throw new DuplicateValueError('deviceNo', deviceNo);
    } else {
      deviceNo = await numbering.next('device', { connection });
    }

    const implied = impliedDates(input.purchaseDate, model, category);
    // Only what the company owns is on its books: leased, borrowed and
    // employee-owned devices never depreciate.
    const depreciationMethod =
      ownership === 'byod' || ownership === 'leased' || ownership === 'borrowed'
        ? 'none'
        : typeof input.depreciationMethod === 'string'
          ? input.depreciationMethod
          : ((category.depreciationMethod as string | null) ?? 'none');
    const now = new Date();
    // A new device starts with its model's extended fields (2026-10-06):
    // what was filled on the model is copied, what the caller states wins,
    // and from then on the two are edited separately — a device whose
    // memory was upgraded later does not change its model, nor the other way
    // round.
    const modelAttributes = jsonObject(model.attributes);
    const ownAttributes = jsonObject(input.attributes);
    const attributes =
      Object.keys(modelAttributes).length > 0
        ? { ...modelAttributes, ...ownAttributes }
        : (input.attributes ?? null);
    const values: Record<string, unknown> = {
      ...input,
      attributes,
      id: crypto.randomUUID(),
      deviceNo,
      serialNo,
      name:
        typeof input.name === 'string' && input.name.trim()
          ? input.name.trim()
          : model.name,
      modelId: model.id,
      categoryId: category.id,
      manufacturerId: model.manufacturerId,
      // A device enters the register in stock; receiving a purchase order
      // is the check, so there is no state before it (2026-09-26).
      status: 'inStock',
      ownership,
      assigneeType: null,
      assigneeId: null,
      assignedAt: null,
      reservedForType: null,
      reservedForId: null,
      reservedUntil: null,
      depreciationMethod,
      usefulLifeMonths:
        input.usefulLifeMonths ?? category.usefulLifeMonths ?? null,
      residualRate: input.residualRate ?? category.residualRate ?? null,
      warrantyEndDate: input.warrantyEndDate ?? implied.warrantyEndDate,
      // Always the rule's value: purchase date + the category's cycle.
      plannedReplacementDate: implied.plannedReplacementDate,
      currency:
        input.currency ?? (await settings.get('general', connection)).currency,
      ownerId: input.ownerId ?? context.actorId,
      createdById: context.actorId,
      createdAt: now,
      updatedAt: now,
    };
    assertDepreciation(values);
    const depreciation = computeBookValue(values as never, now);
    values.bookValue = depreciation?.bookValue ?? null;
    values.depreciatedAmount = depreciation?.depreciatedAmount ?? null;
    return values;
  };

  const insert = async (
    connection: DatabaseConnection,
    values: Row,
    context: OperationContext,
  ) => {
    await connection.query.insertInto('devices').values(values).execute();
    // One line: the event says it was created and in which status. A bare
    // "create" change-log row beside it read as a second, emptier 创建 —
    // and as a folded "1 field" when the two did merge.
    await history.record(
      {
        subjectType: 'devices',
        subjectId: String(values.id),
        type: 'created',
        summary: `Created as ${String(values.status)}`,
        payload: { to: values.status },
        ...context,
      },
      connection,
    );
  };

  /**
   * Named views behind the statistic cards. Each is the same predicate the
   * matching count uses, so clicking a card lists exactly what it counted.
   */
  const viewWhere = async (
    view: string | undefined,
  ): Promise<{ filter: ListOptions['filter']; extra?: ExtraWhere }> => {
    if (!view) return { filter: {} };
    const thresholds = await settings.get('thresholds');
    const today = new Date();
    const day = isoDate(today);
    const idleBefore = new Date(
      today.getTime() - thresholds.idleDays * 86_400_000,
    );
    const warrantyLimit = isoDate(
      new Date(today.getTime() + thresholds.warrantyDays * 86_400_000),
    );
    const auditBefore = new Date(
      today.getTime() - thresholds.auditDays * 86_400_000,
    );
    const monthStart = new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`);
    switch (view) {
      case 'available':
        return { filter: { status: 'inStock', 'reservedForId:null': 'true' } };
      case 'idle':
        return {
          filter: {
            status: 'inStock',
            'reservedForId:null': 'true',
            'updatedAt:lte': idleBefore,
          },
        };
      case 'reserved':
        return { filter: { status: 'inStock', 'reservedForId:null': 'false' } };
      case 'warrantyExpiring':
        return {
          filter: {
            status: IN_USE_STATUSES,
            'warrantyEndDate:gte': day,
            'warrantyEndDate:lte': warrantyLimit,
          },
        };
      case 'warrantyExpired':
        return {
          filter: { status: IN_USE_STATUSES, 'warrantyEndDate:lt': day },
        };
      case 'auditOverdue':
        return {
          filter: {},
          extra: (query) =>
            query
              .where('status', '!=', 'disposed')
              .where((eb) =>
                eb.or([
                  eb('lastAuditedAt', 'is', null),
                  eb('lastAuditedAt', '<', auditBefore),
                ]),
              ),
        };
      case 'inRepair':
        return { filter: { status: 'inRepair' } };
      case 'createdThisMonth':
        return { filter: { 'createdAt:gte': monthStart } };
      case 'disposedThisMonth':
        return { filter: { status: 'disposed', 'updatedAt:gte': monthStart } };
      default:
        throw new ValidationError(`Unknown view: ${view}`, 'view');
    }
  };

  const assignOp = (
    id: string,
    input: AssignInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    within?: DatabaseConnection,
  ): Promise<Row> =>
    mutate(
      id,
      conditions,
      'assign',
      async (connection, device) => {
        // A reserved device goes only to the target it is reserved for.
        if (
          device.reservedForId &&
          !(
            device.reservedForType === input.targetType &&
            device.reservedForId === input.targetId
          )
        ) {
          throw new BusinessRuleError(
            'Device is reserved for someone else',
            'RESERVED',
          );
        }
        await assignInternal(connection, device, input, context, 'assign');
      },
      within,
    );

  const returnOp = (
    id: string,
    input: ReturnInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    within?: DatabaseConnection,
  ): Promise<Row> =>
    mutate(
      id,
      conditions,
      'return',
      async (connection, device) => {
        const nextStatus = input.nextStatus ?? 'inStock';
        if (!RETURN_TARGETS.includes(nextStatus)) {
          throw new ValidationError(
            'Invalid status after return',
            'nextStatus',
          );
        }
        await closeActiveAllocation(connection, id);
        await connection.query
          .insertInto('allocations')
          .values({
            id: crypto.randomUUID(),
            subjectType: 'device',
            subjectId: id,
            action: 'return',
            targetType: null,
            targetId: null,
            previousTargetType: device.assigneeType ?? null,
            previousTargetId: device.assigneeId ?? null,
            quantity: 1,
            expectedReturnDate: null,
            notes: input.condition ?? null,
            sourceType: context.sourceType ?? null,
            sourceId: context.sourceId ?? null,
            actorId: context.actorId,
            createdAt: new Date(),
            endedAt: new Date(),
          })
          .execute();
        await write(connection, id, {
          status: nextStatus,
          assigneeType: null,
          assigneeId: null,
          assignedAt: null,
          expectedReturnDate: null,
          // Back in stock it belongs to no department until assigned again.
          departmentId: null,
          ...(input.locationId ? { locationId: input.locationId } : {}),
        });
        await history.record(
          {
            subjectType: 'devices',
            subjectId: id,
            type: 'return',
            summary: `Returned, status set to ${nextStatus}`,
            payload: {
              previousTargetType: device.assigneeType,
              previousTargetId: device.assigneeId,
              previousTargetLabel:
                typeof device.assigneeType === 'string' &&
                typeof device.assigneeId === 'string'
                  ? await labelOfTarget(
                      connection,
                      device.assigneeType as AssigneeType,
                      device.assigneeId,
                    )
                  : '',
              condition: input.condition,
              nextStatus,
            },
            ...context,
          },
          connection,
        );
        await statusChange(
          connection,
          device,
          nextStatus,
          context,
          `Status changed to ${nextStatus}`,
          {},
          false,
        );
      },
      within,
    );

  return {
    async list(options, conditions) {
      const { view, ...rest } = options.filter ?? {};
      const named = await viewWhere(
        typeof view === 'string' ? view : undefined,
      );
      return listCollection(
        database,
        definition,
        { ...options, filter: { ...rest, ...named.filter } },
        conditions,
        { jsonFields: JSON_FIELDS },
        named.extra,
      );
    },

    async get(id, conditions) {
      const row = await database
        .query()
        .selectFrom('devices')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      return row ? shape(decode(row), conditions) : undefined;
    },

    async countsBy(field, conditions) {
      const rows = await database
        .query()
        .selectFrom('devices')
        .select((eb) => [field, eb.fn.countAll().as('total')])
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .where('status', '!=', 'disposed')
        .groupBy(field)
        .execute<Record<string, unknown>>();
      return Object.fromEntries(
        rows
          .filter((row) => row[field] !== null && row[field] !== undefined)
          .map((row) => [String(row[field]), Number(row.total)]),
      );
    },

    async stats(conditions) {
      const thresholds = await settings.get('thresholds');
      const count = (filter: ListOptions['filter'], extra?: ExtraWhere) =>
        countCollection(database, definition, filter, conditions, extra);
      const view = async (name: string) => {
        const named = await viewWhere(name);
        return count(named.filter, named.extra);
      };
      const [
        total,
        available,
        availableIdle,
        reserved,
        warrantyExpiring,
        warrantyExpired,
        auditOverdue,
        inRepair,
        createdThisMonth,
        disposedThisMonth,
      ] = await Promise.all([
        count({}).then(
          async (all) => all - (await count({ status: 'disposed' })),
        ),
        view('available'),
        view('idle'),
        view('reserved'),
        view('warrantyExpiring'),
        view('warrantyExpired'),
        view('auditOverdue'),
        view('inRepair'),
        view('createdThisMonth'),
        view('disposedThisMonth'),
      ]);
      return {
        total,
        available,
        availableIdle,
        reserved,
        warrantyExpiring,
        warrantyExpired,
        auditOverdue,
        inRepair,
        createdThisMonth,
        disposedThisMonth,
        thresholds: {
          idleDays: thresholds.idleDays,
          warrantyDays: thresholds.warrantyDays,
          auditDays: thresholds.auditDays,
        },
      };
    },

    async createWithin(connection, input, context) {
      const values = await buildCreateValues(connection, input, context);
      await insert(connection, values, context);
      return decode(values);
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      let id = '';
      await database.transaction(async (connection) => {
        const values = await buildCreateValues(connection, input, context);
        id = String(values.id);
        await insert(connection, values, context);
      });
      const created = await findRaw(id);
      return shape(created ?? {}, conditions);
    },

    async batchCreate(input, context, conditions) {
      if (
        !Number.isInteger(input.quantity) ||
        input.quantity < 1 ||
        input.quantity > 500
      ) {
        throw new ValidationError(
          'quantity must be between 1 and 500',
          'quantity',
        );
      }
      const serials = (input.serialNos ?? []).map((serial) => serial.trim());
      if (
        new Set(serials.filter(Boolean)).size !== serials.filter(Boolean).length
      ) {
        throw new ValidationError(
          'Duplicate serial numbers in the batch',
          'serialNos',
        );
      }
      const common: Row = {
        ...(input.common ?? {}),
        modelId: input.modelId,
        locationId: input.locationId,
      };
      assertInputFields(common, conditions.fieldAccess?.input ?? '*');
      const ids: string[] = [];
      await database.transaction(async (connection) => {
        for (let index = 0; index < input.quantity; index += 1) {
          const values = await buildCreateValues(
            connection,
            { ...common, serialNo: serials[index] ?? null },
            context,
          );
          ids.push(String(values.id));
          await insert(connection, values, context);
        }
      });
      const rows = await database
        .query()
        .selectFrom('devices')
        .selectAll()
        .where('id', 'in', ids)
        .orderBy('deviceNo', 'asc')
        .execute<Row>();
      return rows.map((row) => shape(decode(row), conditions));
    },

    async update(id, input, context, conditions, within) {
      const lifecycle = Object.keys(input).filter((field) =>
        LIFECYCLE_FIELDS.has(field),
      );
      if (lifecycle.length > 0) {
        throw new ValidationError(
          `Fields change only through operations: ${lifecycle.join(', ')}`,
          lifecycle[0],
        );
      }
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      return mutate(
        id,
        conditions,
        undefined,
        async (connection, device) => {
          if (device.status === 'disposed') {
            throw new BusinessRuleError(
              'A disposed device is read-only',
              'DISPOSED_READ_ONLY',
            );
          }
          const values: Record<string, unknown> = { ...input };
          if (device.purchaseOrderId) {
            const ordered = ORDER_FIELDS.filter((field) => field in input);
            if (ordered.length > 0)
              throw new ValidationError(
                'Purchase details follow the purchase order',
                ordered[0],
              );
          }
          // Only what the company owns depreciates: becoming leased,
          // borrowed or employee-owned ends depreciation, and none of the
          // three may switch it back on.
          const ownership = String(values.ownership ?? device.ownership);
          if (
            ownership === 'leased' ||
            ownership === 'borrowed' ||
            ownership === 'byod'
          ) {
            if (
              typeof input.depreciationMethod === 'string' &&
              input.depreciationMethod !== 'none'
            )
              throw new ValidationError(
                'Leased, borrowed and employee-owned devices do not depreciate',
                'depreciationMethod',
              );
            if (device.depreciationMethod !== 'none')
              Object.assign(values, {
                depreciationMethod: 'none',
                bookValue: null,
                depreciatedAmount: null,
              });
          }
          // Switching to straight-line may precede filling in the life; only
          // an explicit empty life is refused.
          if ('usefulLifeMonths' in input)
            assertDepreciation({ ...device, ...values });
          if (
            typeof input.modelId === 'string' &&
            input.modelId !== device.modelId
          ) {
            const model = await connection.query
              .selectFrom('models')
              .selectAll()
              .where('id', '=', input.modelId)
              .executeTakeFirst<Row>();
            if (!model) throw new ValidationError('Model not found', 'modelId');
            values.categoryId = model.categoryId;
            values.manufacturerId = model.manufacturerId;
          }
          // A changed purchase date (or model) moves the planned
          // replacement along (it is always purchase date + the category's
          // cycle) and the warranty end unless the user set that by hand: a
          // warranty still equal to what the old inputs implied, or empty,
          // is recomputed; anything else is theirs and stays.
          const purchaseDateChanged =
            'purchaseDate' in input &&
            input.purchaseDate !== device.purchaseDate;
          if (purchaseDateChanged || values.categoryId !== undefined) {
            const loadModel = async (modelId: unknown) => {
              const model = await connection.query
                .selectFrom('models')
                .selectAll()
                .where('id', '=', String(modelId))
                .executeTakeFirst<Row>();
              const category = model
                ? await connection.query
                    .selectFrom('categories')
                    .selectAll()
                    .where('id', '=', String(model.categoryId))
                    .executeTakeFirst<Row>()
                : undefined;
              return { model: model ?? {}, category: category ?? {} };
            };
            const before = await loadModel(device.modelId);
            const after =
              values.modelId !== undefined && values.modelId !== device.modelId
                ? await loadModel(values.modelId)
                : before;
            const was = impliedDates(
              device.purchaseDate,
              before.model,
              before.category,
            );
            const now = impliedDates(
              purchaseDateChanged ? input.purchaseDate : device.purchaseDate,
              after.model,
              after.category,
            );
            values.plannedReplacementDate = now.plannedReplacementDate;
            if (!('warrantyEndDate' in input)) {
              const current = device.warrantyEndDate ?? null;
              if (current === null || current === was.warrantyEndDate)
                values.warrantyEndDate = now.warrantyEndDate;
            }
          }
          if (
            typeof input.serialNo === 'string' &&
            input.serialNo !== device.serialNo
          ) {
            const duplicate = await connection.query
              .selectFrom('devices')
              .select('id')
              .where('serialNo', '=', input.serialNo)
              .where(
                'manufacturerId',
                '=',
                String(values.manufacturerId ?? device.manufacturerId),
              )
              .where('id', '!=', id)
              .executeTakeFirst();
            if (duplicate)
              throw new DuplicateValueError('serialNo', input.serialNo);
          }
          const merged = { ...device, ...values };
          const depreciation = computeBookValue(merged as never, new Date());
          values.bookValue = depreciation?.bookValue ?? null;
          values.depreciatedAmount = depreciation?.depreciatedAmount ?? null;
          await write(connection, id, values);
          await history.logChanges(
            { subjectType: 'devices', subjectId: id },
            device,
            input,
            context,
            connection,
          );
        },
        within,
      );
    },

    async deleteImpact(id) {
      const references = [] as {
        collection: string;
        field: string;
        count: number;
      }[];
      const allocationCount = await database
        .query()
        .selectFrom('allocations')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('subjectType', '=', 'device')
        .where('subjectId', '=', id)
        .executeTakeFirst<{ total: number | string }>();
      if (Number(allocationCount?.total ?? 0) > 0) {
        references.push({
          collection: 'allocations',
          field: 'subjectId',
          count: Number(allocationCount?.total),
        });
      }
      const device = await findRaw(id);
      if (device?.purchaseOrderId) {
        references.push({
          collection: 'purchaseOrders',
          field: 'purchaseOrderId',
          count: 1,
        });
      }
      const children = await database
        .query()
        .selectFrom('devices')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('assigneeType', '=', 'device')
        .where('assigneeId', '=', id)
        .executeTakeFirst<{ total: number | string }>();
      if (Number(children?.total ?? 0) > 0) {
        references.push({
          collection: 'devices',
          field: 'assigneeId',
          count: Number(children?.total),
        });
      }
      // Everything else that names the device and would dangle after a
      // hard delete: a device with a life recorded is disposed, not deleted.
      const referencing: readonly {
        collection: string;
        field: string;
        where?: { field: string; value: string };
      }[] = [
        { collection: 'repairs', field: 'deviceId' },
        { collection: 'auditItems', field: 'deviceId' },
        { collection: 'disposalDevices', field: 'deviceId' },
        {
          collection: 'entitlementSeats',
          field: 'holderId',
          where: { field: 'holderType', value: 'device' },
        },
        {
          collection: 'stockHoldings',
          field: 'holderId',
          where: { field: 'holderType', value: 'device' },
        },
      ];
      for (const reference of referencing) {
        let query = database
          .query()
          .selectFrom(reference.collection)
          .select((eb) => [eb.fn.countAll().as('total')])
          .where(reference.field, '=', id);
        if (reference.where)
          query = query.where(
            reference.where.field,
            '=',
            reference.where.value,
          );
        const row = await query.executeTakeFirst<{ total: number | string }>();
        if (Number(row?.total ?? 0) > 0)
          references.push({
            collection: reference.collection,
            field: reference.field,
            count: Number(row?.total),
          });
      }
      return { level: references.length > 0 ? 'blocked' : 'plain', references };
    },

    async delete(id, context, conditions) {
      // The impact check runs outside the transaction: SQLite holds one
      // connection, so a manager-level query inside would wait forever.
      const impact = await this.deleteImpact(id);
      if (impact.level === 'blocked') throw new DeleteBlockedError(impact);
      await database.transaction(async (connection) => {
        await load(id, conditions, connection);
        await connection.query
          .deleteFrom('devices')
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        await history.log(
          {
            subjectType: 'devices',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    assign: (id, input, context, conditions) =>
      assignOp(id, input, context, conditions),

    assignWithin: (connection, id, input, context) =>
      assignOp(
        id,
        input,
        context,
        unrestricted('devices', 'assign'),
        connection,
      ),

    loan: (id, input, context, conditions) =>
      loanOp(id, input, context, conditions),

    loanWithin: (connection, id, input, context) =>
      loanOp(id, input, context, unrestricted('devices', 'loan'), connection),

    return: (id, input, context, conditions) =>
      returnOp(id, input, context, conditions),

    returnWithin: (connection, id, input, context) =>
      returnOp(
        id,
        input,
        context,
        unrestricted('devices', 'return'),
        connection,
      ),
    transfer: (id, input, context, conditions, within) =>
      mutate(
        id,
        conditions,
        'transfer',
        async (connection, device) => {
          if (
            device.assigneeType === input.targetType &&
            device.assigneeId === input.targetId
          ) {
            throw new BusinessRuleError(
              'Device is already assigned to that target',
              'SAME_TARGET',
            );
          }
          // One event, "from A to B": the allocation ledger keeps the two
          // rows (the closed one and the new one).
          await assignInternal(connection, device, input, context, 'transfer');
        },
        within,
      ),

    reserve: (id, input, context, conditions) =>
      mutate(id, conditions, 'reserve', async (connection, device) => {
        if (device.reservedForId)
          throw new BusinessRuleError('Device is already reserved', 'RESERVED');
        if (!input.reservedUntil)
          throw new ValidationError(
            'reservedUntil is required',
            'reservedUntil',
          );
        // A reservation that already ended would be released at once.
        if (input.reservedUntil < today())
          throw new ValidationError(
            'reservedUntil must not be in the past',
            'reservedUntil',
          );
        const target = await assertTarget(
          connection,
          input.reservedForType,
          input.reservedForId,
          id,
        );
        const targetLabelText = targetLabel(target, input.reservedForType);
        await write(connection, id, {
          reservedForType: input.reservedForType,
          reservedForId: input.reservedForId,
          reservedUntil: input.reservedUntil,
        });
        await history.record(
          {
            subjectType: 'devices',
            subjectId: id,
            type: 'reserve',
            summary: `Reserved for ${targetLabelText} until ${input.reservedUntil}`,
            payload: { ...input, targetLabel: targetLabelText },
            ...context,
          },
          connection,
        );
      }),

    unreserve: (id, context, conditions) =>
      mutate(id, conditions, 'unreserve', async (connection, device) => {
        if (!device.reservedForId)
          throw new BusinessRuleError('Device is not reserved', 'NOT_RESERVED');
        await write(connection, id, {
          reservedForType: null,
          reservedForId: null,
          reservedUntil: null,
        });
        await history.record(
          {
            subjectType: 'devices',
            subjectId: id,
            type: 'unreserve',
            summary: 'Reservation cancelled',
            payload: {
              reservedForType: device.reservedForType,
              reservedForId: device.reservedForId,
              targetLabel: await reservedLabel(connection, device),
            },
            ...context,
          },
          connection,
        );
      }),

    markLost: (id, notes, context, conditions, within) =>
      mutate(
        id,
        conditions,
        'markLost',
        async (connection, device) => {
          await closeActiveAllocation(connection, id);
          await write(connection, id, {
            status: 'lost',
            assigneeType: null,
            assigneeId: null,
            assignedAt: null,
            expectedReturnDate: null,
          });
          await statusChange(
            connection,
            device,
            'lost',
            context,
            notes.trim() ? `Marked lost: ${notes}` : 'Marked lost',
            notes.trim() ? { notes } : {},
          );
        },
        within,
      ),

    restore: (id, context, conditions) =>
      mutate(id, conditions, 'restore', async (connection, device) => {
        await write(connection, id, { status: 'inStock' });
        await statusChange(
          connection,
          device,
          'inStock',
          context,
          'Found and restored to stock',
        );
      }),

    retire: (id, context, conditions) =>
      mutate(id, conditions, 'retire', async (connection, device) => {
        await write(connection, id, {
          status: 'retired',
          reservedForType: null,
          reservedForId: null,
          reservedUntil: null,
        });
        await statusChange(connection, device, 'retired', context, 'Retired');
      }),

    reactivate: (id, context, conditions) =>
      mutate(id, conditions, 'reactivate', async (connection, device) => {
        await write(connection, id, { status: 'inStock' });
        await statusChange(
          connection,
          device,
          'inStock',
          context,
          'Reactivated to stock',
        );
      }),

    correctStatus: (id, input, context, conditions, within) =>
      mutate(
        id,
        conditions,
        undefined,
        async (connection, device) => {
          if (!input.reason.trim())
            throw new ValidationError('A reason is required', 'reason');
          if (device.status === 'disposed' || input.status === 'disposed') {
            throw new BusinessRuleError(
              'Disposal is only reached through the disposal process',
              'DISPOSAL_ONLY',
            );
          }
          const clearsAssignee = !IN_USE_STATUSES.includes(input.status);
          if (clearsAssignee) await closeActiveAllocation(connection, id);
          await write(connection, id, {
            status: input.status,
            ...(clearsAssignee
              ? {
                  assigneeType: null,
                  assigneeId: null,
                  assignedAt: null,
                  expectedReturnDate: null,
                }
              : {}),
          });
          await statusChange(
            connection,
            device,
            input.status,
            context,
            `Status corrected: ${input.reason}`,
            {
              reason: input.reason,
              correction: true,
            },
          );
        },
        within,
      ),

    async transition(id, operation, context, connection, options) {
      const run = async (tx: DatabaseConnection) => {
        const device = await findRaw(id, tx);
        if (!device) throw new RecordNotFoundError('devices', id);
        requireStatus(device, operation);
        let next: DeviceStatus;
        const values: Row = {};
        switch (operation) {
          case 'sendToRepair':
            next = 'inRepair';
            break;
          case 'repairDone':
            next = device.assigneeId
              ? device.expectedReturnDate
                ? 'onLoan'
                : 'inUse'
              : 'inStock';
            break;
          case 'markPendingDisposal':
            next = 'pendingDisposal';
            await closeActiveAllocation(tx, id);
            Object.assign(values, {
              assigneeType: null,
              assigneeId: null,
              assignedAt: null,
              expectedReturnDate: null,
              reservedForType: null,
              reservedForId: null,
              reservedUntil: null,
            });
            break;
          case 'dispose':
            next = 'disposed';
            break;
        }
        await write(tx, id, { ...values, status: next });
        await statusChange(
          tx,
          device,
          next,
          context,
          options?.summary ?? TRANSITION_SUMMARIES[operation],
          options?.payload,
          // Repairs record their own device events.
          operation !== 'sendToRepair' && operation !== 'repairDone',
        );
      };
      if (connection) await run(connection);
      else await database.transaction(run);
      const after = await findRaw(id, connection);
      return after ?? {};
    },

    async releaseExpiredReservations(today) {
      const expired = await database
        .query()
        .selectFrom('devices')
        .select(['id', 'reservedForType', 'reservedForId'])
        .where('status', '=', 'inStock')
        .where('reservedUntil', '<', today)
        .execute<{
          id: string;
          reservedForType: string;
          reservedForId: string;
        }>();
      for (const device of expired) {
        await database.transaction(async (connection) => {
          await write(connection, device.id, {
            reservedForType: null,
            reservedForId: null,
            reservedUntil: null,
          });
          await history.record(
            {
              subjectType: 'devices',
              subjectId: device.id,
              type: 'unreserve',
              summary: 'Reservation expired and was released',
              payload: {
                reservedForType: device.reservedForType,
                reservedForId: device.reservedForId,
                targetLabel: await reservedLabel(connection, device),
                expired: true,
              },
              sourceType: 'scheduler',
            },
            connection,
          );
        });
      }
      return expired.map((device) => device.id);
    },

    async recomputeDepreciation(asOf) {
      const rows = await database
        .query()
        .selectFrom('devices')
        .select([
          'id',
          'depreciationMethod',
          'purchasePrice',
          'purchaseDate',
          'usefulLifeMonths',
          'residualRate',
          'bookValue',
          'depreciatedAmount',
        ])
        .where('depreciationMethod', '=', 'straightLine')
        .where('status', '!=', 'disposed')
        .execute<Row>();
      let updated = 0;
      for (const row of rows) {
        const next = computeBookValue(row as never, asOf);
        if (!next) continue;
        if (
          Number(row.bookValue) === next.bookValue &&
          Number(row.depreciatedAmount) === next.depreciatedAmount
        )
          continue;
        await database
          .query()
          .updateTable('devices')
          .set({
            bookValue: next.bookValue,
            depreciatedAmount: next.depreciatedAmount,
            updatedAt: new Date(),
          })
          .where('id', '=', String(row.id))
          .execute();
        updated += 1;
      }
      return updated;
    },
  };
}

/** A JSON document as an object: decoded, or empty when it is not one. */
function jsonObject(value: unknown): Record<string, unknown> {
  const parsed: unknown =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return undefined;
          }
        })()
      : value;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
