import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { ServiceContainer } from '@nocobase/service-provider';

import { ForbiddenError } from '../../routes/itam/http.js';
import { decideWith, type Authorize } from './authz-resources.js';

/**
 * The bridge between the AI runtime and this application. AI tools are
 * loaded from `ai/` by the AI plugin and receive only the actor and the
 * database, so the ITAM provider hands them the service container at boot.
 * Every tool authorizes through a scope built for the actor, exactly as a
 * route would for that user.
 */
let bridged: ServiceContainer | undefined;

export function registerAiBridge(container: ServiceContainer): void {
  bridged = container;
}

export function aiContainer(): ServiceContainer {
  if (!bridged) throw new Error('The ITAM services are not available yet');
  return bridged;
}

export interface ActorScope {
  readonly actorId: string;
  /** Conditions for an action, or a forbidden error. */
  decide(
    collection: string,
    action: string,
  ): Promise<DatabaseAuthorizationConditions>;
  /** Conditions for an action, or undefined when denied. */
  may(
    collection: string,
    action: string,
  ): Promise<DatabaseAuthorizationConditions | undefined>;
}

/** An authorization scope for a user outside an HTTP request. */
export function scopeFor(
  container: ServiceContainer,
  actorId: string,
): ActorScope {
  const authorization = container.resolve(authorizationToken);
  const scope = authorization.for({
    principal: { type: 'user', id: actorId },
    subjects: [{ type: 'authenticated', id: '*' }],
  });
  // The same decision the routes make, so a tool never holds an operation a
  // request would be refused (`decideWith` in `authz-resources.ts`).
  // Overloaded per resource type; this decision spans two of them.
  const authorize = scope.authorize.bind(scope) as unknown as Authorize;
  const may: ActorScope['may'] = async (collection, action) =>
    decideWith(authorize, collection, action);
  return {
    actorId,
    may,
    async decide(collection, action) {
      const conditions = await may(collection, action);
      if (!conditions)
        throw new ForbiddenError(`Not allowed: ${collection}.${action}`);
      return conditions;
    },
  };
}
