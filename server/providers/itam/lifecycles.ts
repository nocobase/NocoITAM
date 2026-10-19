import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LifecycleError,
  LifecycleRuntime,
  StoredLifecycleParameters,
  type EffectDispatcher,
  type LifecycleLogger,
  type LifecycleParameterStore,
} from '@nocobase/lifecycle';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { disposalLifecycle } from '../../lifecycles/disposals.js';
import { purchaseOrderLifecycle } from '../../lifecycles/purchase-orders.js';
import type { ApprovalService } from './approvals.js';
import { BusinessRuleError } from './errors.js';
import type { ItamNotifier } from './notifier.js';

/**
 * The application's one lifecycle runtime (`@nocobase/lifecycle`,
 * 2026-10-18, docs/adr/0001-record-lifecycles.md), which every record
 * lifecycle registers on: the disposals' (`server/lifecycles/disposals.ts`)
 * and the purchase orders' (`server/lifecycles/purchase-orders.ts`). It keeps no state of its own; the
 * records, their transition log and their effect runs are in the database
 * (202610180001_disposal_lifecycle). Its effects run on the application's
 * jobs once `ItamProvider.start()` hands it the dispatcher; a container
 * without jobs — a test's — runs them in process before a transition
 * returns, which the library allows for exactly that.
 */
export const lifecycleRuntimeToken: ServiceToken<LifecycleRuntime> =
  createServiceToken<LifecycleRuntime>('itam/lifecycle-runtime');

/** Stored with every queued effect: never rename it. */
export const LIFECYCLE_EFFECT_JOB = 'itam/lifecycle-effect';
/**
 * The one scope the lifecycles' administrator-set parameters are kept
 * under: the whole installation. Never rename it, or the stored versions
 * are no longer found.
 */
export const LIFECYCLE_PARAMETER_SCOPE = 'itam';

/**
 * The versions of those parameters, in the database
 * (202610180002_lifecycle_parameters). It keeps no state of its own, so the
 * runtime, which reads them on each transition, and the settings that save
 * them each build one.
 */
export function lifecycleParameterStore(
  database: DatabaseManager,
): LifecycleParameterStore {
  return new StoredLifecycleParameters(
    createRepositoryLifecycleStore(database),
  );
}

/** The jobs scope the effects and the sweep run in: never rename it. */
export const LIFECYCLE_JOB_SCOPE = 'itam-lifecycles';

export function createItamLifecycleRuntime(dependencies: {
  readonly database: DatabaseManager;
  readonly approvals: ApprovalService;
  readonly notifier: ItamNotifier;
  readonly dispatcher?: EffectDispatcher;
  readonly logger?: LifecycleLogger;
}): LifecycleRuntime {
  const { database, approvals, notifier, dispatcher, logger } = dependencies;
  const runtime = new LifecycleRuntime({
    store: createRepositoryLifecycleStore(database),
    ...(dispatcher ? { dispatcher } : {}),
    ...(logger ? { logger } : {}),
  });
  runtime.register(disposalLifecycle, {
    // Bound to the transaction a transition is decided in: on SQLite its
    // one connection is held, and a read through the database manager would
    // wait for it forever.
    services: (handle) => ({
      approvals: (id) =>
        approvals.forSubject(
          'disposal',
          id,
          handle as DatabaseConnection | undefined,
        ),
      notifier,
    }),
    // 设置 → 报废流程's approver range, read live on every submission.
    parameterConfiguration: {
      store: lifecycleParameterStore(database),
      scope: () => LIFECYCLE_PARAMETER_SCOPE,
    },
  });
  runtime.register(purchaseOrderLifecycle, {
    // Bound to the transaction a transition is decided in, as above.
    services: (handle) => {
      const connection = handle as DatabaseConnection | undefined;
      return {
        approvals: (id) =>
          approvals.forSubject('purchaseOrder', id, connection),
        lineCount: async (id) => {
          const row = await (connection ? connection.query : database.query())
            .selectFrom('purchaseOrderLines')
            .select((eb) => [eb.fn.countAll().as('count')])
            .where('purchaseOrderId', '=', id)
            .executeTakeFirst<{ count: number | string }>();
          return Number(row?.count ?? 0);
        },
        notifier,
      };
    },
  });
  return runtime;
}

/**
 * A transition the runtime refused, as the routes already answer one: the
 * guard's own rule (`NOT_OWNER`, `NO_DEVICES`…), `INVALID_STATUS` for a
 * state it cannot leave that way, `CONFLICT` for a decision made on a page
 * that was out of date. Anything else is the server's own fault and is
 * rethrown as it is.
 */
export function lifecycleRefusal(error: unknown): unknown {
  if (!(error instanceof LifecycleError)) return error;
  switch (error.code) {
    case 'GUARD_REJECTED': {
      const blocker =
        error.blockers.find((entry) => entry.source === 'guard') ??
        error.blockers[0];
      return new BusinessRuleError(
        blocker?.message ?? error.message,
        blocker?.code ?? 'NOT_ALLOWED',
      );
    }
    case 'INVALID_STATE':
      return new BusinessRuleError(error.message, 'INVALID_STATUS');
    case 'CONFLICT':
      return new BusinessRuleError(
        'The record changed meanwhile; reload it and try again',
        'CONFLICT',
      );
    default:
      return error;
  }
}
