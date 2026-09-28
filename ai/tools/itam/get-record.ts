import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import type { Row } from '../../../server/providers/itam/collection-query.js';
import {
  historyServiceToken,
  entitlementServiceToken,
  procurementServiceToken,
  repairServiceToken,
  stockServiceToken,
} from '../../../server/providers/itam/index.js';
import {
  SEARCHABLE_COLLECTIONS,
  summarize,
  runTool,
  toolServices,
  withNames,
} from './shared.js';

const schema = z.object({
  collection: z.enum(SEARCHABLE_COLLECTIONS),
  id: z.string().min(1).max(64),
});

const tool: ToolsOptions = defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: get record',
    about:
      'Reads one record with its recent history and, for devices and people, what is attached to it.',
  },
  definition: {
    name: 'itam_get_record',
    description:
      "Get one ITAM record by id, with its last history events and a `…Name` beside each reference id. Devices also return their components, seats and repairs; people the devices, stock holdings (stockItemId, quantity) and seats (entitlementId) they hold; entitlements their current seats; stock records their holdings; purchase orders their lines (a line's id is the lineId receiving names).",
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      const record = await services.get(args.collection, args.id);
      if (!record) return { status: 'error', content: 'Record not found' };
      const container = services.container;
      const history = await container
        .resolve(historyServiceToken)
        .events(
          { subjectType: args.collection, subjectId: args.id },
          { limit: 8 },
        );
      // Each related collection answers to its own read grant, as its own
      // page would: holding a device does not grant its repairs or seats.
      const related: Record<string, unknown> = {};
      const readable = async (
        collection: string,
        rows: () => Promise<readonly Row[]>,
        costFields: readonly string[] = [],
      ): Promise<Row[] | undefined> => {
        const conditions = await services.scope.may(collection, 'read');
        if (!conditions) return undefined;
        const output = conditions.fieldAccess?.output ?? '*';
        return withNames(
          services,
          (await rows()).map((row) => {
            const summary: Record<string, unknown> = { ...summarize(row) };
            if (output !== '*')
              for (const field of costFields)
                if (!output.includes(field)) delete summary[field];
            return summary;
          }),
        );
      };
      const stock = container.resolve(stockServiceToken);
      const entitlements = container.resolve(entitlementServiceToken);
      if (args.collection === 'devices') {
        related.components = await readable('stockItems', () =>
          stock.holdingsOf('device', args.id, 'component'),
        );
        related.seats = await readable('entitlements', () =>
          entitlements.seatsOf('device', args.id),
        );
        related.repairs = await readable(
          'repairs',
          () => container.resolve(repairServiceToken).forDevice(args.id),
          ['cost', 'currency'],
        );
      } else if (args.collection === 'people') {
        related.devices = await withNames(
          services,
          (
            await services.list('devices', {
              filter: { assigneeType: 'person', assigneeId: args.id },
              pageSize: 50,
            })
          ).data.map(summarize),
        );
        related.stock = await readable('stockItems', () =>
          stock.holdingsOf('person', args.id),
        );
        related.seats = await readable('entitlements', () =>
          entitlements.seatsOf('person', args.id),
        );
      } else if (args.collection === 'entitlements') {
        // Who holds a seat now: what reclaiming or reassigning starts from.
        related.seats = await withNames(
          services,
          (await entitlements.seats(args.id)).map(summarize),
        );
      } else if (args.collection === 'stockItems') {
        related.holdings = await withNames(
          services,
          (await stock.holdings(args.id)).map(summarize),
        );
      } else if (args.collection === 'purchaseOrders') {
        // Each line's id is what receiving one names.
        related.lines = await readable(
          'purchaseOrderLines',
          () => container.resolve(procurementServiceToken).lines(args.id),
          ['unitPrice'],
        );
      }
      const [named] = await withNames(services, [record]);
      return {
        status: 'success',
        content: {
          record: named,
          related,
          history: history.data.map((event) => ({
            at: event.createdAt,
            type: event.type,
            summary: event.summary,
          })),
        },
      };
    }),
});

export default tool;
