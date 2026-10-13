import type { AgentActionOption } from '@nocobase/app-plugin-agents/shared/agents';

/**
 * ITAM's business actions as the Agents plugin knows them (template
 * 1.0.0-beta.64, after NocoCRM's): what an agent may be configured with,
 * what a person or a run holds (gate.ts), and what each command a run may
 * call needs (`cliRoute({ action })` on server/routes/itam/agent-commands.ts).
 *
 * Two, because the register's own authorization already decides record by
 * record what the person may read and do: reading through the commands
 * (searching, a record, statistics, an onboarding plan, a report) goes no
 * further than the person's own grants, and every change is proposed as a
 * plan the person confirms, each step then checked as them.
 */
export const VIEW_ACTION = 'itam.records/view';
export const PLAN_ACTION = 'itam.plans/create';

const text = (key: string) => ({ key, ns: 'itam' });

export function agentActionOptions(): AgentActionOption[] {
  return [
    {
      key: VIEW_ACTION,
      group: 'itam.records',
      groupTitle: text('ai.agentActions.records'),
      title: text('ai.agentActions.view'),
      description: text('ai.agentActions.viewDescription'),
      defaultOn: true,
    },
    {
      key: PLAN_ACTION,
      group: 'itam.plans',
      groupTitle: text('ai.agentActions.plans'),
      title: text('ai.agentActions.planCreate'),
      description: text('ai.agentActions.planCreateDescription'),
      defaultOn: true,
    },
  ];
}

/** The actions an agent may be given at all. */
export const GRANTABLE: ReadonlySet<string> = new Set([
  VIEW_ACTION,
  PLAN_ACTION,
]);
