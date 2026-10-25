import type { DatabaseManager } from '@nocobase/db';

import { addDays } from './dates.js';
import type { PlanService } from './plans.js';

/**
 * Asset Steward conversations the demo comes with (2026-10-25): real
 * conversations, held on 13002 right after an import and turned into
 * fixtures (`demo-conversations/<language>.ts`), so a trial opens on the
 * assistant's chat list with something to read and two plans to confirm,
 * without a model — cn and global have none.
 *
 * A fixture keeps what the chat shows: the questions, the steps the
 * assistant took (each tool and its input) and its answers. Tool results and
 * the model's reasoning are left out (each answer's results ran to tens of
 * KB of records the import replaces anyway). What changes with every import
 * is a placeholder:
 *
 * - `{{date:N}}` and its forms (`md`, `mon`, `dmon`, with `f` for a full
 *   month name and `y` for a year) — N days from the import day;
 * - `{{no:<table>:<rank>:<number>}}` — the number of the demo's rank-th
 *   record of that kind, by number, the number as captured standing in
 *   when there is no such record;
 * - `{{ref:<kind>:<key>}}` — a record's id, found by what stays the same
 *   between imports (a device by rank, a person by e-mail, a stock item or
 *   an entitlement by name).
 *
 * A conversation goes to the importer and, without its plan, to the demo's
 * staff whose role it fits; a plan only ever goes to the importer, as the
 * same plan twice would be two cards to confirm.
 */

export type DemoConversationOwner =
  'importer' | 'approver' | 'writer' | 'support';

type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

export type DemoConversationPart =
  | { readonly type: 'step-start' }
  | { readonly type: 'tool'; readonly tool: string; readonly input: Json }
  | { readonly type: 'text'; readonly text: string };

export interface DemoConversationFixture {
  readonly key: string;
  readonly owners: readonly DemoConversationOwner[];
  readonly turns: readonly {
    readonly user: string;
    readonly parts: readonly DemoConversationPart[];
  }[];
  readonly plan?: {
    readonly title: string;
    readonly summary: string | null;
    readonly steps: readonly {
      readonly op: string;
      readonly ref: string | null;
      readonly params: Json;
    }[];
  };
}

export interface DemoConversationSet {
  readonly language: string;
  /** The currency the demo's prices were in when the answers were given. */
  readonly currency: string;
  readonly conversations: readonly DemoConversationFixture[];
}

/** What the demo needs to write conversations; absent in a bare harness. */
export interface DemoConversations {
  readonly plans: PlanService;
  /**
   * The OnlineAgent binding a new Asset Steward conversation is saved with
   * (`assistantBinding` in `itam-agents/assistant.ts`): what the plugin
   * restores when someone carries one of these conversations on. Null when
   * the Agents plugin is not there.
   */
  binding(userId: string): Promise<Json | null>;
  /** A conversation or message id, of the kind the plugin makes. */
  nextId(): string;
}

/** Where a numbered record kind lives, as fixtures name it. */
const NUMBERED: Readonly<
  Record<string, { readonly collection: string; readonly column: string }>
> = {
  devices: { collection: 'devices', column: 'deviceNo' },
  purchase_orders: { collection: 'purchaseOrders', column: 'orderNo' },
  disposals: { collection: 'disposals', column: 'disposalNo' },
  repairs: { collection: 'repairs', column: 'repairNo' },
};

/** A `ref:` kind found by rank, and the table its rank counts in. */
const RANKED: Readonly<Record<string, string>> = {
  device: 'devices',
  purchaseOrder: 'purchase_orders',
  disposal: 'disposals',
  repair: 'repairs',
};

/** A `ref:` kind found by one column, among the demo's records. */
const BY_COLUMN: Readonly<
  Record<string, { readonly collection: string; readonly column: string }>
> = {
  person: { collection: 'people', column: 'email' },
  personName: { collection: 'people', column: 'name' },
  stockItem: { collection: 'stockItems', column: 'name' },
  entitlement: { collection: 'entitlements', column: 'name' },
  vendor: { collection: 'vendors', column: 'name' },
  auditTask: { collection: 'auditTasks', column: 'name' },
  location: { collection: 'locations', column: 'name' },
};

const PLACEHOLDER = /\{\{(\w+):([^}]*)\}\}/g;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAY = 86_400_000;
/**
 * A step's result, which the demo does not keep. The page never shows a
 * result (each tool's public projection hides what it read); a model
 * carrying the conversation on reads this and looks again.
 */
const OMITTED =
  'Not kept in the demo data; call the tool again for the current result.';
/** A plan the demo proposes stays open while the demo is there. */
const PLAN_OPEN_DAYS = 365;

/** A date placeholder's text, from the import day. */
export function demoDate(kind: string, offset: number, today: string): string {
  const date = addDays(today, offset);
  const [year, month, day] = date.split('-');
  const name = MONTHS[Number(month) - 1] ?? '';
  const base = kind.replace(/f?y?$/, '');
  const full = /f/.test(kind.slice(base.length));
  const withYear = kind.endsWith('y');
  const monthName = full ? name : name.slice(0, 3);
  const dayNumber = String(Number(day));
  switch (base) {
    case 'date':
      return date;
    case 'md':
      return `${month}-${day}`;
    case 'mon':
      return withYear
        ? `${monthName} ${dayNumber}, ${year}`
        : `${monthName} ${dayNumber}`;
    case 'dmon':
      return withYear
        ? `${dayNumber} ${monthName} ${year}`
        : `${dayNumber} ${monthName}`;
    default:
      return date;
  }
}

/** Every placeholder of a kind in a fixture, as `[kind, body]`. */
function placeholders(value: unknown): [string, string][] {
  const found: [string, string][] = [];
  const walk = (item: unknown): void => {
    if (typeof item === 'string')
      for (const match of item.matchAll(PLACEHOLDER))
        found.push([match[1] ?? '', match[2] ?? '']);
    else if (Array.isArray(item)) item.forEach(walk);
    else if (item && typeof item === 'object')
      Object.values(item).forEach(walk);
  };
  walk(value);
  return found;
}

interface Lookups {
  readonly today: string;
  /** A numbered kind's demo records' numbers and ids, by number. */
  readonly ranked: ReadonlyMap<
    string,
    readonly { readonly id: string; readonly number: string }[]
  >;
  /** `kind:key` to id. */
  readonly refs: ReadonlyMap<string, string>;
}

/** A fixture string with its placeholders filled; `missing` collects refs it could not. */
function fill(text: string, lookups: Lookups, missing: string[]): string {
  return text.replace(PLACEHOLDER, (whole, kind: string, body: string) => {
    if (kind === 'no') {
      const [table = '', rank = '', fallback = ''] = body.split(':');
      return lookups.ranked.get(table)?.[Number(rank) - 1]?.number ?? fallback;
    }
    if (kind === 'ref') {
      const id = lookups.refs.get(body);
      if (id) return id;
      missing.push(body);
      return body.slice(body.indexOf(':') + 1);
    }
    const offset = Number(body);
    return Number.isFinite(offset)
      ? demoDate(kind, offset, lookups.today)
      : whole;
  });
}

function fillJson(value: Json, lookups: Lookups, missing: string[]): Json {
  if (typeof value === 'string') return fill(value, lookups, missing);
  if (Array.isArray(value))
    return value.map((item: Json) => fillJson(item, lookups, missing));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        fillJson(item, lookups, missing),
      ]),
    );
  return value;
}

async function lookups(
  database: DatabaseManager,
  set: DemoConversationSet,
  today: string,
): Promise<Lookups> {
  const query = database.query();
  const tracked = async (collection: string): Promise<string[]> =>
    (
      await query
        .selectFrom('demoRecords')
        .select('recordId')
        .where('collection', '=', collection)
        .execute<{ recordId: unknown }>()
    ).map((row) => String(row.recordId));
  const ranked = new Map<string, { id: string; number: string }[]>();
  for (const [table, { collection, column }] of Object.entries(NUMBERED)) {
    const ids = await tracked(collection);
    const rows = ids.length
      ? await query
          .selectFrom(collection)
          .select(['id', column])
          .where('id', 'in', ids)
          .orderBy(column)
          .execute<Record<string, unknown>>()
      : [];
    ranked.set(
      table,
      rows.map((row) => ({ id: String(row.id), number: String(row[column]) })),
    );
  }
  const refs = new Map<string, string>();
  const wanted = new Set(
    placeholders(set)
      .filter(([kind]) => kind === 'ref')
      .map(([, body]) => body),
  );
  for (const body of wanted) {
    const at = body.indexOf(':');
    const kind = body.slice(0, at);
    const key = body.slice(at + 1);
    if (RANKED[kind]) {
      const id = ranked.get(RANKED[kind])?.[Number(key) - 1]?.id;
      if (id) refs.set(body, id);
      continue;
    }
    if (kind === 'seat') {
      const [entitlement = '', account = ''] = key.split('|');
      const seat = await query
        .selectFrom('entitlementSeats')
        .innerJoin(
          'entitlements',
          'entitlements.id',
          'entitlementSeats.entitlementId',
        )
        .select(['entitlementSeats.id as id'])
        .where('entitlements.name', '=', entitlement)
        .where('entitlementSeats.account', '=', account)
        .where('entitlementSeats.releasedAt', 'is', null)
        .executeTakeFirst<{ id: unknown }>();
      if (seat) refs.set(body, String(seat.id));
      continue;
    }
    const target = BY_COLUMN[kind];
    if (!target) continue;
    // The demo's own record first, else any of that name (a seeded vendor).
    const ids = await tracked(target.collection);
    const own = ids.length
      ? await query
          .selectFrom(target.collection)
          .select('id')
          .where(target.column, '=', key)
          .where('id', 'in', ids)
          .executeTakeFirst<{ id: unknown }>()
      : undefined;
    const row =
      own ??
      (await query
        .selectFrom(target.collection)
        .select('id')
        .where(target.column, '=', key)
        .executeTakeFirst<{ id: unknown }>());
    if (row) refs.set(body, String(row.id));
  }
  return { today, ranked, refs };
}

/**
 * Writes the set's conversations for whoever of `owners` there is, each a
 * few minutes apart and finishing just now, with the importer's plans; every
 * conversation and plan is tracked so clearing the demo takes it. Nothing is
 * written without the Agents plugin, or when the register's currency is not
 * the one the answers were given in — their amounts would be wrong.
 */
export async function seedDemoConversations(options: {
  readonly database: DatabaseManager;
  readonly conversations: DemoConversations;
  readonly set: DemoConversationSet;
  readonly currency: string;
  readonly owners: Partial<Record<DemoConversationOwner, string>>;
  readonly today: string;
  readonly track: (collection: string, id: string) => Promise<void>;
}): Promise<void> {
  const { database, conversations, set, owners } = options;
  if (set.currency !== options.currency) return;
  const binding = owners.importer
    ? await conversations.binding(owners.importer)
    : null;
  if (!binding) return;
  const values = await lookups(database, set, options.today);
  const model = modelOf(binding);
  const query = database.query();
  const now = Date.now();
  const entries = set.conversations.flatMap((fixture) =>
    fixture.owners
      .map((owner) => ({ fixture, owner, userId: owners[owner] }))
      .filter(
        (entry): entry is typeof entry & { userId: string } =>
          entry.userId !== undefined,
      ),
  );
  for (const [index, { fixture, owner, userId }] of entries.entries()) {
    const missing: string[] = [];
    const id = conversations.nextId();
    // Two minutes apart, the fixture's first the newest (2026-10-25): it
    // heads the chat's list, and ✨ opens the latest conversation, so a
    // visitor lands on the leaver's, with its plan to confirm.
    let at = now - (index + 1) * 2 * 60_000;
    const stamp = () => new Date((at += 1500)).toISOString();
    const firstQuestion = fill(fixture.turns[0]?.user ?? '', values, missing);
    const createdAt = stamp();
    await query
      .insertInto('agConversations')
      .values({
        id,
        userId,
        agentId: '0',
        mode: 'online',
        modelService: model?.service ?? null,
        model: model?.model ?? null,
        fallbackFromAgentId: null,
        title: firstQuestion.slice(0, 200),
        titleSource: 'auto',
        category: 'chat',
        source: 'panel',
        read: true,
        thread: 0,
        lastSeq: fixture.turns.length * 2,
        syncRunId: null,
        syncSeq: 0,
        lastMessageAt: createdAt,
        archivedAt: null,
        lockedAt: null,
        createdAt,
        updatedAt: createdAt,
        metadata: binding,
        showInChatList: true,
      })
      .execute();
    let seq = 0;
    for (const turn of fixture.turns) {
      const user = fill(turn.user, values, missing);
      const clientId = crypto.randomUUID();
      const turnId = conversations.nextId();
      const askedAt = stamp();
      seq += 1;
      await query
        .insertInto('agConversationMessages')
        .values({
          id: clientId,
          conversationId: id,
          seq,
          role: 'user',
          content: {
            type: 'text',
            content: user,
            original: {
              id: clientId,
              role: 'user',
              metadata: {
                conversationId: id,
                createdAt: askedAt,
                revision: 1,
                seq,
                executionId: turnId,
                turnId,
                clientId,
              },
              parts: [{ type: 'text', text: user }],
            },
          },
          searchText: user,
          toolCalls: null,
          attachments: null,
          workContext: null,
          metadata: { clientId },
          runId: null,
          runEventSeq: null,
          createdAt: askedAt,
          updatedAt: askedAt,
        })
        .execute();
      const parts = turn.parts.map((part) => {
        if (part.type === 'text')
          return { type: 'text', text: fill(part.text, values, missing) };
        if (part.type === 'tool')
          return {
            type: `tool-${part.tool}`,
            toolCallId: `call_demo_${crypto.randomUUID().slice(0, 12)}`,
            state: 'output-available',
            input: fillJson(part.input, values, missing),
            output: OMITTED,
          };
        return { type: 'step-start' };
      });
      const answer = parts
        .filter((part) => part.type === 'text')
        .map((part) => (part as { text: string }).text)
        .join('\n');
      const answerId = conversations.nextId();
      const answeredAt = stamp();
      seq += 1;
      await query
        .insertInto('agConversationMessages')
        .values({
          id: answerId,
          conversationId: id,
          seq,
          role: 'assistant',
          content: {
            type: 'text',
            content: answer,
            original: {
              id: answerId,
              role: 'assistant',
              metadata: {
                conversationId: id,
                createdAt: answeredAt,
                agentId: 'online',
                turnId,
                sourceUserMessageId: clientId,
                executionId: turnId,
                revision: 1,
                seq,
              },
              parts: [
                ...parts,
                {
                  type: 'data-notice',
                  id: 'execution-status',
                  data: { type: 'completed', title: 'Completed' },
                },
              ],
            },
          },
          searchText: answer,
          toolCalls: null,
          attachments: null,
          workContext: null,
          metadata: { nativeOutcome: 'completed' },
          runId: null,
          runEventSeq: null,
          createdAt: answeredAt,
          updatedAt: answeredAt,
        })
        .execute();
      await query
        .updateTable('agConversations')
        .set({ lastMessageAt: answeredAt, updatedAt: answeredAt })
        .where('id', '=', id)
        .execute();
    }
    await options.track('agConversations', id);
    if (owner === 'importer' && fixture.plan)
      await proposePlan(options, values, fixture.plan, userId, id);
  }
}

/** The importer's plan, through the plan service as Asset Steward made it. */
async function proposePlan(
  options: Parameters<typeof seedDemoConversations>[0],
  values: Lookups,
  plan: NonNullable<DemoConversationFixture['plan']>,
  userId: string,
  conversationId: string,
): Promise<void> {
  const missing: string[] = [];
  const steps = plan.steps.map((step) => ({
    op: step.op,
    ...(step.ref ? { ref: step.ref } : {}),
    params: fillJson(step.params, values, missing) as Record<string, unknown>,
  }));
  // A step naming a record this import does not have would be refused, or
  // worse, act on another; the conversation stands without its card.
  if (missing.length) return;
  try {
    const created = await options.conversations.plans.create(
      userId,
      {
        title: fill(plan.title, values, missing),
        ...(plan.summary
          ? { summary: fill(plan.summary, values, missing) }
          : {}),
        steps,
      },
      {
        agentId: null,
        agentName: 'Asset Steward',
        runId: null,
        conversationId,
      },
    );
    // A plan Asset Steward proposes expires after a day; the demo's waits
    // as long as the demo is there, since a trial is opened days later.
    await options.database
      .query()
      .updateTable('itamPlans')
      .set({ expiresAt: new Date(Date.now() + PLAN_OPEN_DAYS * DAY) })
      .where('id', '=', created.id)
      .execute();
    await options.track('itamPlans', created.id);
  } catch {
    // The plan service refused it (a step no longer applies): the answer
    // still reads, without a card.
  }
}

/** The model a binding names first, as the conversation's columns hold it. */
function modelOf(
  binding: Json,
): { service: string; model: string } | undefined {
  const config = (binding as { onlineAgent?: { config?: { model?: Json } } })
    .onlineAgent?.config;
  const models: unknown = config?.model;
  const first: unknown = Array.isArray(models) ? models[0] : undefined;
  if (typeof first !== 'string' || !first.includes('/')) return undefined;
  const [service = '', ...rest] = first.split('/');
  return { service, model: rest.join('/') };
}
