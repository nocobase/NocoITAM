import { databaseManagerToken } from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import { z } from 'zod';

import {
  auditServiceToken,
  deviceServiceToken,
  entitlementServiceToken,
  masterDataServiceToken,
  procurementServiceToken,
  repairServiceToken,
  stockServiceToken,
} from '../../providers/index.js';
import type { ActorScope } from '../../providers/itam/ai-bridge.js';
import { refuse, type AiWriteFailure } from '../../providers/itam/ai-writes.js';
import { MASTER_DATA_COLLECTIONS } from '../../providers/itam/collections.js';
import type { OperationContext } from '../../providers/itam/devices.js';
import { seatsRequired } from '../../providers/itam/entitlements.js';
import { ValidationError } from '../../providers/itam/errors.js';
import { HOLDER_TYPES } from '../../providers/itam/stock.js';
import { taskSchema } from './audits.js';
import { deviceSchema } from './devices.js';
import { entitlementSchema } from './entitlements.js';
import { CREATE_DEFAULTS, masterDataSchema } from './master-data-schemas.js';
import { repairSchema } from './repairs.js';
import { stockSchema } from './stock.js';

/**
 * The assistant's create and stock / receiving tools, beside the write tools
 * in `server/providers/itam/ai-writes.ts` and held the same way (ASK: the
 * plugin runs a call only once the user confirms its card). They live with
 * the routes because they take each page's own input schema: whatever the
 * create dialog may send, the assistant may propose, and nothing else. Each
 * then calls the service the route calls, under the confirming user's own
 * permission.
 */
type Row = Record<string, unknown>;

interface CreateTarget {
  readonly schema: z.ZodObject;
  readonly create: (
    container: ServiceContainer,
    input: Row,
    context: OperationContext,
    scope: ActorScope,
  ) => Promise<Row>;
}

const domainCreate =
  (
    collection: string,
    service: (container: ServiceContainer) => {
      create(
        input: never,
        context: OperationContext,
        conditions: never,
      ): Promise<Row>;
    },
  ) =>
  async (
    container: ServiceContainer,
    input: Row,
    context: OperationContext,
    scope: ActorScope,
  ) =>
    service(container).create(
      input as never,
      context,
      (await scope.decide(collection, 'create')) as never,
    );

const CREATE_TARGETS: Readonly<Record<string, CreateTarget>> = {
  devices: {
    schema: deviceSchema,
    create: domainCreate('devices', (c) => c.resolve(deviceServiceToken)),
  },
  stockItems: {
    schema: stockSchema,
    create: domainCreate('stockItems', (c) => c.resolve(stockServiceToken)),
  },
  entitlements: {
    schema: entitlementSchema,
    create: domainCreate('entitlements', (c) =>
      c.resolve(entitlementServiceToken),
    ),
  },
  repairs: {
    schema: repairSchema,
    create: domainCreate('repairs', (c) => c.resolve(repairServiceToken)),
  },
  auditTasks: {
    schema: taskSchema,
    create: domainCreate('auditTasks', (c) => c.resolve(auditServiceToken)),
  },
  ...Object.fromEntries(
    MASTER_DATA_COLLECTIONS.map((collection) => [
      collection.name,
      {
        schema: masterDataSchema(collection.name)!,
        create: async (container, input, context, scope) =>
          container
            .resolve(masterDataServiceToken)
            .create(
              collection.name,
              { ...CREATE_DEFAULTS[collection.name], ...input },
              context.actorId,
              await scope.decide(collection.name, 'create'),
            ),
      } satisfies CreateTarget,
    ]),
  ),
};

export const CREATABLE_COLLECTIONS = Object.keys(CREATE_TARGETS) as [
  string,
  ...string[],
];

/**
 * What the page's create dialog requires beyond the input schema: the
 * schema accepts what may be sent, the dialog also insists on some fields,
 * some only in some cases. An AI create meets the dialog's bar, so a card
 * never proposes a record the page would refuse or leave half-stated.
 */
const REQUIRED_ON_CREATE: Readonly<
  Record<string, (input: Row) => readonly string[]>
> = {
  devices: (input) => [
    'ownership',
    'locationId',
    ...(input.ownership === 'leased' || input.ownership === 'borrowed'
      ? ['lenderVendorId', 'returnDueDate']
      : []),
  ],
  entitlements: (input) => [
    ...(input.kind === 'perpetual' ? ['licensingModel'] : []),
    ...(input.kind === 'subscription'
      ? ['billingModel', 'billingCycle', 'expiryDate']
      : []),
    ...(seatsRequired(input) ? ['seatCount'] : []),
  ],
  repairs: (input) => [
    'expectedReturnAt',
    ...(input.method && input.method !== 'internal' ? ['vendorId'] : []),
  ],
};

const blank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/** Throws on the first value the create dialog would still ask for. */
async function requireDialogFields(
  container: ServiceContainer,
  collection: string,
  input: Row,
): Promise<void> {
  for (const key of REQUIRED_ON_CREATE[collection]?.(input) ?? [])
    if (blank(input[key])) throw new ValidationError(`${key} is required`, key);
  // A device of a category that tracks serials needs one; the category is
  // the model's, read here the way the service reads it on create.
  if (
    collection === 'devices' &&
    blank(input.serialNo) &&
    typeof input.modelId === 'string'
  ) {
    const category = await container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('models')
      .innerJoin('categories', 'categories.id', 'models.categoryId')
      .select('categories.requiresSerial as requiresSerial')
      .where('models.id', '=', input.modelId)
      .executeTakeFirst();
    if (category && Boolean(category.requiresSerial))
      throw new ValidationError(
        'This category requires a serial number',
        'serialNo',
      );
  }
}

/** The conditional requirements, told to the model beside the field list. */
export const CREATE_REQUIREMENTS: string = [
  "devices: ownership and locationId are required; lenderVendorId and returnDueDate when ownership is leased or borrowed; serialNo when the model's category requires serials (laptops, desktops, phones… do — ask for it).",
  'entitlements: licensingModel for a perpetual; billingModel, billingCycle and expiryDate for a subscription; seatCount unless the licence is site / free or the subscription is billed flat.',
  'repairs: expectedReturnAt is required (sentAt defaults to today); vendorId unless the method is internal.',
].join('\n');

/** One line per collection naming its fields: `name`, optional `name?`, enums. */
function describeFields(schema: z.ZodObject): string {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as {
    properties?: Record<
      string,
      { enum?: unknown[]; anyOf?: { enum?: unknown[] }[] }
    >;
    required?: string[];
  };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {})
    .map(([key, property]) => {
      const values =
        property.enum ??
        property.anyOf?.find((option) => option.enum)?.enum ??
        undefined;
      return `${key}${required.has(key) ? '' : '?'}${values ? `(${values.join('|')})` : ''}`;
    })
    .join(', ');
}

export const CREATE_FIELD_GUIDE: string = CREATABLE_COLLECTIONS.map(
  (collection) =>
    `${collection}: ${describeFields(CREATE_TARGETS[collection].schema)}`,
).join('\n');

const title = z
  .string()
  .min(1)
  .max(255)
  .describe(
    'One line naming what this does, in the user\'s language, e.g. "登记设备 MacBook Air 13 M3".',
  );
const id = z.string().min(1).max(64);

export const AI_RECORD_SCHEMAS = {
  itam_create_record: z.object({
    title,
    collection: z.enum(CREATABLE_COLLECTIONS),
    input: z
      .record(z.string(), z.unknown())
      .describe(
        'Field values for the collection, as listed in the tool description.',
      ),
  }),
  itam_stock_in: z.object({
    title,
    stockItemId: id,
    quantity: z.number().int().min(1),
    notes: z.string().max(2000).optional(),
  }),
  itam_issue_stock: z.object({
    title,
    stockItemId: id,
    holderType: z.enum(HOLDER_TYPES),
    holderId: id,
    quantity: z.number().int().min(1),
    notes: z.string().max(2000).optional(),
  }),
  itam_take_back_stock: z.object({
    title,
    stockItemId: id,
    holderType: z.enum(HOLDER_TYPES),
    holderId: id,
    quantity: z.number().int().min(1),
    notes: z.string().max(2000).optional(),
  }),
  itam_receive_purchase_line: z.object({
    title,
    orderId: id,
    lineId: id,
    quantity: z.number().int().min(1).max(10000),
    serialNos: z.array(z.string().max(128)).optional(),
    locationId: id.optional(),
    stockItemId: id.nullable().optional(),
    entitlementId: id.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
} as const;

export type AiRecordTool = keyof typeof AI_RECORD_SCHEMAS;
export const AI_RECORD_TOOLS = Object.keys(AI_RECORD_SCHEMAS) as AiRecordTool[];

/** The grant an operation tool needs; a create asks its collection's `create`. */
const OPERATION_PERMISSIONS: Readonly<
  Record<Exclude<AiRecordTool, 'itam_create_record'>, readonly [string, string]>
> = {
  itam_stock_in: ['stockItems', 'stockIn'],
  itam_issue_stock: ['stockItems', 'issue'],
  itam_take_back_stock: ['stockItems', 'issue'],
  itam_receive_purchase_line: ['purchaseOrders', 'receive'],
};

function parse(tool: AiRecordTool, raw: unknown) {
  const args = AI_RECORD_SCHEMAS[tool].parse(raw);
  if (tool !== 'itam_create_record') return { args, input: undefined };
  const { collection, input } = args as z.infer<
    (typeof AI_RECORD_SCHEMAS)['itam_create_record']
  >;
  // The page's own rules: a field the create dialog may not send is refused.
  return {
    args,
    input: CREATE_TARGETS[collection].schema.strict().parse(input) as Row,
  };
}

/** Arguments and grants, checked before the card offers confirmation. */
export async function screenRecord(
  container: ServiceContainer,
  scope: ActorScope,
  tool: string,
  raw: unknown,
): Promise<{ ok: true } | ({ ok: false } & AiWriteFailure)> {
  const invalid = (error: unknown): { ok: false } & AiWriteFailure => {
    if (error instanceof ValidationError)
      return {
        ok: false,
        code: 'VALIDATION',
        message: error.message,
        field: error.field,
      };
    const issue = error instanceof z.ZodError ? error.issues[0] : undefined;
    return {
      ok: false,
      code: 'VALIDATION',
      message: issue?.message ?? 'Invalid input',
      field: issue?.path.join('.'),
    };
  };
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(tool as AiRecordTool, raw);
  } catch (error) {
    return invalid(error);
  }
  const { args, input } = parsed;
  const [collection, action] =
    tool === 'itam_create_record'
      ? [String((args as { collection: string }).collection), 'create']
      : OPERATION_PERMISSIONS[
          tool as Exclude<AiRecordTool, 'itam_create_record'>
        ];
  // The grant first: a user who may not create one is told that, not
  // which fields it would need.
  if (!(await scope.may(collection, action)))
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: `Not allowed: ${collection}.${action}`,
    };
  try {
    if (input) await requireDialogFields(container, collection, input);
  } catch (error) {
    return invalid(error);
  }
  return { ok: true };
}

/** Runs one confirmed call as the user; a refusal is thrown. */
export async function runRecordTool(
  container: ServiceContainer,
  scope: ActorScope,
  tool: AiRecordTool,
  raw: unknown,
): Promise<Row> {
  try {
    const context: OperationContext = {
      actorId: scope.actorId,
      sourceType: 'aiAction',
    };
    const { args, input } = parse(tool, raw);
    switch (tool) {
      case 'itam_create_record': {
        const { collection } = args as { collection: string };
        await requireDialogFields(container, collection, input!);
        const row = await CREATE_TARGETS[collection].create(
          container,
          input!,
          context,
          scope,
        );
        return {
          collection,
          id: row.id,
          name: row.name ?? row.deviceNo ?? row.repairNo ?? row.orderNo ?? null,
          deviceNo: row.deviceNo ?? null,
        };
      }
      case 'itam_stock_in': {
        const a = args as z.infer<(typeof AI_RECORD_SCHEMAS)['itam_stock_in']>;
        const row = await container
          .resolve(stockServiceToken)
          .stockIn(
            a.stockItemId,
            { quantity: a.quantity, notes: a.notes ?? null },
            context,
            await scope.decide('stockItems', 'stockIn'),
          );
        return { id: row.id, name: row.name, totalQuantity: row.totalQuantity };
      }
      case 'itam_issue_stock':
      case 'itam_take_back_stock': {
        const a = args as z.infer<
          (typeof AI_RECORD_SCHEMAS)['itam_issue_stock']
        >;
        const stock = container.resolve(stockServiceToken);
        const input = {
          holderType: a.holderType,
          holderId: a.holderId,
          quantity: a.quantity,
          notes: a.notes ?? null,
        };
        const conditions = await scope.decide('stockItems', 'issue');
        const row =
          tool === 'itam_issue_stock'
            ? await stock.issue(a.stockItemId, input, context, conditions)
            : await stock.takeBack(a.stockItemId, input, context, conditions);
        return { id: row.id, name: row.name, usedQuantity: row.usedQuantity };
      }
      case 'itam_receive_purchase_line': {
        const {
          title: _title,
          orderId,
          ...receive
        } = args as z.infer<
          (typeof AI_RECORD_SCHEMAS)['itam_receive_purchase_line']
        >;
        const row = await container
          .resolve(procurementServiceToken)
          .receive(
            orderId,
            receive,
            context,
            await scope.decide('purchaseOrders', 'receive'),
          );
        return { id: row.id, orderNo: row.orderNo, status: row.status };
      }
    }
  } catch (error) {
    return refuse(error);
  }
}
