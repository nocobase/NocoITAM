import type {
  AuthorizationEnv,
  DatabaseAuthorizationConditions,
  DatabaseAuthorizationParams,
} from '@nocobase/app-plugin-authorization/server';
import { Hono, type MiddlewareHandler } from 'hono';

import type { ZodObject, ZodRawShape } from 'zod';

import type {
  ListOptions,
  ListResult,
  Row,
} from '../../providers/itam/collection-query.js';
import type {
  DeleteImpact,
  DeleteOptions,
} from '../../providers/itam/errors.js';
import type { HistoryService } from '../../providers/itam/history.js';
import type { OperationContext } from '../../providers/itam/devices.js';
import {
  decideFor,
  errorResponse,
  historyKind,
  isUnrestricted,
  operationContextOf,
  parseListOptions,
  readJsonObject,
  type ItamContext,
} from './http.js';

/**
 * The CRUD surface every ITAM domain exposes: list, get, history,
 * delete-impact, create, update, delete. Domain-specific operations are
 * registered on the returned router by the caller.
 */
export interface CrudService {
  list(
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  update(
    id: string,
    input: Row,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  deleteImpact(id: string, options?: DeleteOptions): Promise<DeleteImpact>;
  delete(
    id: string,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
    options?: DeleteOptions,
  ): Promise<void>;
}

export interface CrudRoutesOptions {
  readonly collection: string;
  readonly service: CrudService;
  readonly history: HistoryService;
  readonly createSchema: ZodObject<ZodRawShape>;
  readonly updateSchema?: ZodObject<ZodRawShape>;
  /**
   * Create-time inputs that are relations, not fields of the collection
   * (a disposal's `deviceIds`): validated by the schema, applied by the
   * service, but not part of the field-level authorization decision, which
   * only knows the collection's registered fields.
   */
  readonly relationInputs?: readonly string[];
  // Authentication and authorization middleware; typed loosely because the
  // two plugins declare different Hono environments for the same context.
  readonly middleware: readonly MiddlewareHandler<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Replaces the generic list when the service needs the caller (e.g. "mine" views). */
  readonly list?: (
    context: ItamContext,
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ) => Promise<ListResult>;
  /** Paths registered before the generic `/:id` routes, e.g. `/stats`. */
  readonly before?: (
    routes: Hono<AuthorizationEnv>,
    helpers: CrudHelpers,
  ) => void;
}

export interface CrudHelpers {
  readonly decide: (
    context: ItamContext,
    action: string,
    params?: DatabaseAuthorizationParams,
  ) => Promise<DatabaseAuthorizationConditions>;
  readonly operationContext: (context: ItamContext) => OperationContext;
  readonly operation: (
    path: string,
    action: string,
    run: (
      context: ItamContext,
      id: string,
      body: Record<string, unknown>,
      conditions: DatabaseAuthorizationConditions,
    ) => Promise<unknown>,
  ) => void;
}

export function createCrudRoutes(
  options: CrudRoutesOptions,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.use(
    '*',
    ...(options.middleware as MiddlewareHandler<AuthorizationEnv>[]),
  );

  const decide: CrudHelpers['decide'] = async (context, action, params) =>
    decideFor(context, options.collection, action, params);

  const operationContext: CrudHelpers['operationContext'] = (context) =>
    operationContextOf(context);
  const operation: CrudHelpers['operation'] = (path, action, run) => {
    routes.post(`/:id/${path}`, async (context) => {
      try {
        const body =
          context.req.header('content-length') === '0' ||
          !context.req.header('content-type')
            ? {}
            : await readJsonObject(context);
        const conditions = await decide(context, action);
        return context.json({
          data: await run(context, context.req.param('id'), body, conditions),
        });
      } catch (error) {
        return errorResponse(context, error);
      }
    });
  };
  const helpers: CrudHelpers = { decide, operationContext, operation };

  routes.get('/', async (context) => {
    try {
      const conditions = await decide(context, 'read');
      const list = parseListOptions(context);
      return context.json(
        options.list
          ? await options.list(context, list, conditions)
          : await options.service.list(list, conditions),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  options.before?.(routes, helpers);

  routes.get('/:id', async (context) => {
    try {
      const conditions = await decide(context, 'read');
      const record = await options.service.get(
        context.req.param('id'),
        conditions,
      );
      return record
        ? context.json({ data: record })
        : context.json({ code: 'NOT_FOUND', message: 'Record not found' }, 404);
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get('/:id/history', async (context) => {
    try {
      const conditions = await decide(context, 'read');
      const id = context.req.param('id');
      if (!(await options.service.get(id, conditions))) {
        return context.json(
          { code: 'NOT_FOUND', message: 'Record not found' },
          404,
        );
      }
      const list = parseListOptions(context);
      const limit = list.pageSize ?? 30;
      const offset = ((list.page ?? 1) - 1) * limit;
      const subject = { subjectType: options.collection, subjectId: id };
      return context.json(
        await options.history.timeline(subject, {
          limit,
          offset,
          kind: historyKind(context),
        }),
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.get('/:id/delete-impact', async (context) => {
    try {
      await decide(context, 'delete');
      return context.json({
        data: await options.service.deleteImpact(context.req.param('id'), {
          unrestricted: await isUnrestricted(context),
        }),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.post('/', async (context) => {
    try {
      const input = options.createSchema
        .strict()
        .parse(await readJsonObject(context)) as Row;
      const conditions = await decide(context, 'create', {
        fields: {
          input: Object.keys(input).filter(
            (key) => !options.relationInputs?.includes(key),
          ),
        },
      });
      return context.json(
        {
          data: await options.service.create(
            input,
            operationContext(context),
            conditions,
          ),
        },
        201,
      );
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.patch('/:id', async (context) => {
    try {
      const schema = options.updateSchema ?? options.createSchema.partial();
      const input = schema.strict().parse(await readJsonObject(context)) as Row;
      if (Object.keys(input).length === 0) {
        return context.json(
          { code: 'VALIDATION', message: 'Nothing to update' },
          400,
        );
      }
      const conditions = await decide(context, 'update', {
        fields: { input: Object.keys(input) },
      });
      return context.json({
        data: await options.service.update(
          context.req.param('id'),
          input,
          operationContext(context),
          conditions,
        ),
      });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  routes.delete('/:id', async (context) => {
    try {
      const conditions = await decide(context, 'delete');
      await options.service.delete(
        context.req.param('id'),
        operationContext(context),
        conditions,
        { unrestricted: await isUnrestricted(context) },
      );
      return context.json({ data: { deleted: 1 } });
    } catch (error) {
      return errorResponse(context, error);
    }
  });

  return routes;
}
