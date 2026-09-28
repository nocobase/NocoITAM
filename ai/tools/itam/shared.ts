import {
  defineTools,
  type AgentContext,
  type ToolsOptions,
} from '@nocobase/ai-employee';

import { databaseManagerToken } from '@nocobase/db';

import {
  maintenanceServiceToken,
  settingsServiceToken,
  workbenchServiceToken,
} from '../../../server/providers/itam/index.js';
import {
  aiContainer,
  scopeFor,
  type ActorScope,
} from '../../../server/providers/itam/ai-bridge.js';
import {
  AI_WRITE_SCHEMAS,
  runWrite,
  type AiWriteTool,
} from '../../../server/providers/itam/ai-writes.js';
import {
  AI_RECORD_SCHEMAS,
  runRecordTool,
  type AiRecordTool,
} from '../../../server/routes/itam/ai-records.js';
import type {
  ListOptions,
  ListResult,
  Row,
} from '../../../server/providers/itam/collection-query.js';
import {
  nameOf,
  referenceNames,
  referenceOf,
} from '../../../server/providers/itam/reference-names.js';
import {
  createDomainAccess,
  LISTABLE_COLLECTIONS,
} from '../../../server/providers/itam/domains.js';

/**
 * What every ITAM tool needs: the services, and an authorization scope for
 * the person talking to the assistant. A tool never sees more than that
 * person may see through the pages; a write tool runs only once that
 * person confirmed its card, and then as them.
 */
export type ItamAgentContext = AgentContext<unknown, unknown>;

export const SEARCHABLE_COLLECTIONS: readonly [string, ...string[]] = [
  ...LISTABLE_COLLECTIONS,
  'repairs',
];

export interface ToolServices {
  readonly scope: ActorScope;
  readonly actorId: string;
  list(collection: string, options: ListOptions): Promise<ListResult>;
  get(collection: string, id: string): Promise<Row | undefined>;
  readonly container: ReturnType<typeof aiContainer>;
}

export function toolServices(ctx: ItamAgentContext): ToolServices {
  const container = aiContainer();
  const actorId = String(ctx.actor.id);
  const scope = scopeFor(container, actorId);
  const domains = createDomainAccess(container);
  return {
    scope,
    actorId,
    container,
    async list(collection, options) {
      return domains.list(
        collection,
        options,
        await scope.decide(collection, 'read'),
      );
    },
    async get(collection, id) {
      return domains.get(
        collection,
        id,
        await scope.decide(collection, 'read'),
      );
    },
  };
}

/** Keeps tool output small: the fields that identify and describe a record. */
const SUMMARY_FIELDS = [
  'id',
  'deviceNo',
  'orderNo',
  'disposalNo',
  'repairNo',
  'name',
  'type',
  'kind',
  'appliesTo',
  'status',
  'serialNo',
  'modelId',
  'categoryId',
  'locationId',
  'departmentId',
  'assigneeType',
  'assigneeId',
  'requesterId',
  'vendorId',
  'deviceId',
  'entitlementId',
  'stockItemId',
  'softwareProductId',
  'holderType',
  'holderId',
  'account',
  'quantity',
  'itemType',
  'unitPrice',
  'receivedQuantity',
  'method',
  'faultDescription',
  'result',
  'cost',
  'currency',
  'sentAt',
  'expectedReturnAt',
  'actualReturnAt',
  'seatCount',
  'assignedCount',
  'complianceStatus',
  'totalQuantity',
  'usedQuantity',
  'minimumQuantity',
  'warrantyEndDate',
  'expiryDate',
  'endDate',
  'expectedReturnDate',
  'purchaseDate',
  'purchasePrice',
  'bookValue',
  'employmentStatus',
  'email',
  'createdAt',
];

export function summarize(row: Row): Row {
  const summary: Record<string, unknown> = {};
  for (const field of SUMMARY_FIELDS) {
    if (row[field] !== undefined && row[field] !== null)
      summary[field] = row[field];
  }
  return summary;
}

/**
 * Adds `<field>Name` beside each reference id, so the assistant speaks of
 * records by name instead of passing UUIDs back to the user. Names come
 * from the same lookup the CSV export uses, and only from collections the
 * user may read (account names always, as every page shows them).
 */
export async function withNames(
  services: ToolServices,
  rows: readonly Row[],
): Promise<Row[]> {
  const names = await referenceNames(
    services.container.resolve(databaseManagerToken),
    rows,
    {
      readable: async (collection) =>
        collection === 'user' ||
        Boolean(await services.scope.may(collection, 'read')),
    },
  );
  return rows.map((row) => {
    const named: Record<string, unknown> = { ...row };
    for (const field of Object.keys(row)) {
      if (!referenceOf(row, field)) continue;
      const name = nameOf(names, row, field);
      if (name !== row[field] && typeof name === 'string' && name)
        named[`${field.replace(/Ids?$/, '')}Name`] = name;
    }
    return named;
  });
}

export { maintenanceServiceToken, settingsServiceToken, workbenchServiceToken };

/**
 * Runs a tool body and turns any failure (a denied permission, a missing
 * record, a validation error) into an error result the model can explain,
 * instead of an exception that ends the conversation turn.
 */
export async function runTool(
  body: () => Promise<{ status: string; content: unknown }>,
): Promise<{ status: string; content: unknown }> {
  try {
    return await body();
  } catch (error) {
    return {
      status: 'error',
      content: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * A write tool: held by the plugin (ASK) until the user confirms the card
 * in the conversation, then run as that user through the page's own
 * service (`server/providers/itam/ai-writes.ts`). A refusal is thrown so
 * the plugin records it as the call's result.
 */
export function writeTool(
  name: AiWriteTool,
  introduction: { readonly title: string; readonly about: string },
  description: string,
): ToolsOptions<ItamAgentContext> {
  return defineTools<ItamAgentContext>({
    scope: 'GENERAL',
    execution: 'backend',
    defaultPermission: 'ASK',
    introduction,
    definition: {
      name,
      description: `${description} Nothing is written until the user confirms the card; include a one-line "title". Ids must come from earlier tool results.`,
      schema: AI_WRITE_SCHEMAS[name],
    },
    invoke: async (ctx, rawArgs: unknown) => {
      const services = toolServices(ctx);
      return {
        status: 'success',
        content: {
          ...(await runWrite(
            services.container,
            services.scope,
            name,
            rawArgs,
          )),
          // What ran: the user may have corrected the proposal on its card,
          // so the model and the settled card read the values from here.
          values: rawArgs,
        },
      };
    },
  });
}

/**
 * A create or stock / receiving tool (`server/routes/itam/ai-records.ts`):
 * held for confirmation like `writeTool`, validated by the page's own input
 * schema, run through the page's own service as the confirming user.
 */
export function recordTool(
  name: AiRecordTool,
  introduction: { readonly title: string; readonly about: string },
  description: string,
): ToolsOptions<ItamAgentContext> {
  return defineTools<ItamAgentContext>({
    scope: 'GENERAL',
    execution: 'backend',
    defaultPermission: 'ASK',
    introduction,
    definition: {
      name,
      description: `${description} Nothing is written until the user confirms the card; include a one-line "title". Ids must come from earlier tool results.`,
      schema: AI_RECORD_SCHEMAS[name],
    },
    invoke: async (ctx, rawArgs: unknown) => {
      const services = toolServices(ctx);
      return {
        status: 'success',
        content: {
          ...(await runRecordTool(
            services.container,
            services.scope,
            name,
            rawArgs,
          )),
          // What ran, as in `writeTool`.
          values: rawArgs,
        },
      };
    },
  });
}
