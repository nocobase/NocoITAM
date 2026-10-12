import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { ServiceContainer } from '@nocobase/service-provider';

import { ForbiddenError } from '../../routes/itam/http.js';
import { decideWith, type Authorize } from './authz-resources.js';

/**
 * An authorization scope for a user outside an HTTP request: the assistant's
 * commands and plans (`itam-agents/`) decide as the person a run works for,
 * exactly as a route would for that user.
 */
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
