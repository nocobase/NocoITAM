import {
  agentsAccessToken,
  agentsToken,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { planServiceToken } from '../itam/plans.js';
import { settingsServiceToken } from '../itam/settings.js';
import { agentActionOptions, PLAN_ACTION, VIEW_ACTION } from './actions.js';
import { provisionAssistant } from './assistant.js';
import {
  createReadSnapshots,
  registerContextKinds,
  type ReadSnapshots,
} from './context.js';
import { itamActionGate, itamAgentsAccess } from './gate.js';
import { provisionSkills } from './library.js';
import { provisionModelServices } from './model-services.js';
import { deliverPlanOutcome } from './plan-news.js';
import { ITAM_ASSISTANT_INSTRUCTIONS } from './preset.js';
import { itamConversationRules } from './rules.js';
import { registerItamSkill } from './skill.js';

/** Which collections each person could read when they last loaded a page. */
export const readSnapshotsToken: ServiceToken<ReadSnapshots> =
  createServiceToken<ReadSnapshots>('itam/agents-read-snapshots');

// The actions an ITAM agent starts from: reading and proposing plans.
const PRESET_ACTIONS: readonly string[] = [VIEW_ACTION, PLAN_ACTION];

/**
 * ITAM on the Agents plugin (template 1.0.0-beta.64, after NocoCRM's): the
 * business actions an agent may be given and who holds them, the preset an
 * ITAM agent starts from and the assistant made from it (Noco,
 * assistant.ts), the skill and rules every conversation gets, what a page
 * context may name, and where conversations start. ITAM's commands are its
 * own API routes (`server/routes/itam/agent-commands.ts`); a change a run
 * asks for becomes a plan the person confirms (`itam/plans.ts`). ITAM's
 * background AI asks the plugin's model gateway (`itam/ai-model.ts`).
 */
export default class ItamAgentsProvider extends ServiceProvider<Application> {
  readonly name = 'itam-agents';
  // The settings the conversation rules read, which run where nothing may
  // be read; kept current as they are saved.
  private notes = { businessNotes: '', timeZone: 'Asia/Shanghai' };

  public override register(): void {
    this.app.container.singleton(agentsAccessToken, () =>
      itamAgentsAccess(this.app.container),
    );
    this.app.container.singleton(readSnapshotsToken, () =>
      createReadSnapshots(),
    );
  }

  public override boot(): Promise<void> {
    if (!this.app.container.has(agentsToken)) return Promise.resolve();
    const agents = this.app.container.resolve(agentsToken);
    agents.actions.provide(agentActionOptions);
    agents.gate.set(itamActionGate());
    // Every online run gets how to use ITAM's commands and plans.
    registerItamSkill(agents);
    agents.presets.register({
      key: 'itam-assistant',
      name: 'ITAM assistant',
      description:
        'Looks things up across the IT asset register and proposes changes as plans the person confirms.',
      nameText: { key: 'ai.agentPreset.name', ns: 'itam' },
      descriptionText: { key: 'ai.agentPreset.description', ns: 'itam' },
      instructions: ITAM_ASSISTANT_INSTRUCTIONS,
      type: 'online',
      actions: [...PRESET_ACTIONS],
    });
    agents.conversations.rules.provide(itamConversationRules(() => this.notes));
    registerContextKinds(
      agents,
      this.app.container.resolve(readSnapshotsToken),
      this.app.publicBasePath.replace(/\/+$/, ''),
    );
    // What became of a plan goes back to the conversation that proposed it.
    this.app.container.resolve(planServiceToken).onDecided = deliverPlanOutcome(
      agents,
      () => this.app.container.resolve(databaseManagerToken),
    );
    agents.conversations.sources.register({
      key: 'itam',
      title: { key: 'ai.conversationSource', ns: 'itam' },
    });
    return Promise.resolve();
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(agentsToken)) return;
    const agents = this.app.container.resolve(agentsToken);
    const settings = this.app.container.resolve(settingsServiceToken);
    const database = this.app.container.resolve(databaseManagerToken);
    settings.onSaved((key, value) => {
      if (key === 'ai')
        this.notes = {
          ...this.notes,
          businessNotes: (value as { businessNotes: string }).businessNotes,
        };
      if (key === 'general')
        this.notes = {
          ...this.notes,
          timeZone: (value as { timeZone: string }).timeZone,
        };
    });
    // Nothing here may stop the application from starting: a database
    // without ITAM's tables yet (an embedded test, a first start before the
    // migrations) or an unusable model service leaves the assistant to be
    // set up on a later start, and says why.
    try {
      this.notes = {
        businessNotes: (await settings.get('ai')).businessNotes,
        timeZone: (await settings.get('general')).timeZone,
      };
      await provisionModelServices(this.app, agents);
      await provisionAssistant(agents, database, PRESET_ACTIONS);
      await provisionSkills(agents, database);
    } catch (error) {
      if (this.app.container.has(loggingToken))
        this.app.container
          .resolve(loggingToken)
          .getLogger('itam')
          .warn({ err: error }, 'The ITAM assistant was not set up');
    }
  }
}
