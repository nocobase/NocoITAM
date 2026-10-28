import { isDemoMode } from '../itam/demo-mode.js';
import {
  agentsAccessToken,
  agentsToken,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { AGENT_JOBS, createAgentJob, oncePerRun } from '../itam/agent-jobs.js';
import { agentRunServiceToken } from '../itam/agent-runs.js';
import { approvalReviewerToken } from '../itam/approval-review.js';
import { approvalServiceToken } from '../itam/approvals.js';
import { deviceSyncFollowUpToken } from '../itam/device-sync-followup.js';
import { deviceSyncServiceToken } from '../itam/device-sync.js';
import { planServiceToken } from '../itam/plans.js';
import { settingsServiceToken } from '../itam/settings.js';
import { agentActionOptions } from './actions.js';
import { registerAssistant } from './assistant.js';
import {
  createReadSnapshots,
  registerContextKinds,
  type ReadSnapshots,
} from './context.js';
import { itamActionGate, itamAgentsAccess } from './gate.js';
import { provisionSkills } from './library.js';
import { provisionModelServices } from './model-services.js';
import { deliverPlanOutcome } from './plan-news.js';
import { itamConversationRules } from './rules.js';
import { SEARCH_SOURCE } from './search-answers.js';

/** Which collections each person could read when they last loaded a page. */
/** How long MDM 跟进 waits for the other platforms' pulls to end. */
const FOLLOW_UP_SETTLE_MS = 15_000;

export const readSnapshotsToken: ServiceToken<ReadSnapshots> =
  createServiceToken<ReadSnapshots>('itam/agents-read-snapshots');

/**
 * ITAM on the Agents plugin (template 1.0.0-beta.64, after NocoCRM's): the
 * business actions an agent may be given and who holds them, the preset an
 * ITAM agent starts from and the assistant made from it (Asset Steward,
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

  public override async boot(): Promise<void> {
    if (!this.app.container.has(agentsToken)) return;
    const agents = this.app.container.resolve(agentsToken);
    agents.actions.provide(agentActionOptions);
    agents.gate.set(itamActionGate());
    // Asset Steward: ITAM's tools and its conversations' scope on the
    // plugin's OnlineAgent service (assistant.ts, Agents plugin 1.0).
    registerAssistant(agents, this.app.container, () => this.notes);
    agents.conversations.rules.provide(itamConversationRules(() => this.notes));
    registerContextKinds(
      agents,
      this.app.container.resolve(readSnapshotsToken),
      this.app.publicBasePath.replace(/\/+$/, ''),
    );
    // What became of a plan goes back to the conversation that proposed it,
    // and a plan MDM 跟进 proposed settles its suggestion (2026-10-17).
    const planNews = deliverPlanOutcome(agents, () =>
      this.app.container.resolve(databaseManagerToken),
    );
    this.app.container.resolve(planServiceToken).onDecided = async (
      outcome,
    ) => {
      await planNews(outcome);
      await this.app.container
        .resolve(deviceSyncFollowUpToken)
        .planDecided(outcome)
        .catch(() => undefined);
    };
    agents.conversations.sources.register({
      key: 'itam',
      title: { key: 'ai.conversationSource', ns: 'itam' },
    });
    // The global search's answers, listed nowhere until kept
    // (search-answers.ts).
    agents.conversations.sources.register({
      key: SEARCH_SOURCE,
      title: { key: 'ai.searchSource', ns: 'itam' },
    });
    if (!isDemoMode(this.app.container)) await this.startWorkAgents();
  }

  /**
   * The work agents (2026-10-16): 审批审阅 reviews each
   * approval request for its approver once it is committed, and a decision
   * or a withdrawal retires a review still open. Their runs are tasks of the
   * jobs service (`itamAgentRuns`), kept across a restart; without it they
   * run in this process in turn.
   */
  private async startWorkAgents(): Promise<void> {
    const container = this.app.container;
    const reviewer = container.resolve(approvalReviewerToken);
    const approvals = container.resolve(approvalServiceToken);
    const warn = (error: unknown, message: string) => {
      if (container.has(loggingToken))
        container
          .resolve(loggingToken)
          .getLogger('itam')
          .warn({ err: error }, message);
    };
    // The demo's requests and pulls come with their suggestions written
    // (2026-10-16): importing it never runs a model.
    approvals.onRequested = (approval, context) => {
      if (context.sourceType === 'demo') return;
      void reviewer
        .request({
          approvalId: String(approval.id),
          trigger: 'submitted',
          by: null,
        })
        .catch((error: unknown) =>
          warn(error, 'The approval review did not start'),
        );
    };
    approvals.onSettled = (approval) =>
      void reviewer.settled(approval).catch(() => undefined);
    // MDM 跟进 (2026-10-17): after each pull that read every page. Pulls of
    // several platforms end moments apart; one follow-up waits for the last.
    const followUp = container.resolve(deviceSyncFollowUpToken);
    let settling: ReturnType<typeof setTimeout> | undefined;
    container.resolve(deviceSyncServiceToken).onSynced = (run) => {
      if (run.trigger === 'demo') return;
      if (settling) clearTimeout(settling);
      const by = typeof run.actorId === 'string' ? run.actorId : null;
      settling = setTimeout(() => {
        settling = undefined;
        void followUp
          .afterSync(by)
          .catch((error: unknown) =>
            warn(error, 'The MDM follow-up did not start'),
          );
      }, FOLLOW_UP_SETTLE_MS);
    };
    if (!container.has(jobExecutorServiceToken)) return;
    const executor = container
      .resolve(jobExecutorServiceToken)
      .getJobExecutor('itam', AGENT_JOBS);
    // One queue for every agent: a task names its run, whose agent says
    // which works it.
    const runs = container.resolve(agentRunServiceToken);
    const AgentRunJob = createAgentJob(
      oncePerRun(async (runId, signal) => {
        const run = await runs.get(runId);
        if (run?.agent === 'deviceSync') await followUp.runEntry(runId, signal);
        else await reviewer.runEntry(runId, signal);
      }),
    );
    executor.registerJob(AgentRunJob);
    await executor.setup();
    const dispatch = async (runId: string): Promise<void> => {
      await executor.addJob(new AgentRunJob({ runId }));
    };
    reviewer.useJobs(dispatch);
    followUp.useJobs(dispatch);
    // The runs a shutdown cut short left running, queued again: only on the
    // memory queue, which this process alone holds; a shared one (Redis)
    // keeps its tasks through any exit, and another instance may be running
    // them.
    const adapter =
      this.app.config?.get<Record<string, { adapter?: string } | undefined>>(
        'jobs',
      )?.[AGENT_JOBS]?.adapter ?? 'memory';
    if (adapter === 'memory')
      void container
        .resolve(agentRunServiceToken)
        .running()
        .then(async (running) => {
          for (const run of running) await dispatch(run.id);
        })
        .catch(() => undefined);
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
      if (!isDemoMode(this.app.container))
        await provisionModelServices(this.app, agents);
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
