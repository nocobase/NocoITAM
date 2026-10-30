import type {
  AuthorizationEnv,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization/server';
import type { Context, MiddlewareHandler } from 'hono';
import type { ZodError } from 'zod';

import {
  BusinessRuleError,
  DeleteBlockedError,
  DuplicateValueError,
  RecordNotFoundError,
  UnauthorizedFieldsError,
  ValidationError,
} from '../../providers/itam/errors.js';
import {
  decideWith,
  type Authorize,
} from '../../providers/itam/authz-resources.js';
import type { ListOptions } from '../../providers/itam/master-data.js';

/** Shared HTTP plumbing for the ITAM routes: decisions, query parsing, errors. */
export type ItamContext = Context<AuthorizationEnv>;

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN' as const;
}

/**
 * The conditions one request works under: the Collection's own actions
 * directly, a business operation through the resource declared for it. The
 * decision itself is `decideWith` in `providers/itam/authz-resources.ts`,
 * which the AI tools share.
 */
export async function decideFor(
  context: ItamContext,
  collection: string,
  action: string,
  params?: DatabaseAuthorizationParams,
): Promise<DatabaseAuthorizationConditions> {
  const authz = context.get('authz');
  // The plugin's `authorize` is overloaded per resource type; this decision
  // spans two of them, so it is taken through the common shape.
  const authorize = authz.authorize.bind(authz) as unknown as Authorize;
  const conditions = await decideWith(authorize, collection, action, params);
  if (!conditions) throw new ForbiddenError('Not allowed');
  return conditions;
}

/**
 * Refuses a caller who does not hold `action` on `resource` outright — for a
 * settings item, which has no record scope. `require` throws the plugin's
 * `AuthorizationDeniedError`, whose own response is the 403. (The plugin's
 * `guard` middleware, which this replaced, went with authorization
 * 0.2.0-beta.21.)
 */
export const requireGrant =
  (
    resource: { readonly type: string; readonly id: string },
    action: string,
  ): MiddlewareHandler<AuthorizationEnv> =>
  async (context, next) => {
    await context.get('authz').require({ resource, action });
    await next();
  };

/** Which stream a history request wants; `all` is the merged timeline. */
export function historyKind(
  context: ItamContext,
): 'all' | 'events' | 'changes' {
  const kind = new URL(context.req.url).searchParams.get('kind');
  return kind === 'changes' ? 'changes' : kind === 'events' ? 'events' : 'all';
}

/** Decides an action on another collection than the route's own (related lists). */
export async function decideCollection(
  context: ItamContext,
  collection: string,
  action: string,
): Promise<DatabaseAuthorizationConditions> {
  return decideFor(context, collection, action);
}

/**
 * The same decision, answered with `undefined` rather than a refusal.
 *
 * For a handler that reads several collections to answer one question and
 * leaves out the ones this caller may not read: refusing the whole request
 * because one of them is beyond them would make the answer depend on the
 * widest grant anybody holds.
 */
export async function maybeDecide(
  context: ItamContext,
  collection: string,
  action: string,
): Promise<DatabaseAuthorizationConditions | undefined> {
  const authz = context.get('authz');
  const authorize = authz.authorize.bind(authz) as unknown as Authorize;
  return (await decideWith(authorize, collection, action)) ?? undefined;
}

/**
 * The context a service writes history with. Each call opens one operation:
 * the id it carries is what lets the timeline fold an event's own field
 * changes into it, so a handler builds it once and passes it down.
 */
export function operationContextOf(
  context: ItamContext,
  extra: Readonly<Record<string, unknown>> = {},
): { readonly actorId: string; readonly operationId: string } & Readonly<
  Record<string, unknown>
> {
  return {
    actorId: principalId(context),
    operationId: crypto.randomUUID(),
    ...extra,
  };
}

/**
 * The caller holds the platform's administrator set, `root` (2026-10-30):
 * the authorization core permits it everything without a grant, and it may
 * delete a record past the business rules that keep a record with a life
 * recorded — only another record still depending on it stops it.
 */
export async function isUnrestricted(context: ItamContext): Promise<boolean> {
  return (await context.get('authz').snapshot()).unrestricted;
}

export function principalId(context: ItamContext): string {
  return context.get('authz').identity.principal.id;
}

export function parseListOptions(context: ItamContext): ListOptions {
  const url = new URL(context.req.url);
  const params = url.searchParams;
  const filter: Record<string, string | string[]> = {};
  for (const [key, value] of params.entries()) {
    const match = /^filter\[(.+)]$/.exec(key);
    if (!match) continue;
    const field = match[1];
    const existing = filter[field];
    if (existing === undefined) filter[field] = value;
    else
      filter[field] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
  }
  const ids = params.get('ids');
  return {
    page: numberParam(params.get('page')),
    pageSize: numberParam(params.get('pageSize')),
    sort: params.get('sort') ?? undefined,
    order: params.get('order') === 'desc' ? 'desc' : 'asc',
    q: params.get('q') ?? undefined,
    filter,
    ids: ids ? ids.split(',').filter(Boolean) : undefined,
  };
}

function numberParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function readJsonObject(
  context: ItamContext,
): Promise<Record<string, unknown>> {
  const body: unknown = await context.req.json().catch(() => undefined);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/** Maps domain errors to responses; anything else is rethrown. */
export function errorResponse(context: ItamContext, error: unknown): Response {
  if (
    error instanceof ForbiddenError ||
    error instanceof UnauthorizedFieldsError
  ) {
    return context.json(
      {
        code: 'FORBIDDEN',
        message: error.message,
        ...(error instanceof UnauthorizedFieldsError
          ? { fields: error.fields }
          : {}),
      },
      403,
    );
  }
  if (error instanceof RecordNotFoundError) {
    return context.json({ code: 'NOT_FOUND', message: error.message }, 404);
  }
  if (error instanceof DuplicateValueError) {
    return context.json(
      { code: 'DUPLICATE', message: error.message, field: error.field },
      409,
    );
  }
  if (error instanceof DeleteBlockedError) {
    return context.json(
      { code: 'DELETE_BLOCKED', message: error.message, impact: error.impact },
      409,
    );
  }
  if (error instanceof BusinessRuleError) {
    return context.json(
      { code: 'BUSINESS_RULE', message: error.message, rule: error.rule },
      422,
    );
  }
  if (error instanceof ValidationError) {
    return context.json(
      { code: 'VALIDATION', message: error.message, field: error.field },
      400,
    );
  }
  if (isZodError(error)) {
    return context.json(
      {
        code: 'VALIDATION',
        message: 'Invalid input',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400,
    );
  }
  throw error;
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray(error.issues) &&
    (error as { name?: unknown }).name === 'ZodError'
  );
}
