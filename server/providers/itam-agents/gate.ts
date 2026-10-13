import type {
  ActionGate,
  AgentsAccess,
  CallerIdentity,
} from '@nocobase/app-plugin-agents/server/tokens';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { ServiceContainer } from '@nocobase/service-provider';

import { GRANTABLE, PLAN_ACTION, VIEW_ACTION } from './actions.js';

/**
 * Who holds which of ITAM's agent actions (actions.ts), as the Agents
 * plugin asks: for the command manifest it offers a caller, and for each
 * request a run makes (the command routes check their action against it).
 *
 * A person holds both: what a command reads is narrowed to their own grants
 * by the services behind it, and a plan changes nothing until they carry it
 * out, each step then checked as them. A run holds those its agent is
 * configured with, never more than the person who woke it, and never one an
 * agent may not be given.
 */
export function itamActionGate(): ActionGate {
  return {
    async allowed(identity: CallerIdentity) {
      const held = new Set([VIEW_ACTION, PLAN_ACTION]);
      if (identity.kind !== 'run') return held;
      const configured = new Set(identity.agent?.actions ?? []);
      return new Set(
        [...held].filter(
          (action) => configured.has(action) && GRANTABLE.has(action),
        ),
      );
    },
    // A consulted agent only reads, besides proposing a plan the person
    // confirms where the asking run works.
    consultable: (action) => action === PLAN_ACTION,
  };
}

/**
 * How far the Agents plugin's own business action (changing agents and
 * skills) reaches for a caller, from the levels their permission sets give
 * on the plugin's `agents` resource type: every agent, or their own.
 */
export function itamAgentsAccess(container: ServiceContainer): AgentsAccess {
  return {
    async scopeOf(identity, key) {
      const scope = container.resolve(authorizationToken).for(identity);
      const business = key.slice(0, key.indexOf('/'));
      const action = key.slice(key.indexOf('/') + 1);
      const can = (level: string) =>
        scope.can({
          resource: { type: 'agents', id: business },
          action: `${action}.${level}`,
        });
      if (await can('all')) return 'all';
      if ((await can('related')) && identity.principal)
        return { users: [identity.principal.id] };
      return 'none';
    },
  };
}
