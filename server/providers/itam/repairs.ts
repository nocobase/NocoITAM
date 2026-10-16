import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

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
import { REPAIRS_COLLECTION } from './collections.js';
import { createRecordHelpers } from './domain-record.js';
import {
  BusinessRuleError,
  ValidationError,
  type DeleteImpact,
} from './errors.js';
import type { HistoryService } from './history.js';
import type { NumberingService } from './numbering.js';
import type { SettingsService } from './settings.js';
import { today } from './dates.js';

/**
 * Repair records. Creating one sends the device to repair; completing one
 * drives the device by result — repaired goes back to its holder or to
 * stock, unrepairable and replaced go to pending disposal. A device lent to
 * the holder meanwhile is an ordinary loan, not part of the repair record.
 */
export const REPAIR_METHODS = [
  'vendorWarranty',
  'sendOut',
  'internal',
] as const;
export const REPAIR_RESULTS = [
  'inProgress',
  'repaired',
  'unrepairable',
  'replaced',
] as const;
export type RepairResult = (typeof REPAIR_RESULTS)[number];
/** The kinds of fault a repair is filed under (2026-10-17). */
export const REPAIR_FAULT_CATEGORIES = [
  'screen',
  'keyboard',
  'battery',
  'power',
  'storage',
  'network',
  'system',
  'peripheral',
  'physical',
  'other',
] as const;

export interface RepairInput extends Row {
  readonly deviceId: string;
  /** Who is responsible for it; defaults to whoever files it. */
  readonly ownerId?: string | null;
  readonly method: (typeof REPAIR_METHODS)[number];
  readonly vendorId?: string | null;
  readonly faultDescription: string;
  readonly faultCategory?: (typeof REPAIR_FAULT_CATEGORIES)[number] | null;
  readonly sentAt?: string;
  readonly expectedReturnAt?: string | null;
  readonly cost?: number | null;
  readonly currency?: string | null;
  readonly notes?: string | null;
}

/** Where the device goes when the repair ends: back to where it came from, or to disposal. */
export const REPAIR_DISPOSITIONS = ['return', 'dispose'] as const;
export type RepairDisposition = (typeof REPAIR_DISPOSITIONS)[number];

export interface CompleteRepairInput {
  readonly result: Exclude<RepairResult, 'inProgress'>;
  /**
   * The result says what the repair achieved; the disposition says where the
   * device goes. A device that could not be fixed may still be usable, so the
   * two are chosen separately; replaced defaults to disposal, the rest to
   * going back.
   */
  readonly disposition?: RepairDisposition;
  readonly actualReturnAt?: string;
  readonly cost?: number | null;
  readonly currency?: string | null;
  readonly notes?: string | null;
}

export interface RepairService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    input: RepairInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /** Creates inside a caller-owned transaction (another service's step). */
  createWithin(
    connection: DatabaseConnection,
    input: RepairInput,
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
  complete(
    id: string,
    input: CompleteRepairInput,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    /**
     * The caller supervises repairs — holds `delete` on them, which is the
     * asset manager and root — and so may close one somebody else follows.
     */
    options?: { readonly supervises?: boolean },
  ): Promise<Row>;
  /** Repairs of one device, newest first. */
  forDevice(deviceId: string): Promise<readonly Row[]>;
}

export const repairServiceToken: ServiceToken<RepairService> =
  createServiceToken<RepairService>('itam/repair-service');

const LIFECYCLE_FIELDS = new Set(['deviceId']);
export function createRepairService(dependencies: {
  database: DatabaseManager;
  history: HistoryService;
  settings: SettingsService;
  devices: DeviceService;
  numbering: NumberingService;
}): RepairService {
  const { database, history, settings, devices, numbering } = dependencies;
  const definition = REPAIRS_COLLECTION;
  const records = createRecordHelpers(database, history, definition);

  /**
   * A repair belongs to its 负责人 (2026-09-28): the one named person who
   * finishes it, and the one who may take it back by deleting it. Holding
   * the grant is not enough — everybody in IT may own a repair, and naming
   * one is what makes a repair handed over rather than stuck
   * with whoever happened to file it.
   */
  /**
   * Finishing a repair is its 负责人's, or a supervisor's (2026-10-05): the
   * people who may clear a repair away — the asset manager and root, who
   * hold `delete` on repairs — may also close one somebody else follows,
   * so a repair whose 负责人 is away or has left is not stuck until it is
   * handed over. IT support holds `complete` and not `delete`, so for them
   * it is still their own repairs only.
   */
  const requireOwner = (
    repair: Row,
    context: OperationContext,
    supervises = false,
  ) => {
    if (!supervises && asText(repair.ownerId) !== context.actorId)
      throw new BusinessRuleError(
        'Only the owner or a supervisor can complete this repair',
        'NOT_OWNER',
      );
  };

  const createIn = async (
    connection: DatabaseConnection,
    input: RepairInput,
    context: OperationContext,
  ): Promise<Row> => {
    if (!input.faultDescription?.trim())
      throw new ValidationError(
        'faultDescription is required',
        'faultDescription',
      );
    // Only an internal repair has no counterpart; warranty work goes to the
    // reseller or the maker's service centre, both vendors here.
    if (input.method !== 'internal' && !input.vendorId)
      throw new ValidationError(
        'vendorId is required unless the repair is internal',
        'vendorId',
      );
    if (!input.expectedReturnAt)
      throw new ValidationError(
        'expectedReturnAt is required',
        'expectedReturnAt',
      );
    const device = await connection.query
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', input.deviceId)
      .executeTakeFirst<Row>();
    if (!device) throw new ValidationError('Device not found', 'deviceId');
    if (input.vendorId) {
      const vendor = await connection.query
        .selectFrom('vendors')
        .select('id')
        .where('id', '=', input.vendorId)
        .executeTakeFirst();
      if (!vendor) throw new ValidationError('Vendor not found', 'vendorId');
    }
    const open = await connection.query
      .selectFrom('repairs')
      .select('id')
      .where('deviceId', '=', input.deviceId)
      .where('result', '=', 'inProgress')
      .executeTakeFirst();
    if (open)
      throw new BusinessRuleError(
        'A repair is already in progress for this device',
        'REPAIR_OPEN',
      );
    const id = crypto.randomUUID();
    const now = new Date();
    await connection.query
      .insertInto('repairs')
      .values({
        id,
        repairNo: await numbering.next('repair', { connection }),
        deviceId: input.deviceId,
        method: input.method,
        vendorId: input.vendorId ?? null,
        faultDescription: input.faultDescription,
        faultCategory: input.faultCategory ?? null,
        sentAt: input.sentAt ?? today(),
        expectedReturnAt: input.expectedReturnAt ?? null,
        actualReturnAt: null,
        result: 'inProgress',
        cost: input.cost ?? null,
        currency:
          input.currency ??
          (await settings.get('general', connection)).currency,
        notes: input.notes ?? null,
        ownerId: input.ownerId ?? context.actorId,
        createdById: context.actorId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await history.log(
      { subjectType: 'repairs', subjectId: id, action: 'create', ...context },
      connection,
    );
    const source = { sourceType: 'repair', sourceId: id };
    if (device.status !== 'inRepair') {
      await devices.transition(
        input.deviceId,
        'sendToRepair',
        { ...context, ...source },
        connection,
      );
    }
    await history.record(
      {
        subjectType: 'devices',
        subjectId: input.deviceId,
        type: 'repairCreated',
        summary: `${input.method}: ${input.faultDescription}`,
        payload: { repairId: id, method: input.method },
        ...context,
        ...source,
      },
      connection,
    );
    return (await records.findRaw(id, connection)) ?? {};
  };

  return {
    list: (options, conditions) =>
      listCollection(database, definition, options, conditions),

    async get(id, conditions) {
      const row = await records.load(id, conditions).catch(() => undefined);
      return row ? records.shape(row, conditions) : undefined;
    },

    async create(input, context, conditions) {
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      const created = await database.transaction((connection) =>
        createIn(connection, input, context),
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
      return records.mutate(id, conditions, async (connection, repair) => {
        // The result and the return date are set by completing; afterwards
        // they may be corrected, but never back to in progress.
        if ('result' in input || 'actualReturnAt' in input) {
          if (repair.result === 'inProgress')
            throw new BusinessRuleError(
              'Complete the repair to set its result',
              'INVALID_STATUS',
            );
          if (input.result === 'inProgress')
            throw new ValidationError('Invalid repair result', 'result');
        }
        // Who saw it through is part of what happened once it is finished,
        // the way a closed order or stocktake keeps its 负责人: handing a
        // finished repair to somebody else would rewrite its history, and
        // there is nothing left on it for them to do.
        if ('ownerId' in input && repair.result !== 'inProgress')
          throw new BusinessRuleError(
            'A finished repair keeps the owner it had',
            'INVALID_STATUS',
          );
        await connection.query
          .updateTable('repairs')
          .set({ ...input, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'repairs', subjectId: id },
          repair,
          input,
          context,
          connection,
        );
      });
    },

    async deleteImpact() {
      return { level: 'plain', references: [] };
    },

    async delete(id, context, conditions) {
      await database.transaction(async (connection) => {
        // Deleting undoes the repair — the device comes back out of 维修中.
        // Who may is the grant's alone: `delete` is the asset manager's and
        // root's, the same people who may close a repair they do not follow,
        // so an owner check here would only refuse what the grant allowed.
        const repair = await records.load(id, conditions, connection);
        await connection.query
          .deleteFrom('repairs')
          .where('id', '=', id)
          .execute();
        // Its attachments go with it: nothing else can open them. Only the
        // links are removed, as deleting an attachment on the tab does; the
        // stored file belongs to the file plugin.
        await connection.query
          .deleteFrom('attachmentLinks')
          .where('ownerType', '=', 'repairs')
          .where('ownerId', '=', id)
          .execute();
        await history.log(
          {
            subjectType: 'repairs',
            subjectId: id,
            action: 'delete',
            ...context,
          },
          connection,
        );
        if (repair.result === 'inProgress') {
          const source = { ...context, sourceType: 'repair', sourceId: id };
          const device = await connection.query
            .selectFrom('devices')
            .select(['status', 'assigneeId'])
            .where('id', '=', String(repair.deviceId))
            .executeTakeFirst<Row>();
          if (device?.status === 'inRepair') {
            await devices.transition(
              String(repair.deviceId),
              'repairDone',
              source,
              connection,
              { summary: 'Repair record deleted' },
            );
          }
        }
      });
    },

    async complete(id, input, context, conditions, options) {
      const row = await records.mutate(
        id,
        conditions,
        async (connection, repair) => {
          requireOwner(repair, context, options?.supervises);
          if (repair.result !== 'inProgress')
            throw new BusinessRuleError(
              'Repair is already completed',
              'INVALID_STATUS',
            );
          if (
            !REPAIR_RESULTS.includes(input.result) ||
            (input.result as string) === 'inProgress'
          )
            throw new ValidationError('Invalid repair result', 'result');
          const values: Record<string, unknown> = {
            result: input.result,
            actualReturnAt: input.actualReturnAt ?? today(),
            updatedAt: new Date(),
          };
          if (input.cost !== undefined) values.cost = input.cost;
          if (input.currency !== undefined) values.currency = input.currency;
          if (input.notes !== undefined) values.notes = input.notes;
          await connection.query
            .updateTable('repairs')
            .set(values)
            .where('id', '=', id)
            .execute();
          await history.logChanges(
            { subjectType: 'repairs', subjectId: id },
            repair,
            values,
            context,
            connection,
          );
          const source = { ...context, sourceType: 'repair', sourceId: id };
          const deviceId = String(repair.deviceId);
          const device = await connection.query
            .selectFrom('devices')
            .select(['status', 'deviceNo'])
            .where('id', '=', deviceId)
            .executeTakeFirst<{ status: string; deviceNo: string }>();
          const disposition: RepairDisposition =
            input.disposition ??
            (input.result === 'replaced' ? 'dispose' : 'return');
          if (device?.status === 'inRepair') {
            await devices.transition(
              deviceId,
              disposition === 'dispose' ? 'markPendingDisposal' : 'repairDone',
              source,
              connection,
              {
                summary:
                  disposition === 'dispose'
                    ? `Repair ${input.result}; pending disposal`
                    : `Repair ${input.result}; returned`,
                payload: { repairId: id, result: input.result, disposition },
              },
            );
          }
          await history.record(
            {
              subjectType: 'devices',
              subjectId: deviceId,
              type: 'repairCompleted',
              summary: `Repair ${input.result}`,
              payload: {
                repairId: id,
                result: input.result,
                disposition,
                cost: input.cost,
              },
              ...source,
            },
            connection,
          );
          // The repair's own timeline says the same in one line; the field
          // changes of this operation fold under it rather than standing
          // alone as "5 fields updated".
          await history.record(
            {
              subjectType: 'repairs',
              subjectId: id,
              type: 'repairCompleted',
              summary: `Repair ${input.result}`,
              payload: { result: input.result, disposition },
              ...context,
            },
            connection,
          );
        },
      );
      return row;
    },

    async forDevice(deviceId) {
      const rows = await database
        .query()
        .selectFrom('repairs')
        .selectAll()
        .where('deviceId', '=', deviceId)
        .orderBy('sentAt', 'desc')
        .orderBy('createdAt', 'desc')
        .execute<Row>();
      return rows.map((row) => decodeRow(row));
    },
  };
}
