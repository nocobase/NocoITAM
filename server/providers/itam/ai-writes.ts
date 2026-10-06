import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import { z } from 'zod';

import type { ActorScope } from './ai-bridge.js';
import { unrestricted } from './authz-filter.js';
import { itamChangesToken } from './changes.js';
import type { Row } from './collection-query.js';
import {
  ASSIGNEE_TYPES,
  CORRECTABLE_STATUSES,
  OPERATION_FROM,
  RETURN_TARGETS,
  type DeviceOperation,
  type DeviceStatus,
} from './device-status.js';
import { deviceServiceToken, type OperationContext } from './devices.js';
import {
  DATA_WIPE_OPTIONS,
  DISPOSAL_METHODS,
  DISPOSAL_REASONS,
  disposalServiceToken,
  WIPE_METHODS,
} from './disposals.js';
import { entitlementServiceToken } from './entitlements.js';
import { holdAttributes } from './master-capture.js';
import { masterDataServiceToken } from './master-data.js';
import {
  BusinessRuleError,
  DuplicateValueError,
  RecordNotFoundError,
  ValidationError,
} from './errors.js';
import {
  LINE_ITEM_TYPES,
  PO_REASONS,
  procurementServiceToken,
} from './procurement.js';

/**
 * What the ITAM assistant may change, as the AI employee plugin's write
 * tools (`ai/tools/itam/*`, permission ASK). The plugin holds each call
 * until the user confirms the card in the conversation; confirming runs
 * the operation here, through the same service and under the same
 * authorization as the page that does it, with the confirming user as the
 * actor. Nothing is proposed into a table of its own: the conversation is
 * where a proposal lives, and where it is confirmed or denied.
 *
 * A refused operation is thrown, never returned: the plugin records a
 * thrown error as the call's result, while a result object reading
 * `status: 'error'` would leave the card pending (the lesson of the CRM
 * that went this way first).
 */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const title = z
  .string()
  .min(1)
  .max(255)
  .describe(
    'One line naming what this does, in the user\'s language, e.g. "把 DE-000012 分配给李娜".',
  );

const target = {
  targetType: z
    .enum(ASSIGNEE_TYPES)
    .default('person')
    .describe('Who receives it; a person unless stated otherwise.'),
  targetId: id.describe(
    'The person id, or the location / device id for those target types.',
  ),
};

export const AI_WRITE_SCHEMAS = {
  itam_assign_device: z.object({
    title,
    deviceId: id,
    ...target,
  }),
  itam_loan_device: z.object({
    title,
    deviceId: id,
    // The page lends to a person only.
    targetType: z.literal('person').default('person'),
    targetId: id.describe('The person id.'),
    expectedReturnDate: date,
  }),
  itam_return_devices: z.object({
    title,
    items: z
      .array(
        z.object({
          deviceId: id,
          nextStatus: z
            .enum(RETURN_TARGETS as [DeviceStatus, ...DeviceStatus[]])
            .optional()
            .describe('Where it goes; in stock unless stated.'),
          locationId: id
            .optional()
            .describe('Where it is put; unchanged when omitted.'),
          condition: z.string().max(2000).optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  itam_transfer_device: z.object({
    title,
    deviceId: id,
    ...target,
  }),
  // 入职配备 before the first day: held for a joiner until they arrive.
  itam_reserve_device: z.object({
    title,
    deviceId: id,
    reservedForType: z
      .enum(ASSIGNEE_TYPES)
      .default('person')
      .describe('Who it is held for; a person unless stated otherwise.'),
    reservedForId: id.describe('The person id (or location / device id).'),
    reservedUntil: date.describe(
      'Held until this day; for a joiner, their joining date.',
    ),
  }),
  itam_correct_device_status: z.object({
    title,
    deviceId: id,
    // A terminal state is not a correction: see CORRECTABLE_STATUSES.
    status: z.enum(
      CORRECTABLE_STATUSES as unknown as [DeviceStatus, ...DeviceStatus[]],
    ),
    reason: z.string().min(1).max(2000),
  }),
  itam_assign_seat: z.object({
    title,
    entitlementId: id,
    holderType: z.enum(['person', 'device']).optional(),
    holderId: id.optional(),
    account: z.string().trim().min(1).max(255).optional(),
  }),
  itam_reclaim_seats: z.object({
    title,
    items: z
      .array(z.object({ entitlementId: id, seatId: id }))
      .min(1)
      .max(100),
  }),
  itam_create_purchase_order: z.object({
    title,
    reason: z.enum(PO_REASONS),
    description: z.string().max(20000).optional(),
    vendorId: id,
    departmentId: id.optional(),
    neededBy: date.optional(),
    currency: z.string().trim().max(8).optional(),
    lines: z
      .array(
        z.object({
          itemType: z.enum(LINE_ITEM_TYPES),
          modelId: id.optional(),
          softwareProductId: id.optional(),
          quantity: z.number().int().min(1).max(10000),
          unitPrice: z.number().min(0).optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
  itam_create_disposal: z.object({
    title,
    method: z.enum(DISPOSAL_METHODS),
    reason: z.enum(DISPOSAL_REASONS),
    deviceIds: z.array(id).min(1).max(1000),
    description: z.string().max(20000).optional(),
    dataWipe: z.enum(DATA_WIPE_OPTIONS),
    wipeMethod: z.enum(WIPE_METHODS).optional(),
    recipientVendorId: id.optional(),
    recipientName: z.string().trim().max(255).optional(),
  }),
  // AI 联网补充 (2026-10-06): what the lookup found, written into a model or
  // a software product the user is looking at. Never its name, maker or
  // category: another of those is another record.
  itam_update_master_record: z.object({
    title,
    collection: z.enum(['models', 'softwareProducts']),
    id,
    code: z.string().trim().min(1).max(255).optional(),
    specification: z.string().trim().min(1).max(20000).optional(),
    warrantyMonths: z.number().int().min(1).max(240).optional(),
    releaseDate: date.optional(),
    eolDate: date.optional(),
    eosDate: date.optional(),
    deliveryMethod: z.enum(['onPremise', 'saas', 'both']).optional(),
    description: z.string().trim().min(1).max(20000).optional(),
    website: z.string().trim().url().max(500).optional(),
    attributes: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe(
        "A model's extended fields by key, merged into what it already holds.",
      ),
  }),
} as const;

/** The fields the update may write, per collection. */
const UPDATABLE: Readonly<Record<string, readonly string[]>> = {
  models: [
    'code',
    'specification',
    'warrantyMonths',
    'releaseDate',
    'eolDate',
    'eosDate',
    'attributes',
  ],
  softwareProducts: ['deliveryMethod', 'description', 'website'],
};

export type AiWriteTool = keyof typeof AI_WRITE_SCHEMAS;
export const AI_WRITE_TOOLS = Object.keys(AI_WRITE_SCHEMAS) as AiWriteTool[];

/** The grants each tool needs, asked before the card offers confirmation. */
const PERMISSIONS: Readonly<
  Record<AiWriteTool, readonly (readonly [string, string])[]>
> = {
  itam_assign_device: [['devices', 'assign']],
  itam_loan_device: [['devices', 'loan']],
  itam_return_devices: [['devices', 'return']],
  itam_transfer_device: [['devices', 'transfer']],
  itam_reserve_device: [['devices', 'reserve']],
  itam_correct_device_status: [['devices', 'correctStatus']],
  itam_assign_seat: [['entitlements', 'assignSeat']],
  itam_reclaim_seats: [['entitlements', 'assignSeat']],
  itam_create_purchase_order: [
    ['purchaseOrders', 'create'],
    ['purchaseOrders', 'update'],
  ],
  itam_create_disposal: [['disposals', 'create']],
  // Decided on the collection the call names (`screenWrite`).
  itam_update_master_record: [],
};

/** How a refusal reads on the card and to the model. */
export interface AiWriteFailure {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export function describeFailure(error: unknown): AiWriteFailure {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return {
      code: 'VALIDATION',
      message: issue?.message ?? 'Invalid input',
      field: issue?.path.join('.'),
    };
  }
  if (error instanceof ValidationError)
    return { code: 'VALIDATION', message: error.message, field: error.field };
  if (error instanceof DuplicateValueError)
    return { code: 'DUPLICATE', message: error.message, field: error.field };
  if (error instanceof BusinessRuleError)
    return { code: error.rule, message: error.message };
  if (error instanceof RecordNotFoundError)
    return { code: 'NOT_FOUND', message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('Not allowed')
    ? { code: 'FORBIDDEN', message }
    : { code: 'SERVER_ERROR', message };
}

/** Throws the failure the way the plugin records it: as the call's error. */
export function refuse(error: unknown): never {
  throw new Error(JSON.stringify(describeFailure(error)));
}

type Result = Record<string, unknown>;

/**
 * Checks what can be known without writing: the arguments, and that the
 * user holds every grant the operation needs. A business rule that depends
 * on the record's state (a device already assigned) is still decided by
 * the operation itself, and shows on the card if it refuses.
 */
/** The device operation each device tool performs, checked on the card. */
const DEVICE_OPERATIONS: Partial<Record<AiWriteTool, DeviceOperation>> = {
  itam_assign_device: 'assign',
  itam_loan_device: 'loan',
  itam_transfer_device: 'transfer',
  itam_return_devices: 'return',
  itam_reserve_device: 'reserve',
};

export async function screenWrite(
  container: ServiceContainer,
  scope: ActorScope,
  tool: string,
  args: unknown,
): Promise<{ ok: true } | ({ ok: false } & AiWriteFailure)> {
  if (!(AI_WRITE_TOOLS as string[]).includes(tool))
    return { ok: false, code: 'VALIDATION', message: `Unknown tool: ${tool}` };
  const parsed = AI_WRITE_SCHEMAS[tool as AiWriteTool].safeParse(args);
  if (!parsed.success) return { ok: false, ...describeFailure(parsed.error) };
  if (tool === 'itam_update_master_record') {
    const { collection } = parsed.data as { collection: string };
    if (!(await scope.may(collection, 'update')))
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: `Not allowed: ${collection}.update`,
      };
  }
  for (const [collection, action] of PERMISSIONS[tool as AiWriteTool])
    if (!(await scope.may(collection, action)))
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: `Not allowed: ${collection}.${action}`,
      };
  // A device the operation cannot start from is refused before anyone
  // confirms, with the service's own message: a device in repair is not
  // returned. A batch runs row by row, so it is stopped only when no row
  // could run.
  const operation = DEVICE_OPERATIONS[tool as AiWriteTool];
  if (operation) {
    const data = parsed.data as {
      deviceId?: string;
      items?: { deviceId: string }[];
    };
    const ids = data.items
      ? data.items.map((item) => item.deviceId)
      : [String(data.deviceId)];
    const rows = await container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('devices')
      .select(['id', 'status'])
      .where('id', 'in', ids)
      .execute<{ id: string; status: string }>();
    const status = new Map(rows.map((row) => [row.id, row.status]));
    const refused = ids.filter(
      (id) =>
        status.has(id) &&
        !OPERATION_FROM[operation].includes(status.get(id) as DeviceStatus),
    );
    if (refused.length > 0 && refused.length === ids.length)
      return {
        ok: false,
        code: 'INVALID_STATUS',
        message: `Operation "${operation}" is not allowed from status "${status.get(refused[0])}"`,
      };
  }
  return { ok: true };
}

/** Runs one confirmed tool call as the user, returning what was written. */
export async function runWrite(
  container: ServiceContainer,
  scope: ActorScope,
  tool: AiWriteTool,
  raw: unknown,
): Promise<Result> {
  try {
    const result = await execute(container, scope, tool, raw);
    // Written outside the ITAM routes, so the pages showing live to-dos are
    // told here rather than by the route middleware.
    if (container.has(itamChangesToken))
      container.resolve(itamChangesToken).touched();
    return result;
  } catch (error) {
    return refuse(error);
  }
}

async function execute(
  container: ServiceContainer,
  scope: ActorScope,
  tool: AiWriteTool,
  raw: unknown,
): Promise<Result> {
  const context: OperationContext = {
    actorId: scope.actorId,
    // The assistant proposed it; `actorId` is the person who confirmed
    // the card, because the write is their decision either way.
    origin: 'agent',
    sourceType: 'aiAction',
  };
  const devices = container.resolve(deviceServiceToken);
  const entitlements = container.resolve(entitlementServiceToken);
  const decide = (
    collection: string,
    action: string,
  ): Promise<DatabaseAuthorizationConditions> =>
    scope.decide(collection, action);
  const device = (row: Row): Result => ({
    id: row.id,
    deviceNo: row.deviceNo,
    name: row.name,
    status: row.status,
  });

  switch (tool) {
    case 'itam_assign_device': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      return device(
        await devices.assign(
          args.deviceId,
          { targetType: args.targetType, targetId: args.targetId },
          context,
          await decide('devices', 'assign'),
        ),
      );
    }
    case 'itam_reserve_device': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      return device(
        await devices.reserve(
          args.deviceId,
          {
            reservedForType: args.reservedForType,
            reservedForId: args.reservedForId,
            reservedUntil: args.reservedUntil,
          },
          context,
          await decide('devices', 'reserve'),
        ),
      );
    }
    case 'itam_loan_device': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      return device(
        await devices.loan(
          args.deviceId,
          {
            targetType: args.targetType,
            targetId: args.targetId,
            expectedReturnDate: args.expectedReturnDate,
          },
          context,
          await decide('devices', 'loan'),
        ),
      );
    }
    case 'itam_transfer_device': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      return device(
        await devices.transfer(
          args.deviceId,
          { targetType: args.targetType, targetId: args.targetId },
          context,
          await decide('devices', 'transfer'),
        ),
      );
    }
    case 'itam_correct_device_status': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      return device(
        await devices.correctStatus(
          args.deviceId,
          { status: args.status, reason: args.reason },
          context,
          await decide('devices', 'correctStatus'),
        ),
      );
    }
    case 'itam_return_devices': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      const conditions = await decide('devices', 'return');
      return eachRow(args.items, async (item) =>
        device(
          await devices.return(
            item.deviceId,
            {
              nextStatus: item.nextStatus,
              locationId: item.locationId,
              condition: item.condition,
            },
            context,
            conditions,
          ),
        ),
      );
    }
    case 'itam_assign_seat': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      const row = await entitlements.assignSeats(
        args.entitlementId,
        [
          {
            holderType: args.holderType,
            holderId: args.holderId ?? null,
            account: args.account ?? null,
          },
        ],
        context,
        await decide('entitlements', 'assignSeat'),
      );
      return { id: row.id, name: row.name };
    }
    case 'itam_reclaim_seats': {
      const args = AI_WRITE_SCHEMAS[tool].parse(raw);
      const conditions = await decide('entitlements', 'assignSeat');
      return eachRow(args.items, async (item) => {
        // Who held it, read before it is released: the card names the
        // holder of each reclaimed seat afterwards too.
        const seat = (await entitlements.seats(item.entitlementId)).find(
          (entry) => entry.id === item.seatId,
        );
        const row = await entitlements.reclaimSeats(
          item.entitlementId,
          [item.seatId],
          context,
          conditions,
        );
        return {
          id: row.id,
          name: row.name,
          seatId: item.seatId,
          holderType: seat?.holderType ?? null,
          holderId: seat?.holderId ?? null,
        };
      });
    }
    case 'itam_create_purchase_order': {
      const {
        lines,
        title: _title,
        ...order
      } = AI_WRITE_SCHEMAS[tool].parse(raw);
      const procurement = container.resolve(procurementServiceToken);
      // A draft the confirming user raised; submitting it for approval
      // names an approver, which stays a step on the order's own page.
      const created = await procurement.create(
        { ...order, ownerId: scope.actorId },
        context,
        await decide('purchaseOrders', 'create'),
      );
      try {
        await procurement.setLines(
          String(created.id),
          lines,
          context,
          await decide('purchaseOrders', 'update'),
          // The confirming user's own reach: a price they may not see is not
          // one the assistant may state for them.
          await decide('purchaseOrderLines', 'read'),
        );
      } catch (error) {
        // The order and its lines are one proposal. The two services commit
        // separately, so a draft whose lines were refused is removed again
        // (this call just created it) rather than left behind empty, one
        // more with every retry.
        await procurement
          .delete(
            String(created.id),
            context,
            unrestricted('purchaseOrders', 'delete'),
          )
          .catch(() => undefined);
        throw error;
      }
      return {
        id: created.id,
        orderNo: created.orderNo,
        status: created.status,
      };
    }
    case 'itam_update_master_record': {
      const {
        title: _title,
        collection,
        id: recordId,
        attributes,
        ...fields
      } = AI_WRITE_SCHEMAS[tool].parse(raw);
      const allowed = UPDATABLE[collection] ?? [];
      for (const key of Object.keys(fields))
        if (!allowed.includes(key))
          throw new ValidationError(`Not a field of ${collection}`, key);
      if (attributes && !allowed.includes('attributes'))
        throw new ValidationError(`Not a field of ${collection}`, 'attributes');
      const masterData = container.resolve(masterDataServiceToken);
      const conditions = await decide(collection, 'update');
      const current = await masterData.get(collection, recordId, conditions);
      if (!current) throw new RecordNotFoundError(collection, recordId);
      const input: Record<string, unknown> = { ...fields };
      if (attributes && Object.keys(attributes).length > 0) {
        // Only the category's fields, each of its type, over what the
        // record already holds.
        const category = await container
          .resolve(databaseManagerToken)
          .query()
          .selectFrom('categories')
          .select('fieldTemplate')
          .where('id', '=', String(current.categoryId))
          .executeTakeFirst<{ fieldTemplate: unknown }>();
        const held = holdAttributes(category?.fieldTemplate, attributes);
        const refused = Object.keys(attributes).find((key) => !(key in held));
        if (refused)
          throw new ValidationError(
            'Not a value this extended field takes',
            `attributes.${refused}`,
          );
        const own =
          current.attributes && typeof current.attributes === 'object'
            ? (current.attributes as Record<string, unknown>)
            : {};
        input.attributes = { ...own, ...held };
      }
      if (Object.keys(input).length === 0)
        throw new ValidationError('Nothing to change');
      const row = await masterData.update(
        collection,
        recordId,
        input,
        scope.actorId,
        conditions,
      );
      return { id: row.id, name: row.name, collection };
    }
    case 'itam_create_disposal': {
      const { title: _title, ...input } = AI_WRITE_SCHEMAS[tool].parse(raw);
      const created = await container
        .resolve(disposalServiceToken)
        .create(
          { ...input, ownerId: scope.actorId },
          context,
          await decide('disposals', 'create'),
        );
      return {
        id: created.id,
        disposalNo: created.disposalNo,
        status: created.status,
      };
    }
  }
}

/**
 * The same operation over several records, one at a time, so one refusal
 * does not hide the rest. All refused is the call's failure; some refused
 * is a result that says which.
 */
async function eachRow<T>(
  items: readonly T[],
  run: (item: T) => Promise<Result>,
): Promise<Result> {
  const rows: Result[] = [];
  let failed = 0;
  let firstError: unknown;
  for (const item of items) {
    try {
      rows.push({ ok: true, ...(await run(item)) });
    } catch (error) {
      failed += 1;
      firstError ??= error;
      rows.push({ ok: false, item, error: describeFailure(error) });
    }
  }
  if (failed === items.length) refuse(firstError);
  return { done: items.length - failed, failed, rows };
}
