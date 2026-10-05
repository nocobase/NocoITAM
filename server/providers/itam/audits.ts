import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { isDeviceStatus, type AssigneeType } from './device-status.js';
import type { DeviceService, OperationContext } from './devices.js';
import { assertInputFields, unrestricted } from './authz-filter.js';
import {
  asText,
  decodeRow,
  listCollection,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import { AUDIT_TASKS_COLLECTION } from './collections.js';
import { createRecordHelpers } from './domain-record.js';
import { subtreeIds } from './tree-scope.js';
import {
  BusinessRuleError,
  RecordNotFoundError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { ItamNotifier } from './notifier.js';
import { today } from './dates.js';

/**
 * Audit tasks and their items. Starting a task snapshots the devices in
 * scope; counting records what was found; finishing moves to "pending
 * differences" (or straight to completed); resolving each difference
 * applies the chosen correction to the device. Completion stamps every
 * counted device's last-audited time.
 */
/**
 * What a count found. A device can be in the wrong place, with the wrong
 * holder and in the wrong status at once, so the three used to be one
 * choice the counter had to rank; since 2026-09-27 there is one `mismatch`
 * and the item's own actual location, holder and status say what differs.
 */
export const AUDIT_RESULTS = [
  'notCounted',
  'matched',
  'mismatch',
  'notFound',
  'unregistered',
] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export const AUDIT_RESOLUTIONS = [
  /** Writes every value the count recorded back onto the device. */
  'updateToActual',
  'markLost',
  'register',
  'markVerified',
  'unresolved',
] as const;
export type AuditResolution = (typeof AUDIT_RESOLUTIONS)[number];
const DIFFERENCES: readonly AuditResult[] = [
  'mismatch',
  'notFound',
  'unregistered',
];

export interface AuditScope {
  readonly locationIds?: readonly string[];
  readonly departmentIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly deviceIds?: readonly string[];
}

export interface AuditTaskInput extends Row {
  readonly name: string;
  readonly scope: AuditScope;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly executorIds: readonly string[];
  /**
   * Who answers for the task, beside the people who count. Starts at
   * whoever creates it when not named.
   */
  readonly ownerId?: string | null;
  readonly notes?: string | null;
}

export interface CountInput {
  /** Existing item, or a device in scope by id. */
  readonly itemId?: string;
  readonly deviceId?: string;
  readonly result: Exclude<AuditResult, 'notCounted' | 'unregistered'>;
  readonly actualLocationId?: string | null;
  readonly actualAssigneeId?: string | null;
  /** What that holder is: a person, a place or another device. */
  readonly actualAssigneeType?: AssigneeType | null;
  readonly actualStatus?: string | null;
  readonly notes?: string | null;
}

export interface UnregisteredInput {
  readonly label: string;
  readonly actualLocationId?: string | null;
  readonly notes?: string | null;
}

export interface ResolveInput {
  readonly itemId: string;
  readonly resolution: AuditResolution;
  /**
   * For `register`: what the new device is, asked the way the device page
   * asks it. The name falls back to what the counter called it.
   */
  readonly modelId?: string;
  readonly locationId?: string;
  readonly serialNo?: string | null;
  readonly name?: string | null;
  readonly departmentId?: string | null;
  readonly ownership?: string | null;
  readonly vendorId?: string | null;
  readonly purchasePrice?: number | null;
  readonly purchaseDate?: string | null;
  readonly warrantyEndDate?: string | null;
  readonly notes?: string | null;
  readonly ownerId?: string | null;
  readonly reason?: string;
}

export interface AuditService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    input: AuditTaskInput,
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
  items(id: string, result?: string): Promise<readonly Row[]>;
  /** How many devices the scope currently matches (preview before starting). */
  previewScope(scope: AuditScope): Promise<number>;
  start(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  count(
    id: string,
    entries: readonly CountInput[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  addUnregistered(
    id: string,
    input: UnregisteredInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  finish(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  resolve(
    id: string,
    entries: readonly ResolveInput[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  cancel(
    id: string,
    reason: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
}

export const auditServiceToken: ServiceToken<AuditService> =
  createServiceToken<AuditService>('itam/audit-service');

const JSON_FIELDS = ['scope', 'executorIds'] as const;
const LIFECYCLE_FIELDS = new Set([
  'status',
  'expectedCount',
  'countedCount',
  'differenceCount',
  'startedAt',
  'completedAt',
  'cancelReason',
]);

export function createAuditService(dependencies: {
  database: DatabaseManager;
  history: HistoryService;
  devices: DeviceService;
  notifier: ItamNotifier;
}): AuditService {
  const { database, history, devices, notifier } = dependencies;
  const definition = AUDIT_TASKS_COLLECTION;
  const records = createRecordHelpers(database, history, definition, {
    jsonFields: JSON_FIELDS,
  });

  /** Ids of the non-disposed devices a scope matches; every criterion narrows. */
  const resolveScope = async (
    scope: AuditScope,
    connection?: DatabaseConnection,
  ): Promise<readonly string[]> => {
    const query = connection ? connection.query : database.query();
    const subtree = (
      table: 'locations' | 'departments',
      ids: readonly string[],
    ) => subtreeIds(connection ?? database, table, ids);
    let q = query
      .selectFrom('devices')
      .select('id')
      .where('status', '!=', 'disposed');
    let narrowed = false;
    if (scope.locationIds?.length) {
      const ids = await subtree('locations', scope.locationIds);
      q = q.where('locationId', 'in', ids.length ? ids : ['__none__']);
      narrowed = true;
    }
    if (scope.departmentIds?.length) {
      const ids = await subtree('departments', scope.departmentIds);
      q = q.where('departmentId', 'in', ids.length ? ids : ['__none__']);
      narrowed = true;
    }
    if (scope.categoryIds?.length) {
      q = q.where('categoryId', 'in', [...scope.categoryIds]);
      narrowed = true;
    }
    if (scope.deviceIds?.length) {
      q = q.where('id', 'in', [...scope.deviceIds]);
      narrowed = true;
    }
    if (!narrowed)
      throw new ValidationError(
        'The scope must narrow by at least one criterion',
        'scope',
      );
    return (await q.orderBy('deviceNo', 'asc').execute<{ id: string }>()).map(
      (row) => row.id,
    );
  };

  const recount = async (connection: DatabaseConnection, id: string) => {
    const rows = await connection.query
      .selectFrom('auditItems')
      .select(['result', 'resolution'])
      .where('auditTaskId', '=', id)
      .execute<{ result: AuditResult; resolution: string }>();
    const expected = rows.filter((row) => row.result !== 'unregistered').length;
    const counted = rows.filter(
      (row) => row.result !== 'notCounted' && row.result !== 'unregistered',
    ).length;
    const differences = rows.filter(
      (row) =>
        DIFFERENCES.includes(row.result) && row.resolution === 'unresolved',
    ).length;
    await connection.query
      .updateTable('auditTasks')
      .set({
        expectedCount: expected,
        countedCount: counted,
        differenceCount: differences,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return { expected, counted, differences };
  };

  const complete = async (
    connection: DatabaseConnection,
    task: Row,
    context: OperationContext,
  ) => {
    const items = await connection.query
      .selectFrom('auditItems')
      .select(['deviceId', 'result'])
      .where('auditTaskId', '=', String(task.id))
      .where('result', '!=', 'notCounted')
      .where('result', '!=', 'unregistered')
      .execute<{ deviceId: string | null; result: string }>();
    const now = new Date();
    for (const item of items) {
      if (!item.deviceId) continue;
      await connection.query
        .updateTable('devices')
        .set({ lastAuditedAt: now, updatedAt: now })
        .where('id', '=', item.deviceId)
        .execute();
      await history.record(
        {
          subjectType: 'devices',
          subjectId: item.deviceId,
          type: 'audited',
          summary: `Audited in ${String(task.name)}: ${item.result}`,
          payload: {
            auditTaskId: task.id,
            targetLabel: task.name,
            result: item.result,
          },
          ...context,
          sourceType: 'auditTask',
          sourceId: String(task.id),
        },
        connection,
      );
    }
    await records.setStatus(
      connection,
      task,
      'completed',
      context,
      'Audit completed',
      {},
      { completedAt: now },
    );
  };

  const loadItem = async (
    connection: DatabaseConnection,
    taskId: string,
    itemId: string,
  ): Promise<Row> => {
    const item = await connection.query
      .selectFrom('auditItems')
      .selectAll()
      .where('id', '=', itemId)
      .where('auditTaskId', '=', taskId)
      .executeTakeFirst<Row>();
    if (!item) throw new RecordNotFoundError('auditItems', itemId);
    return decodeRow(item);
  };

  const viewFilter = (view: unknown): ListOptions['filter'] => {
    switch (view) {
      case undefined:
        return {};
      case 'inProgress':
        return { status: 'inProgress' };
      case 'overdue':
        return { status: 'inProgress', 'plannedEnd:lt': today() };
      case 'pendingDifferences':
        return { status: 'pendingDifferences' };
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
        { jsonFields: JSON_FIELDS },
      );
    },

    async get(id, conditions) {
      const row = await records.load(id, conditions).catch(() => undefined);
      return row ? records.shape(row, conditions) : undefined;
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      if (!input.name?.trim())
        throw new ValidationError('name is required', 'name');
      if (String(input.plannedEnd) < String(input.plannedStart))
        throw new ValidationError(
          'plannedEnd is before plannedStart',
          'plannedEnd',
        );
      if (!Array.isArray(input.executorIds) || input.executorIds.length === 0)
        throw new ValidationError(
          'At least one executor is required',
          'executorIds',
        );
      const expected = (await resolveScope(input.scope)).length;
      const id = crypto.randomUUID();
      const now = new Date();
      await database.transaction(async (connection) => {
        await connection.query
          .insertInto('auditTasks')
          .values({
            id,
            name: input.name,
            scope: input.scope,
            plannedStart: input.plannedStart,
            plannedEnd: input.plannedEnd,
            executorIds: input.executorIds,
            ownerId: input.ownerId ?? context.actorId,
            status: 'notStarted',
            expectedCount: expected,
            countedCount: 0,
            differenceCount: 0,
            notes: input.notes ?? null,
            cancelReason: null,
            startedAt: null,
            completedAt: null,
            createdById: context.actorId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await history.log(
          {
            subjectType: 'auditTasks',
            subjectId: id,
            action: 'create',
            ...context,
          },
          connection,
        );
      });
      return records.shape((await records.findRaw(id)) ?? {}, conditions);
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
      return records.mutate(id, conditions, async (connection, task) => {
        if (['completed', 'cancelled'].includes(String(task.status)))
          throw new BusinessRuleError('The task is closed', 'INVALID_STATUS');
        if (input.scope !== undefined && task.status !== 'notStarted')
          throw new BusinessRuleError(
            'The scope is fixed once the task started',
            'INVALID_STATUS',
          );
        const values: Record<string, unknown> = { ...input };
        if (input.scope !== undefined) {
          values.expectedCount = (
            await resolveScope(input.scope as AuditScope, connection)
          ).length;
          values.scope = input.scope;
        }
        if (input.executorIds !== undefined)
          values.executorIds = input.executorIds;
        await connection.query
          .updateTable('auditTasks')
          .set({ ...values, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'auditTasks', subjectId: id },
          task,
          input,
          context,
          connection,
        );
      });
    },

    async deleteImpact(id) {
      const task = await records.findRaw(id);
      return {
        level: task?.status === 'notStarted' ? 'plain' : 'blocked',
        references: [],
      };
    },

    async delete(id, context, conditions) {
      await database.transaction(async (connection) => {
        const task = await records.load(id, conditions, connection);
        records.requireStatus(task, ['notStarted'], 'delete');
        await connection.query
          .deleteFrom('auditItems')
          .where('auditTaskId', '=', id)
          .execute();
        await connection.query
          .deleteFrom('auditTasks')
          .where('id', '=', id)
          .execute();
        await history.log(
          {
            subjectType: 'auditTasks',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
      });
    },

    async items(id, result) {
      // Before the task starts its items do not exist yet: they are what the
      // scope matches right now, read live so a scope edit shows at once.
      // Starting takes the same reading as the snapshot to count against.
      const task = await records.findRaw(id);
      if (task?.status === 'notStarted') {
        if (result && result !== 'notCounted') return [];
        const deviceIds = await resolveScope(task.scope ?? {});
        const rows: Row[] = [];
        for (let at = 0; at < deviceIds.length; at += 500) {
          const devices = await database
            .query()
            .selectFrom('devices')
            .select([
              'id',
              'deviceNo',
              'name',
              'modelId',
              'status',
              'locationId',
              'assigneeType',
              'assigneeId',
            ])
            .where('id', 'in', deviceIds.slice(at, at + 500))
            .execute<Row>();
          for (const device of devices)
            rows.push({
              id: `preview:${String(device.id)}`,
              preview: true,
              auditTaskId: id,
              deviceId: device.id,
              label: null,
              bookLocationId: device.locationId ?? null,
              bookAssigneeType: device.assigneeType ?? null,
              bookAssigneeId: device.assigneeId ?? null,
              bookStatus: device.status ?? null,
              result: 'notCounted',
              resolution: 'unresolved',
              deviceNo: device.deviceNo,
              deviceName: device.name,
              modelId: device.modelId,
              deviceStatus: device.status,
            });
        }
        return rows.sort((a, b) =>
          `${a.deviceNo as string}`.localeCompare(`${b.deviceNo as string}`),
        );
      }
      let query = database
        .query()
        .selectFrom('auditItems')
        .leftJoin('devices', 'devices.id', 'auditItems.deviceId')
        .select([
          'auditItems.id as id',
          'auditItems.auditTaskId as auditTaskId',
          'auditItems.deviceId as deviceId',
          'auditItems.label as label',
          'auditItems.bookLocationId as bookLocationId',
          'auditItems.bookAssigneeType as bookAssigneeType',
          'auditItems.bookAssigneeId as bookAssigneeId',
          'auditItems.bookStatus as bookStatus',
          'auditItems.result as result',
          'auditItems.actualLocationId as actualLocationId',
          'auditItems.actualAssigneeId as actualAssigneeId',
          'auditItems.actualAssigneeType as actualAssigneeType',
          'auditItems.actualStatus as actualStatus',
          'auditItems.notes as notes',
          'auditItems.resolution as resolution',
          'auditItems.resolvedAt as resolvedAt',
          'auditItems.countedById as countedById',
          'auditItems.countedAt as countedAt',
          'auditItems.createdAt as createdAt',
          'devices.deviceNo as deviceNo',
          'devices.name as deviceName',
          'devices.modelId as modelId',
          'devices.status as deviceStatus',
        ])
        .where('auditItems.auditTaskId', '=', id)
        .orderBy('devices.deviceNo', 'asc')
        .orderBy('auditItems.createdAt', 'asc');
      if (result) query = query.where('auditItems.result', '=', result);
      return (await query.execute<Row>()).map((row) => decodeRow(row));
    },

    previewScope: async (scope) => (await resolveScope(scope)).length,

    async start(id, context, conditions) {
      let executors: readonly string[] = [];
      let name = '';
      const row = await records.mutate(
        id,
        conditions,
        async (connection, task) => {
          records.requireStatus(task, ['notStarted'], 'start');
          const scope = (task.scope ?? {}) as AuditScope;
          const deviceIds = await resolveScope(scope, connection);
          const now = new Date();
          for (const deviceId of deviceIds) {
            const device = await connection.query
              .selectFrom('devices')
              .select(['locationId', 'assigneeType', 'assigneeId', 'status'])
              .where('id', '=', deviceId)
              .executeTakeFirst<Row>();
            await connection.query
              .insertInto('auditItems')
              .values({
                id: crypto.randomUUID(),
                auditTaskId: id,
                deviceId,
                label: null,
                bookLocationId: device?.locationId ?? null,
                bookAssigneeType: device?.assigneeType ?? null,
                bookAssigneeId: device?.assigneeId ?? null,
                bookStatus: device?.status ?? null,
                result: 'notCounted',
                actualLocationId: null,
                actualAssigneeId: null,
                actualAssigneeType: null,
                actualStatus: null,
                notes: null,
                resolution: 'unresolved',
                resolvedAt: null,
                countedById: null,
                countedAt: null,
                createdAt: now,
                updatedAt: now,
              })
              .execute();
          }
          await recount(connection, id);
          await records.setStatus(
            connection,
            task,
            'inProgress',
            context,
            `Started with ${deviceIds.length} device(s)`,
            { expected: deviceIds.length },
            { startedAt: now },
          );
          executors = Array.isArray(task.executorIds)
            ? (task.executorIds as string[])
            : [];
          name = String(task.name);
        },
      );
      await notifier.notify({
        key: `auditTask:${id}:started`,
        to: executors,
        actorId: context.actorId,
        title: { key: 'notifications.auditStarted', params: { name } },
        body: {
          key: 'notifications.auditStartedBody',
          params: { date: String(row.plannedEnd) },
        },
        url: `/audits/${id}`,
        source: { type: 'auditTask', referenceId: id },
      });
      return row;
    },

    count: (id, entries, context, conditions) =>
      records.mutate(id, conditions, async (connection, task) => {
        records.requireStatus(task, ['inProgress'], 'count');
        const now = new Date();
        for (const entry of entries) {
          if (
            !AUDIT_RESULTS.includes(entry.result) ||
            (entry.result as string) === 'notCounted' ||
            (entry.result as string) === 'unregistered'
          )
            throw new ValidationError('Invalid count result', 'result');
          let item: Row | undefined;
          if (entry.itemId) item = await loadItem(connection, id, entry.itemId);
          else if (entry.deviceId) {
            item = await connection.query
              .selectFrom('auditItems')
              .selectAll()
              .where('auditTaskId', '=', id)
              .where('deviceId', '=', entry.deviceId)
              .executeTakeFirst<Row>();
            if (!item) {
              // Scanned outside the scope: add it to this task.
              const device = await connection.query
                .selectFrom('devices')
                .select([
                  'id',
                  'locationId',
                  'assigneeType',
                  'assigneeId',
                  'status',
                ])
                .where('id', '=', entry.deviceId)
                .executeTakeFirst<Row>();
              if (!device)
                throw new ValidationError('Device not found', 'deviceId');
              const itemId = crypto.randomUUID();
              await connection.query
                .insertInto('auditItems')
                .values({
                  id: itemId,
                  auditTaskId: id,
                  deviceId: entry.deviceId,
                  label: null,
                  bookLocationId: device.locationId ?? null,
                  bookAssigneeType: device.assigneeType ?? null,
                  bookAssigneeId: device.assigneeId ?? null,
                  bookStatus: device.status ?? null,
                  result: 'notCounted',
                  actualLocationId: null,
                  actualAssigneeId: null,
                  actualAssigneeType: null,
                  actualStatus: null,
                  notes: 'Outside the planned scope',
                  resolution: 'unresolved',
                  resolvedAt: null,
                  countedById: null,
                  countedAt: null,
                  createdAt: now,
                  updatedAt: now,
                })
                .execute();
              item = await loadItem(connection, id, itemId);
            }
          }
          if (!item)
            throw new ValidationError(
              'itemId or deviceId is required',
              'itemId',
            );
          // A difference is what differs. Every value the count states has
          // to be one: the books repeated back are not a finding, and an
          // item flagged with one of those has nothing to fix.
          if (entry.result === 'mismatch') {
            const holderType = entry.actualAssigneeId
              ? (entry.actualAssigneeType ?? 'person')
              : null;
            if (
              entry.actualLocationId &&
              entry.actualLocationId === asText(item.bookLocationId)
            )
              throw new ValidationError(
                'The counted location is the one the books already have',
                'actualLocationId',
              );
            if (
              entry.actualAssigneeId &&
              entry.actualAssigneeId === asText(item.bookAssigneeId) &&
              holderType === asText(item.bookAssigneeType)
            )
              throw new ValidationError(
                'The counted holder is the one the books already have',
                'actualAssigneeId',
              );
            if (
              isDeviceStatus(entry.actualStatus) &&
              entry.actualStatus === asText(item.bookStatus)
            )
              throw new ValidationError(
                'The counted status is the one the books already have',
                'actualStatus',
              );
            if (
              !entry.actualLocationId &&
              !entry.actualAssigneeId &&
              !isDeviceStatus(entry.actualStatus)
            )
              throw new ValidationError(
                'A difference records an actual location, holder or status',
                'result',
              );
          }
          await connection.query
            .updateTable('auditItems')
            .set({
              result: entry.result,
              actualLocationId: entry.actualLocationId ?? null,
              actualAssigneeId: entry.actualAssigneeId ?? null,
              // A counted holder with no kind is a person, the way every
              // one of them was before a count could name a place.
              actualAssigneeType: entry.actualAssigneeId
                ? (entry.actualAssigneeType ?? 'person')
                : null,
              actualStatus: entry.actualStatus ?? null,
              notes: entry.notes ?? item.notes ?? null,
              resolution: DIFFERENCES.includes(entry.result)
                ? 'unresolved'
                : 'markVerified',
              resolvedAt: DIFFERENCES.includes(entry.result) ? null : now,
              countedById: context.actorId,
              countedAt: now,
              updatedAt: now,
            })
            .where('id', '=', String(item.id))
            .execute();
        }
        const totals = await recount(connection, id);
        await history.record(
          {
            subjectType: 'auditTasks',
            subjectId: id,
            type: 'counted',
            summary: `${entries.length} item(s) counted (${totals.counted}/${totals.expected})`,
            payload: { count: entries.length, ...totals },
            ...context,
          },
          connection,
        );
      }),

    addUnregistered: (id, input, context, conditions) =>
      records.mutate(id, conditions, async (connection, task) => {
        records.requireStatus(task, ['inProgress'], 'addUnregistered');
        if (!input.label.trim())
          throw new ValidationError('label is required', 'label');
        const now = new Date();
        await connection.query
          .insertInto('auditItems')
          .values({
            id: crypto.randomUUID(),
            auditTaskId: id,
            deviceId: null,
            label: input.label.trim(),
            bookLocationId: null,
            bookAssigneeType: null,
            bookAssigneeId: null,
            bookStatus: null,
            result: 'unregistered',
            actualLocationId: input.actualLocationId ?? null,
            actualAssigneeId: null,
            actualAssigneeType: null,
            actualStatus: null,
            notes: input.notes ?? null,
            resolution: 'unresolved',
            resolvedAt: null,
            countedById: context.actorId,
            countedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await recount(connection, id);
        await history.record(
          {
            subjectType: 'auditTasks',
            subjectId: id,
            type: 'unregisteredFound',
            summary: `Unregistered device found: ${input.label}`,
            payload: { label: input.label },
            ...context,
          },
          connection,
        );
      }),

    finish: (id, context, conditions) =>
      records.mutate(id, conditions, async (connection, task) => {
        records.requireStatus(task, ['inProgress'], 'finish');
        // Anything still uncounted was not found.
        const now = new Date();
        await connection.query
          .updateTable('auditItems')
          .set({ result: 'notFound', countedAt: now, updatedAt: now })
          .where('auditTaskId', '=', id)
          .where('result', '=', 'notCounted')
          .execute();
        const totals = await recount(connection, id);
        if (totals.differences === 0) {
          await complete(connection, task, context);
        } else {
          await records.setStatus(
            connection,
            task,
            'pendingDifferences',
            context,
            `Count finished with ${totals.differences} difference(s)`,
            totals,
          );
        }
      }),

    resolve: (id, entries, context, conditions) =>
      records.mutate(id, conditions, async (connection, task) => {
        records.requireStatus(task, ['pendingDifferences'], 'resolve');
        const source = {
          ...context,
          sourceType: 'auditTask',
          sourceId: id,
          sourceLabel: String(task.name),
        };
        for (const entry of entries) {
          const item = await loadItem(connection, id, entry.itemId);
          if (!DIFFERENCES.includes(item.result as AuditResult))
            throw new BusinessRuleError(
              'Item has no difference',
              'NO_DIFFERENCE',
            );
          if (item.resolution !== 'unresolved')
            throw new BusinessRuleError('Item is already resolved', 'RESOLVED');
          if (
            !AUDIT_RESOLUTIONS.includes(entry.resolution) ||
            entry.resolution === 'unresolved'
          )
            throw new ValidationError('Invalid resolution', 'resolution');
          const deviceId = asText(item.deviceId);
          const requireDevice = () => {
            if (!deviceId)
              throw new BusinessRuleError(
                'The item has no device',
                'NO_DEVICE',
              );
            return deviceId;
          };
          switch (entry.resolution) {
            /**
             * Writes back everything the count recorded, because a device
             * can be in the wrong place, with the wrong holder and in the
             * wrong status at once: correcting one of the three and closing
             * the audit would leave the others wrong on the record.
             *
             * In that order — a place is always safe to set, the status
             * decides what may happen to the holder, and the holder is
             * assigned or transferred by the status the count just wrote.
             */
            case 'updateToActual': {
              const target = requireDevice();
              if (
                !item.actualLocationId &&
                !item.actualAssigneeId &&
                !isDeviceStatus(item.actualStatus)
              )
                throw new ValidationError(
                  'The count recorded nothing to write back',
                  'resolution',
                );
              if (isDeviceStatus(item.actualStatus))
                await devices.correctStatus(
                  target,
                  {
                    status: item.actualStatus,
                    reason: entry.reason ?? String(task.name),
                  },
                  source,
                  unrestricted('devices', 'correctStatus'),
                  connection,
                );
              let movedWithHolder = false;
              if (item.actualAssigneeId) {
                const device = await connection.query
                  .selectFrom('devices')
                  .select(['status', 'assigneeId'])
                  .where('id', '=', target)
                  .executeTakeFirst<{
                    status: string;
                    assigneeId: string | null;
                  }>();
                const input = {
                  targetType: (asText(item.actualAssigneeType) ??
                    'person') as AssigneeType,
                  targetId: asText(item.actualAssigneeId) ?? '',
                  notes: String(task.name),
                  // Where it was counted, not where its new holder sits:
                  // an assignment moves a device to its holder's place
                  // unless it is told otherwise, which would undo the
                  // location this same count recorded.
                  ...(item.actualLocationId
                    ? { locationId: asText(item.actualLocationId) ?? undefined }
                    : {}),
                };
                if (device?.assigneeId === input.targetId) {
                  // Already with them — the status write above may have put
                  // it there — so nothing carries the place either.
                } else if (device?.status === 'inUse') {
                  await devices.transfer(
                    target,
                    input,
                    source,
                    unrestricted('devices', 'transfer'),
                    connection,
                  );
                  movedWithHolder = true;
                } else if (device?.status === 'inStock') {
                  await devices.assignWithin(connection, target, input, source);
                  movedWithHolder = true;
                } else
                  throw new BusinessRuleError(
                    `Cannot change the holder from status "${device?.status ?? ''}"`,
                    'INVALID_STATUS',
                  );
              }
              // A place no assignment carried is written on its own.
              if (item.actualLocationId && !movedWithHolder)
                await devices.update(
                  target,
                  { locationId: item.actualLocationId },
                  source,
                  unrestricted('devices', 'update'),
                  connection,
                );
              break;
            }
            case 'markLost': {
              await devices.markLost(
                requireDevice(),
                entry.reason ?? '',
                source,
                unrestricted('devices', 'correctStatus'),
                connection,
              );
              break;
            }
            case 'register': {
              if (item.result !== 'unregistered')
                throw new BusinessRuleError(
                  'Only an unregistered item is registered',
                  'NOT_UNREGISTERED',
                );
              if (!entry.modelId || !entry.locationId)
                throw new ValidationError(
                  'modelId and locationId are required',
                  'modelId',
                );
              const created = await devices.createWithin(
                connection,
                {
                  modelId: entry.modelId,
                  locationId: entry.locationId,
                  serialNo: entry.serialNo ?? null,
                  // What the counter called it, unless the one registering
                  // it gave the device a name of its own.
                  name: entry.name?.trim() || String(item.label),
                  departmentId: entry.departmentId ?? null,
                  ...(entry.ownership ? { ownership: entry.ownership } : {}),
                  vendorId: entry.vendorId ?? null,
                  purchasePrice: entry.purchasePrice ?? null,
                  purchaseDate: entry.purchaseDate ?? null,
                  warrantyEndDate: entry.warrantyEndDate ?? null,
                  notes: entry.notes ?? null,
                  ownerId: entry.ownerId ?? null,
                  status: 'inStock',
                },
                source,
              );
              await connection.query
                .updateTable('auditItems')
                .set({ deviceId: String(created.id) })
                .where('id', '=', entry.itemId)
                .execute();
              break;
            }
            case 'markVerified':
              break;
          }
          await connection.query
            .updateTable('auditItems')
            .set({
              resolution: entry.resolution,
              resolvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where('id', '=', entry.itemId)
            .execute();
        }
        const totals = await recount(connection, id);
        await history.record(
          {
            subjectType: 'auditTasks',
            subjectId: id,
            type: 'resolved',
            summary: `${entries.length} difference(s) handled, ${totals.differences} left`,
            payload: { count: entries.length, ...totals },
            ...context,
          },
          connection,
        );
        if (totals.differences === 0) await complete(connection, task, context);
      }),

    cancel: (id, reason, context, conditions) =>
      records.mutate(id, conditions, async (connection, task) => {
        records.requireStatus(
          task,
          // A task not started yet has nothing to call off: it is deleted.
          ['inProgress', 'pendingDifferences'],
          'cancel',
        );
        if (!reason.trim())
          throw new ValidationError('reason is required', 'reason');
        await records.setStatus(
          connection,
          task,
          'cancelled',
          context,
          `Cancelled: ${reason}`,
          { reason },
          { cancelReason: reason },
        );
      }),
  };
}
