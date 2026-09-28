import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';

import { reportServiceToken } from '../../providers/index.js';
import {
  REPORT_NAMES,
  type ReportResult,
} from '../../providers/itam/reports.js';
import { decideCollection, errorResponse } from './http.js';

/**
 * `/api/itam/reports/:name`: the preset reports. Reading a report needs
 * `read` on `devices` (its record filter and cost visibility apply);
 * `?format=csv` returns every section as one CSV document.
 */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z.object({
  from: date.optional(),
  to: date.optional(),
  locationId: z.string().max(64).optional(),
  departmentId: z.string().max(64).optional(),
  categoryId: z.string().max(64).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

function toCsv(report: ReportResult): string {
  const escape = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : typeof value === 'string'
            ? value
            : typeof value === 'number' || typeof value === 'boolean'
              ? String(value)
              : JSON.stringify(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines: string[] = [];
  for (const section of report.sections) {
    lines.push(`# ${section.key}`);
    lines.push(section.columns.map(escape).join(','));
    for (const row of section.rows)
      lines.push(
        section.columns.map((column) => escape(row[column])).join(','),
      );
    lines.push('');
  }
  lines.push('# totals');
  for (const [key, value] of Object.entries(report.totals))
    lines.push(`${escape(key)},${escape(value)}`);
  // A byte-order mark so spreadsheets open the UTF-8 file correctly.
  return `\uFEFF${lines.join('\n')}\n`;
}

export const reportRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<AuthorizationEnv>();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const reports = app.container.resolve(reportServiceToken);

    routes.use('*', auth.required(), authorization.middleware());

    routes.get('/:name', async (context) => {
      try {
        const name = z.enum(REPORT_NAMES).parse(context.req.param('name'));
        const { format, ...filters } = filtersSchema.parse(
          Object.fromEntries(new URL(context.req.url).searchParams.entries()),
        );
        const conditions = await decideCollection(context, 'devices', 'read');
        const report = await reports.run(name, filters, conditions);
        if (format === 'csv') {
          return context.body(toCsv(report), 200, {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${name}-${report.filters.from}-${report.filters.to}.csv"`,
          });
        }
        return context.json({ data: report });
      } catch (error) {
        return errorResponse(context, error);
      }
    });

    router.route('/itam/reports', routes);
    return router;
  });
