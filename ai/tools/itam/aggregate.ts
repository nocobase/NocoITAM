import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import { z } from 'zod';

import {
  deviceServiceToken,
  reportServiceToken,
} from '../../../server/providers/itam/index.js';
import { COUNT_FIELDS } from '../../../server/providers/itam/devices.js';
import { REPORT_NAMES } from '../../../server/providers/itam/reports.js';
import { runTool, toolServices } from './shared.js';

const schema = z.object({
  devicesBy: z.enum(COUNT_FIELDS).optional(),
  report: z.enum(REPORT_NAMES).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  locationId: z.string().max(64).optional(),
  departmentId: z.string().max(64).optional(),
  categoryId: z.string().max(64).optional(),
});

const tool: ToolsOptions = defineTools({
  scope: 'GENERAL',
  defaultPermission: 'ALLOW',
  introduction: {
    title: 'ITAM: aggregate',
    about: 'Counts devices by a field, or runs one of the preset reports.',
  },
  definition: {
    name: 'itam_aggregate',
    description:
      'Statistics. Either count non-disposed devices grouped by one field (status, categoryId, locationId, departmentId, modelId, manufacturerId), or run a preset report (overview, distribution, costs, perPersonCost, expiry, softwareCompliance, repairs, auditResults, changes) over an optional period and scope. Reports return totals and sections of rows.',
    schema,
  },
  invoke: (ctx, rawArgs: unknown) =>
    runTool(async () => {
      const args = schema.parse(rawArgs);
      const services = toolServices(ctx);
      const conditions = await services.scope.decide('devices', 'read');
      if (args.devicesBy) {
        const counts = await services.container
          .resolve(deviceServiceToken)
          .countsBy(args.devicesBy, conditions);
        return {
          status: 'success',
          content: { groupBy: args.devicesBy, counts },
        };
      }
      const report = await services.container.resolve(reportServiceToken).run(
        args.report ?? 'overview',
        {
          from: args.from,
          to: args.to,
          locationId: args.locationId,
          departmentId: args.departmentId,
          categoryId: args.categoryId,
        },
        conditions,
      );
      return {
        status: 'success',
        content: {
          report: report.name,
          period: { from: report.filters.from, to: report.filters.to },
          totals: report.totals,
          sections: report.sections.map((section) => ({
            key: section.key,
            rows: section.rows.slice(0, 30),
          })),
        },
      };
    }),
});

export default tool;
