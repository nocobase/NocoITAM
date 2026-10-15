import { databaseManagerToken } from '@nocobase/db';
import type { ServiceContainer } from '@nocobase/service-provider';
import { z } from 'zod';

import { scopeFor, type ActorScope } from '../itam/ai-bridge.js';
import type { ListOptions, ListResult, Row } from '../itam/collection-query.js';
import { today } from '../itam/dates.js';
import { COUNT_FIELDS } from '../itam/devices.js';
import { createDomainAccess, LISTABLE_COLLECTIONS } from '../itam/domains.js';
import {
  auditServiceToken,
  deviceServiceToken,
  entitlementServiceToken,
  historyServiceToken,
  maintenanceServiceToken,
  procurementServiceToken,
  repairServiceToken,
  reportServiceToken,
  settingsServiceToken,
  stockServiceToken,
  workbenchServiceToken,
} from '../itam/index.js';
import { onboardingServiceToken } from '../itam/onboarding.js';
import {
  nameOf,
  referenceNames,
  referenceOf,
} from '../itam/reference-names.js';
import { REPORT_NAMES } from '../itam/reports.js';
import { RecordNotFoundError } from '../itam/errors.js';
import { compileAuthzScope } from '../itam/authz-filter.js';
import { deviceReviewServiceToken } from '../itam/device-review.js';
import { deviceSyncServiceToken } from '../itam/device-sync.js';

/**
 * What ITAM's agent commands read (server/routes/itam/agent-commands.ts),
 * moved from the AI employee plugin's read tools when the assistant moved
 * to the Agents plugin (template 1.0.0-beta.64). Each answers as the person
 * the run works for: a list, a record or a report goes no further than
 * their own `read` grants, exactly as the pages would show them.
 */

export const SEARCHABLE_COLLECTIONS: readonly [string, ...string[]] = [
  ...LISTABLE_COLLECTIONS,
  'repairs',
];

export interface Reader {
  readonly scope: ActorScope;
  readonly actorId: string;
  readonly container: ServiceContainer;
  list(collection: string, options: ListOptions): Promise<ListResult>;
  get(collection: string, id: string): Promise<Row | undefined>;
}

export function readerFor(
  container: ServiceContainer,
  actorId: string,
): Reader {
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

/** Keeps answers small: the fields that identify and describe a record. */
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
  'ownerId',
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
  'hireDate',
  'leaveDate',
  'position',
  'email',
  // An audit item: what the books said and what the count found.
  'label',
  'resolution',
  'bookStatus',
  'bookLocationId',
  'bookAssigneeType',
  'bookAssigneeId',
  'actualStatus',
  'actualLocationId',
  'actualAssigneeType',
  'actualAssigneeId',
  'notes',
  'createdAt',
];

export function summarize(row: Row): Row {
  const summary: Record<string, unknown> = {};
  for (const field of SUMMARY_FIELDS)
    if (row[field] !== undefined && row[field] !== null)
      summary[field] = row[field];
  return summary;
}

/**
 * Adds `<field>Name` beside each reference id, so the assistant speaks of
 * records by name instead of passing ids back to the person. Names come from
 * the lookup the CSV export uses, and only from collections the person may
 * read (account names always, as every page shows them).
 */
export async function withNames(
  reader: Reader,
  rows: readonly Row[],
): Promise<Row[]> {
  const names = await referenceNames(
    reader.container.resolve(databaseManagerToken),
    rows,
    {
      readable: async (collection) =>
        collection === 'user' ||
        Boolean(await reader.scope.may(collection, 'read')),
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

/**
 * The business context a task starts from: today, the currency, the
 * thresholds, the administrator's business notes, what needs attention and
 * what waits for the person, and who they are.
 */
export async function businessContext(reader: Reader): Promise<Row> {
  const settings = reader.container.resolve(settingsServiceToken);
  const [general, thresholds, ai] = await Promise.all([
    settings.get('general'),
    settings.get('thresholds'),
    settings.get('ai'),
  ]);
  const reminders = (await reader.scope.may('reminders', 'read'))
    ? await reader.container.resolve(maintenanceServiceToken).reminderCounts()
    : [];
  const myWork = await reader.container
    .resolve(workbenchServiceToken)
    .myWork(reader.actorId, (collection, action) =>
      reader.scope.may(collection, action),
    );
  // Who is asking: an audit's executors and an approval's approver are user
  // ids, and "my devices" means the person linked to this user.
  const person = await reader.container
    .resolve(databaseManagerToken)
    .query()
    .selectFrom('people')
    .select(['id', 'name'])
    .where('userId', '=', reader.actorId)
    .executeTakeFirst<{ id: string; name: string }>();
  return {
    today: today(),
    me: {
      userId: reader.actorId,
      personId: person?.id ?? null,
      personName: person?.name ?? null,
    },
    currency: general.currency,
    thresholds,
    businessNotes: ai.businessNotes,
    reminders: reminders.filter((entry) => entry.count > 0),
    myWork,
  };
}

export const SearchInput = z.object({
  collection: z.enum(SEARCHABLE_COLLECTIONS),
  q: z.string().max(200).optional(),
  filter: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
  sort: z.string().max(64).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  ids: z.array(z.string().max(64)).max(50).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional(),
});

export async function search(
  reader: Reader,
  input: z.infer<typeof SearchInput>,
): Promise<Row> {
  const result = await reader.list(input.collection, {
    q: input.q,
    filter: input.filter,
    sort: input.sort,
    order: input.order,
    ids: input.ids,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20,
  });
  return {
    total: result.total,
    page: result.page,
    rows: await withNames(reader, result.data.map(summarize)),
  };
}

/**
 * One record with its last history events and a `…Name` beside each
 * reference id; devices with their components, seats and repairs, people
 * with what they hold, entitlements with their seats, stock with its
 * holdings, purchase orders with their lines.
 */
export async function getRecord(
  reader: Reader,
  collection: string,
  id: string,
): Promise<Row> {
  const record = await reader.get(collection, id);
  if (!record) throw new RecordNotFoundError(collection, id);
  const container = reader.container;
  const history = await container
    .resolve(historyServiceToken)
    .events({ subjectType: collection, subjectId: id }, { limit: 8 });
  // Each related collection answers to its own read grant, as its own page
  // would: holding a device does not grant its repairs or seats.
  const related: Record<string, unknown> = {};
  const readable = async (
    related: string,
    rows: () => Promise<readonly Row[]>,
    costFields: readonly string[] = [],
  ): Promise<Row[] | undefined> => {
    const conditions = await reader.scope.may(related, 'read');
    if (!conditions) return undefined;
    const output = conditions.fieldAccess?.output ?? '*';
    return withNames(
      reader,
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
  if (collection === 'devices') {
    related.components = await readable('stockItems', () =>
      stock.holdingsOf('device', id, 'component'),
    );
    related.seats = await readable('entitlements', () =>
      entitlements.seatsOf('device', id),
    );
    related.repairs = await readable(
      'repairs',
      () => container.resolve(repairServiceToken).forDevice(id),
      ['cost', 'currency'],
    );
  } else if (collection === 'people') {
    related.devices = await withNames(
      reader,
      (
        await reader.list('devices', {
          filter: { assigneeType: 'person', assigneeId: id },
          pageSize: 50,
        })
      ).data.map(summarize),
    );
    related.stock = await readable('stockItems', () =>
      stock.holdingsOf('person', id),
    );
    related.seats = await readable('entitlements', () =>
      entitlements.seatsOf('person', id),
    );
  } else if (collection === 'entitlements') {
    related.seats = await withNames(
      reader,
      (await entitlements.seats(id)).map(summarize),
    );
  } else if (collection === 'stockItems') {
    related.holdings = await withNames(
      reader,
      (await stock.holdings(id)).map(summarize),
    );
  } else if (collection === 'auditTasks') {
    // The counted items, differences first: what grouping them by cause
    // and resolving them start from.
    related.items = await readable('auditItems', async () => {
      const items = await container.resolve(auditServiceToken).items(id);
      return [...items]
        .sort(
          (a, b) =>
            Number(b.result === 'mismatch' || b.result === 'missing') -
            Number(a.result === 'mismatch' || a.result === 'missing'),
        )
        .slice(0, 300);
    });
  } else if (collection === 'purchaseOrders') {
    // Each line's id is what receiving one names.
    related.lines = await readable(
      'purchaseOrderLines',
      () => container.resolve(procurementServiceToken).lines(id),
      ['unitPrice'],
    );
  }
  const [named] = await withNames(reader, [record]);
  return {
    record: named,
    related,
    history: history.data.map((event) => ({
      at: event.createdAt,
      type: event.type,
      summary: event.summary,
    })),
  };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const StatsInput = z.object({
  devicesBy: z.enum(COUNT_FIELDS).optional(),
  report: z.enum(REPORT_NAMES).optional(),
  from: day.optional(),
  to: day.optional(),
  locationId: z.string().max(64).optional(),
  departmentId: z.string().max(64).optional(),
  categoryId: z.string().max(64).optional(),
});

/** Devices counted by one field, or one of the preset reports. */
export async function stats(
  reader: Reader,
  input: z.infer<typeof StatsInput>,
): Promise<Row> {
  const conditions = await reader.scope.decide('devices', 'read');
  if (input.devicesBy) {
    const counts = await reader.container
      .resolve(deviceServiceToken)
      .countsBy(input.devicesBy, conditions);
    return { groupBy: input.devicesBy, counts };
  }
  const report = await reader.container.resolve(reportServiceToken).run(
    input.report ?? 'overview',
    {
      from: input.from,
      to: input.to,
      locationId: input.locationId,
      departmentId: input.departmentId,
      categoryId: input.categoryId,
    },
    conditions,
  );
  return {
    report: report.name,
    period: { from: report.filters.from, to: report.filters.to },
    totals: report.totals,
    sections: report.sections.map((section) => ({
      key: section.key,
      rows: section.rows.slice(0, 30),
    })),
  };
}

export const AvailabilityInput = z.object({
  modelId: z.string().max(64).optional(),
  categoryId: z.string().max(64).optional(),
  softwareProductId: z.string().max(64).optional(),
  stockName: z.string().max(100).optional(),
});

/**
 * What can be handed out now: in-stock, unreserved devices of a model or
 * category, stock quantities, and entitlements of a product with free seats.
 */
export async function availability(
  reader: Reader,
  input: z.infer<typeof AvailabilityInput>,
): Promise<Row> {
  const content: Record<string, unknown> = {};
  if (input.modelId || input.categoryId) {
    const filter: Record<string, string> = { view: 'available' };
    if (input.modelId) filter.modelId = input.modelId;
    if (input.categoryId) filter.categoryId = input.categoryId;
    const available = await reader.list('devices', { filter, pageSize: 20 });
    content.availableDevices = {
      total: available.total,
      rows: await withNames(reader, available.data.map(summarize)),
    };
  }
  if (input.stockName) {
    const stock = await reader.list('stockItems', {
      q: input.stockName,
      pageSize: 10,
    });
    content.stock = stock.data.map((row) => ({
      ...summarize(row),
      available: Number(row.totalQuantity) - Number(row.usedQuantity),
    }));
  }
  if (input.softwareProductId) {
    const entitlements = await reader.list('entitlements', {
      filter: { softwareProductId: input.softwareProductId },
      pageSize: 20,
    });
    content.entitlements = entitlements.data.map((row) => ({
      ...summarize(row),
      // No seat count is no limit (site, free, a flat subscription); a count
      // the person may not read says nothing either way.
      freeSeats:
        row.seatCount === null
          ? 'unlimited'
          : row.seatCount === undefined
            ? undefined
            : Number(row.seatCount) - Number(row.assignedCount),
    }));
  }
  return content;
}

/** The registered models, categories and products a description names. */
export async function matchModel(reader: Reader, text: string): Promise<Row> {
  const [models, categories, products] = await Promise.all([
    reader.list('models', { q: text, pageSize: 5 }),
    reader.list('categories', { q: text, pageSize: 5 }),
    reader.list('softwareProducts', { q: text, pageSize: 5 }),
  ]);
  return {
    models: await withNames(reader, models.data.map(summarize)),
    categories: categories.data.map(summarize),
    softwareProducts: await withNames(reader, products.data.map(summarize)),
  };
}

/**
 * 入职配备 for one joiner as the system works it out: the kit, what they
 * have, the proposal for the rest and the shortfall. The choice of device is
 * the service's (`onboarding.ts`), never the model's.
 */
export async function onboardingPlan(
  reader: Reader,
  personId: string,
): Promise<Row> {
  // Read under the person's own grant on people, as the page does.
  const person = await reader.get('people', personId);
  if (!person) throw new RecordNotFoundError('people', personId);
  const plan = await reader.container
    .resolve(onboardingServiceToken)
    .plan(personId);
  return {
    person: {
      id: person.id,
      name: person.name,
      departmentId: person.departmentId,
      position: person.position,
      hireDate: person.hireDate,
      employmentStatus: person.employmentStatus,
    },
    plan,
  };
}

/** What `itam device-sync review` reads (device sync, step 4). */
export const DeviceSyncReviewInput = z.object({
  view: z
    .enum(['checks', 'unregistered', 'unmanaged', 'ignored'])
    .default('checks'),
  deviceId: z.string().min(1).max(64).optional(),
});

/**
 * Where the management platforms and the register disagree, as the person
 * may see it: one view of MDM 核对, or — with a device — that device's
 * platform records and its differences. Differences and devices stay within
 * the person's device `read`; platform records not on the register are
 * listed to whoever may read devices, as the page lists them.
 */
export async function deviceSyncReview(
  reader: Reader,
  input: z.infer<typeof DeviceSyncReviewInput>,
): Promise<Row> {
  const conditions = await reader.scope.decide('devices', 'read');
  const sync = reader.container.resolve(deviceSyncServiceToken);
  const review = reader.container.resolve(deviceReviewServiceToken);
  if (!(await review.active())) return { connected: false, rows: [] };
  if (input.deviceId) {
    if (!(await reader.get('devices', input.deviceId)))
      throw new RecordNotFoundError('devices', input.deviceId);
    return {
      connected: true,
      device: input.deviceId,
      platformRecords: await sync.forDevice(input.deviceId),
      differences: await review.checks({ deviceIds: [input.deviceId] }),
    };
  }
  const inScope = async (ids: readonly string[]) => {
    if (ids.length === 0) return new Set<string>();
    const rows = await reader.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('devices')
      .select('id')
      .where((eb) => compileAuthzScope(eb, conditions.scope))
      .where('id', 'in', [...ids])
      .execute<{ id: string }>();
    return new Set(rows.map((row) => row.id));
  };
  if (input.view === 'checks') {
    const checks = await review.checks();
    const visible = await inScope(checks.map((check) => check.deviceId));
    return {
      connected: true,
      view: input.view,
      rows: checks.filter((check) => visible.has(check.deviceId)),
    };
  }
  if (input.view === 'unmanaged') {
    const rows = await review.unmanaged();
    const visible = await inScope(rows.map((row) => row.id));
    return {
      connected: true,
      view: input.view,
      rows: rows.filter((row) => visible.has(row.id)),
    };
  }
  return {
    connected: true,
    view: input.view,
    rows:
      input.view === 'unregistered'
        ? await review.unregistered()
        : await review.ignored(),
  };
}
