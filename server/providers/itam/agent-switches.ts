import type { DatabaseManager } from '@nocobase/db';

import {
  claimMarker,
  readMarker,
  writeMarker,
} from '../itam-agents/markers.js';
import { AGENTS, type AgentName } from './agent-runs.js';

/**
 * Whether each work agent runs on its own (2026-10-16, after NocoCRM's
 * Agent work page): the agent as a whole, and each trigger it runs on, an
 * administrator switches on 智能体工作. Every one is on until switched off.
 * Every automatic start asks `agentOn`; a person asking by hand is never
 * switched off. Kept in one `itamSettings` row the settings service does
 * not read, as the markers are.
 */

/** The triggers each agent runs on, in the order its page lists them. */
export const AGENT_TRIGGERS: Readonly<Record<AgentName, readonly string[]>> = {
  // A purchase order or a disposal sent for approval.
  approvalReview: ['submitted'],
  // A daily pass over the entitlements 需要关注 shows renewing or ending.
  renewalReview: ['daily'],
};

export interface AgentSwitch {
  readonly enabled: boolean;
  readonly triggers: Readonly<Record<string, boolean>>;
}
export type AgentSwitches = Readonly<Record<AgentName, AgentSwitch>>;

const ROW = 'agent-switches';

export async function agentSwitches(
  database: DatabaseManager,
): Promise<AgentSwitches> {
  const stored = ((await readMarker(database, ROW).catch(() => null)) ??
    {}) as Partial<Record<string, Partial<AgentSwitch>>>;
  return Object.fromEntries(
    AGENTS.map((agent) => [
      agent,
      {
        enabled: stored[agent]?.enabled !== false,
        triggers: Object.fromEntries(
          AGENT_TRIGGERS[agent].map((trigger) => [
            trigger,
            stored[agent]?.triggers?.[trigger] !== false,
          ]),
        ),
      },
    ]),
  ) as unknown as AgentSwitches;
}

/** Whether the agent runs on this trigger now: itself on, and the trigger. */
export async function agentOn(
  database: DatabaseManager,
  agent: AgentName,
  trigger: string,
): Promise<boolean> {
  const switches = (await agentSwitches(database))[agent];
  return switches.enabled && switches.triggers[trigger] !== false;
}

/** An administrator's change to one agent's switches; unknown triggers are left out. */
export async function saveAgentSwitch(
  database: DatabaseManager,
  agent: AgentName,
  input: {
    readonly enabled?: boolean;
    readonly triggers?: Record<string, boolean>;
  },
): Promise<AgentSwitches> {
  const current = await agentSwitches(database);
  const known = new Set(AGENT_TRIGGERS[agent]);
  const next = {
    ...current,
    [agent]: {
      enabled: input.enabled ?? current[agent].enabled,
      triggers: {
        ...current[agent].triggers,
        ...Object.fromEntries(
          Object.entries(input.triggers ?? {}).filter(([trigger]) =>
            known.has(trigger),
          ),
        ),
      },
    },
  };
  if (!(await claimMarker(database, ROW, next)))
    await writeMarker(database, ROW, next);
  return next;
}
