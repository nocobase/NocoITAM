import {
  createDeviceSyncFollowUp,
  deviceSyncFollowUpToken,
} from './device-sync-followup.js';
import {
  createQuoteComparisonService,
  quoteComparisonServiceToken,
} from './quote-comparisons.js';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';

import { reconcileGrants } from './reconcile-grants.js';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  realtimeServiceToken,
  type RealtimePublicTopic,
} from '@nocobase/app-server/realtime';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { agentRunServiceToken, createAgentRunService } from './agent-runs.js';
import {
  approvalReviewerToken,
  createApprovalReviewer,
} from './approval-review.js';
import { approvalServiceToken, createApprovalService } from './approvals.js';
import { auditServiceToken, createAuditService } from './audits.js';
import { deviceServiceToken, createDeviceService } from './devices.js';
import { configuredSources } from './device-sources.js';
import { createDemoSource } from './device-demo-source.js';
import {
  createDeviceConnectionsService,
  createDeviceConnectionsSecretsStore,
  deviceConnectionsServiceToken,
} from './device-connections.js';
import {
  createDeviceSyncService,
  deviceSyncServiceToken,
} from './device-sync.js';
import {
  createDeviceReviewService,
  deviceReviewServiceToken,
} from './device-review.js';
import type { DeviceSyncConfig } from '../../config/device-sync.js';
import {
  attachmentServiceToken,
  createAttachmentService,
} from './attachments.js';
import {
  createDemoService,
  demoServiceToken,
  type DemoAccounts,
} from './demo.js';
import { createDisposalService, disposalServiceToken } from './disposals.js';
import {
  approverDirectoryToken,
  createApproverDirectory,
  startApproverRange,
} from './approvers.js';
import {
  createItamLifecycleRuntime,
  LIFECYCLE_EFFECT_JOB,
  LIFECYCLE_JOB_SCOPE,
  lifecycleRuntimeToken,
} from './lifecycles.js';
import { createImportService, importServiceToken } from './imports.js';
import {
  createProcurementService,
  procurementServiceToken,
} from './procurement.js';
import { ITAM_COLLECTIONS, ITAM_SETTINGS_RESOURCE } from './collections.js';
import {
  collectionTitleOf,
  ITAM_RESOURCE_SECTION,
  ITAM_RESOURCES,
  ITAM_SETTINGS_TITLE,
  settingsActionTitleOf,
} from './authz-resources.js';
import {
  createEntitlementService,
  entitlementServiceToken,
} from './entitlements.js';
import {
  createStockService,
  stockServiceToken,
  stockMovementEvents,
} from './stock.js';
import {
  createItamChanges,
  ITAM_CHANGES_TOPIC,
  itamChangesToken,
  type ItamChangesEvent,
} from './changes.js';
import { createHistoryService, historyServiceToken } from './history.js';
import {
  createOnboardingService,
  onboardingServiceToken,
} from './onboarding.js';
import {
  createAssistantRunner,
  createOnboardingAdvisor,
  onboardingAdvisorToken,
} from './onboarding-advisor.js';
import {
  createMasterDataService,
  masterDataServiceToken,
} from './master-data.js';
import {
  createMaintenanceService,
  maintenanceServiceToken,
} from './maintenance.js';
import { i18nToken } from '@nocobase/app-server/i18n';
import { createItamNotifier, itamNotifierToken } from './notifier.js';
import { commentServiceToken, createCommentService } from './comments.js';
import { createNumberingService, numberingServiceToken } from './numbering.js';
import { createDocumentReader, documentReaderToken } from './document-text.js';
import {
  createReceiptRunService,
  receiptRunServiceToken,
} from './receipt-runs.js';
import { createRepairService, repairServiceToken } from './repairs.js';
import { createPlanService, planServiceToken } from './plans.js';
import { createReportService, reportServiceToken } from './reports.js';
import { createSettingsService, settingsServiceToken } from './settings.js';
import { aiLanguageToken, createAiLanguage } from './ai-language.js';
import { createWorkbenchService, workbenchServiceToken } from './workbench.js';
import {
  createLeaverAccounts,
  leaverAccountsToken,
} from './leaver-accounts.js';

export {
  approvalServiceToken,
  commentServiceToken,
  deviceConnectionsServiceToken,
  deviceServiceToken,
  deviceSyncServiceToken,
  deviceReviewServiceToken,
  auditServiceToken,
  disposalServiceToken,
  repairServiceToken,
  attachmentServiceToken,
  demoServiceToken,
  historyServiceToken,
  importServiceToken,
  itamNotifierToken,
  maintenanceServiceToken,
  procurementServiceToken,
  documentReaderToken,
  receiptRunServiceToken,
  reportServiceToken,
  entitlementServiceToken,
  stockServiceToken,
  masterDataServiceToken,
  numberingServiceToken,
  settingsServiceToken,
  workbenchServiceToken,
};

/**
 * The demo's sign-ins, created through the users plugin so an account gets
 * its identity, its hashed password and its Permission Set the way one
 * created in the Users page does. Removing it ends its sessions and drops
 * its assignments, which is why clearing the demo calls `remove` rather than
 * deleting the row.
 */
function demoAccounts(container: ServiceContainer): DemoAccounts {
  /**
   * Deletes a demo account's row and everything that still refers to it:
   * its sessions and credentials, the conversations and usage the AI
   * employee plugin left in a database upgraded from before template
   * 1.0.0-beta.64 (their rows reference the account, so it cannot go before
   * them; the Agents plugin's own reference no row), and any Permission Set
   * assignment. Only ever for the demo's own sign-ins.
   */
  const purge = async (userId: string): Promise<void> => {
    const permissionSets = container.resolve(authorizationToken).permissionSets;
    for (const assignment of await permissionSets.listAssignments())
      if (
        assignment.subject.type === 'user' &&
        String(assignment.subject.id) === userId
      )
        await permissionSets.revoke(assignment.id);
    const database = container.resolve(databaseManagerToken);
    // The AI employee plugin's tables first, each on its own: they exist
    // only where it ran, and a statement that fails inside a transaction
    // would abort the rest of it on some databases.
    const query = database.query();
    const sessions = await query
      .selectFrom('aiConversations')
      .select('sessionId')
      .where('userId', '=', userId)
      .execute<{ sessionId: string }>()
      .catch(() => []);
    const sessionIds = sessions.map((row) => row.sessionId);
    if (sessionIds.length > 0)
      for (const table of ['aiToolMessages', 'aiMessages'] as const)
        await query
          .deleteFrom(table)
          .where('sessionId', 'in', sessionIds)
          .execute()
          .catch(() => undefined);
    for (const table of [
      'aiUsageEvents',
      'aiConversations',
      'usersAiEmployees',
    ] as const)
      await query
        .deleteFrom(table)
        .where('userId', '=', userId)
        .execute()
        .catch(() => undefined);
    await database.transaction(async (connection) => {
      for (const table of ['session', 'account'] as const)
        await connection.query
          .deleteFrom(table)
          .where('userId', '=', userId)
          .execute();
      await connection.query
        .deleteFrom('user')
        .where('id', '=', userId)
        .execute();
    });
  };

  return {
    async create(spec) {
      const users = container.resolve(userAdministrationServiceToken);
      const permissionSets =
        container.resolve(authorizationToken).permissionSets;
      // An account deleted on the Users page is only marked deleted: its row
      // keeps the username and e-mail, the listing below no longer finds it,
      // and creating the account again collides with it ("A user with this
      // email already exists", found 2026-10-06). A deleted row holding one
      // of the demo's own identities is the demo's leftover, so it goes.
      const leftovers = await container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('user')
        .select('id')
        .where('deletedAt', 'is not', null)
        .where((eb) =>
          eb.or([
            eb('username', '=', spec.username),
            eb('email', '=', spec.email),
          ]),
        )
        .execute<{ id: string }>();
      for (const leftover of leftovers) await purge(String(leftover.id));
      // An account left over from a demo that was wiped another way (a
      // `pnpm data:reset`, which empties the table the demo tracks them in)
      // is taken over rather than refused: same name, password and Permission
      // Set as a fresh one, so generating twice gives the same sign-ins.
      const existing = (
        await users.list({ search: spec.username, pageSize: 50 })
      ).items.find((user) => user.username === spec.username);
      const user =
        existing ??
        (await users.create({
          name: spec.name,
          username: spec.username,
          email: spec.email,
          password: spec.password,
        }));
      if (existing) await users.resetPassword(user.id, spec.password);
      const held = (await permissionSets.listAssignments()).some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          String(assignment.subject.id) === user.id &&
          assignment.permissionSet === spec.permissionSet,
      );
      if (!held)
        await permissionSets.assign({
          subject: { type: 'user', id: user.id },
          permissionSet: spec.permissionSet,
        });
      return user.id;
    },
    async grant(userId, permissionSet) {
      const permissionSets =
        container.resolve(authorizationToken).permissionSets;
      const held = (await permissionSets.listAssignments()).some(
        (assignment) =>
          assignment.subject.type === 'user' &&
          String(assignment.subject.id) === userId &&
          assignment.permissionSet === permissionSet,
      );
      if (held) return null;
      const assignment = await permissionSets.assign({
        subject: { type: 'user', id: userId },
        permissionSet,
      });
      return assignment.id ? String(assignment.id) : null;
    },
    async revoke(assignmentId) {
      await container
        .resolve(authorizationToken)
        .permissionSets.revoke(assignmentId);
    },
    async describe(userId) {
      const user = await container
        .resolve(userAdministrationServiceToken)
        .get(userId);
      return user ? { name: user.name, email: user.email } : undefined;
    },

    async remove(userId, actorId) {
      // The users plugin's own `remove` refuses when the application
      // configured no deletion hooks, and this application configures none,
      // so the demo revokes the assignment itself and then deletes the
      // account through the authentication plugin, which owns the row —
      // ending its sessions the way a deletion on the Users page does.
      const permissionSets =
        container.resolve(authorizationToken).permissionSets;
      for (const assignment of await permissionSets.listAssignments())
        if (
          assignment.subject.type === 'user' &&
          String(assignment.subject.id) === userId
        )
          await permissionSets.revoke(assignment.id);
      await container
        .resolve(userAdministrationServiceToken)
        .remove(userId, actorId);
      // That removal is a soft delete: the row stays, holding its username
      // and e-mail, so regenerating the demo would collide with the account
      // it just cleared. These accounts belong to the demo and nothing
      // refers to them afterwards, so the rows go too.
      await purge(userId);
    },
  };
}

/**
 * Registers the cross-cutting ITAM services and, once authorization is
 * available, every ITAM collection and record-access policy, so Permission
 * Sets can be configured against them and routes can ask for decisions.
 */
export default class ItamProvider extends ServiceProvider<Application> {
  public readonly name: string = 'itam/core';
  private changesTopic: RealtimePublicTopic<ItamChangesEvent> | undefined;
  /**
   * Runs the lifecycles' effects as jobs and sweeps them every minute
   * (2026-10-18): only where the application has jobs, which a test's
   * container does not.
   */
  private lifecycleJobs: LifecycleJobs | undefined;

  private effectJobs(): LifecycleJobs | undefined {
    const container = this.app.container;
    if (this.lifecycleJobs || !container.has(jobExecutorServiceToken))
      return this.lifecycleJobs;
    const executors = container.resolve(jobExecutorServiceToken);
    // A scope of its own: the agents' runs hold `itam` with their own
    // concurrency, and one scope keeps one queue file.
    this.lifecycleJobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(LIFECYCLE_JOB_SCOPE),
      schedule: executors.getScheduleExecutor(LIFECYCLE_JOB_SCOPE),
      jobName: LIFECYCLE_EFFECT_JOB,
      sweepEveryMs: 60_000,
      // Finished effect runs are kept a week for anyone looking into one.
      onSweep: async () => {
        await container
          .resolve(lifecycleRuntimeToken)
          .prune({ olderThan: new Date(Date.now() - 7 * 86_400_000) });
      },
      logger: this.lifecycleLogger(),
    });
    return this.lifecycleJobs;
  }

  private lifecycleLogger() {
    const container = this.app.container;
    const logger = () =>
      container.has(loggingToken)
        ? container.resolve(loggingToken).getLogger('lifecycle')
        : undefined;
    return {
      warn: (message: string, details?: unknown) =>
        logger()?.warn({ details }, message),
      error: (message: string, details?: unknown) =>
        logger()?.error({ details }, message),
    };
  }

  public override register(): void {
    const container = this.app.container;
    container.singleton(settingsServiceToken, () =>
      createSettingsService(container.resolve(databaseManagerToken)),
    );
    // The language the models write in (2026-10-20): 设置 → 通用 → 基本设置, else
    // the deployment's locale.
    container.singleton(aiLanguageToken, () =>
      createAiLanguage({
        settings: container.resolve(settingsServiceToken),
        // The test harness has no config; the seeds' env override applies.
        deploymentLocale: () =>
          process.env.APP_DEFAULT_LOCALE ??
          this.app.config?.get<AppI18nConfig>('i18n')?.defaultLocale ??
          'en-US',
      }),
    );
    container.singleton(numberingServiceToken, () =>
      createNumberingService(
        container.resolve(databaseManagerToken),
        container.resolve(settingsServiceToken),
      ),
    );
    container.singleton(historyServiceToken, () =>
      createHistoryService(container.resolve(databaseManagerToken), {
        // A stock item's movements are recorded once, in the movement log;
        // the timeline derives its lines from them rather than keeping a
        // second copy that could drift.
        stockItems: stockMovementEvents(
          container.resolve(databaseManagerToken),
        ),
      }),
    );
    container.singleton(commentServiceToken, () =>
      createCommentService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(itamNotifierToken),
      ),
    );
    // "The register changed": published on the realtime topic the pages
    // that show live to-dos subscribe to (`changes.ts`). The topic is
    // defined at boot; a container without realtime publishes nothing.
    container.singleton(itamChangesToken, () =>
      // Publishing is asynchronous since @nocobase/realtime 0.1 (template
      // 1.0.0-beta.73); a failed one only means pages refresh later.
      createItamChanges(() => {
        void this.changesTopic
          ?.publish({ kind: 'changed' })
          .catch(() => undefined);
      }),
    );
    // The notification plugin is resolved per send so registration order
    // does not matter and a test container without it stays silent.
    container.singleton(itamNotifierToken, () =>
      createItamNotifier(
        async (input) => {
          if (!container.has(notificationServiceToken)) return;
          await container.resolve(notificationServiceToken).send(input);
        },
        (message, error) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn({ err: error }, message);
        },
        // The deployment's own language: a notification is written into
        // somebody's inbox, and the reader's own choice is a browser setting
        // the server does not hold. A container without i18n — a test's —
        // keeps the notifier's fallback.
        (text) => {
          if ('text' in text) return text.text;
          if (!container.has(i18nToken)) return text.key;
          return container.resolve(i18nToken).getFixedT('itam')(text.key, {
            ...text.params,
          });
        },
      ),
    );
    container.singleton(deviceServiceToken, () =>
      createDeviceService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(numberingServiceToken),
        container.resolve(settingsServiceToken),
        container.resolve(lifecycleRuntimeToken),
      ),
    );
    container.singleton(stockServiceToken, () =>
      createStockService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(settingsServiceToken),
      ),
    );
    container.singleton(entitlementServiceToken, () =>
      createEntitlementService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(settingsServiceToken),
        (entry) => {
          if (!container.has(loggingToken)) return;
          container
            .resolve(loggingToken)
            .getLogger('itam')
            .info(
              { ...entry, event: 'itam.productKey.read' },
              'Product key read',
            );
        },
      ),
    );
    container.singleton(approvalServiceToken, () =>
      createApprovalService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
      ),
    );
    // The work agents' runs and the first of them, 审批审阅 (2026-10-16,
    // plan "Work agents"); the agents' provider starts it on each request
    // and gives it the jobs service.
    container.singleton(agentRunServiceToken, () =>
      createAgentRunService(container.resolve(databaseManagerToken), () => {
        if (container.has(itamChangesToken))
          container.resolve(itamChangesToken).touched();
      }),
    );
    // 报价比较 (2026-10-17): the quotes a purchase order was weighed against.
    container.singleton(quoteComparisonServiceToken, () =>
      createQuoteComparisonService(container.resolve(databaseManagerToken)),
    );
    container.singleton(approvalReviewerToken, () =>
      createApprovalReviewer({
        container,
        // The AI working language (`ai-language.ts`).
        locale: () => container.resolve(aiLanguageToken).current(),
        warn: (detail, message) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn(detail, message);
        },
      }),
    );
    // MDM 跟进 (2026-10-17): what a device sync leaves for a person.
    container.singleton(deviceSyncFollowUpToken, () =>
      createDeviceSyncFollowUp({
        container,
        // The AI working language (`ai-language.ts`).
        locale: () => container.resolve(aiLanguageToken).current(),
        warn: (detail, message) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn(detail, message);
        },
      }),
    );
    container.singleton(attachmentServiceToken, () =>
      createAttachmentService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
      ),
    );
    container.singleton(procurementServiceToken, () =>
      createProcurementService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        numbering: container.resolve(numberingServiceToken),
        settings: container.resolve(settingsServiceToken),
        approvals: container.resolve(approvalServiceToken),
        lifecycles: container.resolve(lifecycleRuntimeToken),
        devices: container.resolve(deviceServiceToken),
        stock: container.resolve(stockServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
        receiptRuns: container.resolve(receiptRunServiceToken),
        approvers: container.resolve(approverDirectoryToken),
      }),
    );
    container.singleton(documentReaderToken, () =>
      createDocumentReader({
        database: container.resolve(databaseManagerToken),
        // Resolved when a document is read: a container without disks
        // (the tests') reads none.
        readBytes: () =>
          container.has(driveManagerToken)
            ? (disk, key) =>
                container.resolve(driveManagerToken).use(disk).getBytes(key)
            : undefined,
      }),
    );
    container.singleton(receiptRunServiceToken, () =>
      createReceiptRunService({
        database: container.resolve(databaseManagerToken),
        readDocument: container.resolve(documentReaderToken),
      }),
    );
    container.singleton(repairServiceToken, () =>
      createRepairService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        settings: container.resolve(settingsServiceToken),
        devices: container.resolve(deviceServiceToken),
        numbering: container.resolve(numberingServiceToken),
        lifecycles: container.resolve(lifecycleRuntimeToken),
      }),
    );
    container.singleton(lifecycleRuntimeToken, () => {
      const dispatcher = this.effectJobs();
      return createItamLifecycleRuntime({
        database: container.resolve(databaseManagerToken),
        approvals: container.resolve(approvalServiceToken),
        notifier: container.resolve(itamNotifierToken),
        ...(dispatcher ? { dispatcher } : {}),
        logger: this.lifecycleLogger(),
      });
    });
    container.singleton(disposalServiceToken, () =>
      createDisposalService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        numbering: container.resolve(numberingServiceToken),
        settings: container.resolve(settingsServiceToken),
        approvals: container.resolve(approvalServiceToken),
        devices: container.resolve(deviceServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
        stock: container.resolve(stockServiceToken),
        lifecycles: container.resolve(lifecycleRuntimeToken),
        approvers: container.resolve(approverDirectoryToken),
      }),
    );
    container.singleton(approverDirectoryToken, () =>
      createApproverDirectory(container, () =>
        container.resolve(lifecycleRuntimeToken),
      ),
    );
    container.singleton(auditServiceToken, () =>
      createAuditService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        devices: container.resolve(deviceServiceToken),
        lifecycles: container.resolve(lifecycleRuntimeToken),
      }),
    );
    container.singleton(importServiceToken, () =>
      createImportService({
        database: container.resolve(databaseManagerToken),
        masterData: container.resolve(masterDataServiceToken),
        devices: container.resolve(deviceServiceToken),
        stock: container.resolve(stockServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
        procurement: container.resolve(procurementServiceToken),
      }),
    );
    container.singleton(maintenanceServiceToken, () =>
      createMaintenanceService({
        database: container.resolve(databaseManagerToken),
        settings: container.resolve(settingsServiceToken),
        history: container.resolve(historyServiceToken),
        devices: container.resolve(deviceServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
        masterData: container.resolve(masterDataServiceToken),
        notifier: container.resolve(itamNotifierToken),
      }),
    );
    container.singleton(workbenchServiceToken, () =>
      createWorkbenchService({
        database: container.resolve(databaseManagerToken),
        approvals: container.resolve(approvalServiceToken),
        onboarding: container.resolve(onboardingServiceToken),
        review: container.resolve(deviceReviewServiceToken),
      }),
    );
    container.singleton(reportServiceToken, () =>
      createReportService(
        container.resolve(databaseManagerToken),
        container.resolve(settingsServiceToken),
      ),
    );
    container.singleton(demoServiceToken, () =>
      createDemoService({
        database: container.resolve(databaseManagerToken),
        masterData: container.resolve(masterDataServiceToken),
        devices: container.resolve(deviceServiceToken),
        stock: container.resolve(stockServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
        procurement: container.resolve(procurementServiceToken),
        repairs: container.resolve(repairServiceToken),
        audits: container.resolve(auditServiceToken),
        disposals: container.resolve(disposalServiceToken),
        numbering: container.resolve(numberingServiceToken),
        deviceSync: container.resolve(deviceSyncServiceToken),
        comments: container.resolve(commentServiceToken),
        agents: {
          runs: container.resolve(agentRunServiceToken),
          followUp: container.resolve(deviceSyncFollowUpToken),
          advisor: container.resolve(onboardingAdvisorToken),
        },
        // Who stands in as the colleague deciding the demo's requests:
        // another account that may approve purchase orders, else any other
        // account. The demo falls back to a stand-in id when it is alone.
        otherUser: async (actorId) => {
          // The accounts belong to the authentication plugin, which a bare
          // harness does not install; without its table there is nobody to
          // ask and the demo keeps its stand-in.
          let rows: readonly { id: string }[];
          try {
            rows = await container
              .resolve(databaseManagerToken)
              .query()
              .selectFrom('user')
              .select(['id'])
              .where('disabledAt', 'is', null)
              .where('deletedAt', 'is', null)
              .orderBy('createdAt')
              .execute<{ id: string }>();
          } catch {
            return undefined;
          }
          const others = rows
            .map((row) => String(row.id))
            .filter((id) => id !== actorId);
          if (others.length === 0 || !container.has(authorizationToken))
            return others[0];
          const permissionSets =
            container.resolve(authorizationToken).permissionSets;
          const approvers = new Set<string>();
          for (const set of await permissionSets.list())
            if (
              set.grants.some(
                (grant) =>
                  grant.resource.type === 'composite' &&
                  grant.resource.id === 'itam.purchaseOrders' &&
                  grant.actions.some((entry) => entry.action === 'approve'),
              )
            )
              for (const assignment of await permissionSets.listAssignments(
                set.key,
              ))
                if (assignment.subject.type === 'user')
                  approvers.add(String(assignment.subject.id));
          return others.find((id) => approvers.has(id)) ?? others[0];
        },
        ...(container.has(userAdministrationServiceToken) &&
        container.has(authorizationToken)
          ? { accounts: demoAccounts(container) }
          : {}),
        // The test harness has no config; the seeds' env override applies.
        locale: () =>
          process.env.APP_DEFAULT_LOCALE ??
          this.app.config?.get<AppI18nConfig>('i18n')?.defaultLocale ??
          'en-US',
      }),
    );
    container.singleton(leaverAccountsToken, () =>
      createLeaverAccounts({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        // Resolved when a leaver is marked, not now: the users and
        // authentication plugins register their services after this
        // provider, and a test application has neither.
        management: () =>
          container.has(userManagementServiceToken)
            ? container.resolve(userManagementServiceToken)
            : undefined,
        accounts: () =>
          container.has(userAdministrationServiceToken)
            ? container.resolve(userAdministrationServiceToken)
            : undefined,
        log: (message, error) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn({ err: error }, message);
        },
      }),
    );
    container.singleton(masterDataServiceToken, () =>
      createMasterDataService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(leaverAccountsToken),
      ),
    );
    // 入职配备: a joiner's kit, what they have and what stock would make
    // up the rest (`onboarding.ts`).
    container.singleton(onboardingServiceToken, () =>
      createOnboardingService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(settingsServiceToken),
      ),
    );
    // Device sync connections: `config.yml`'s, or those entered on 设置 →
    // 设备同步 with the secret sealed (`device-connections.ts`, 2026-10-15).
    container.singleton(deviceConnectionsServiceToken, () =>
      createDeviceConnectionsService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        config: () => this.app.config?.get<DeviceSyncConfig>('deviceSync'),
        secrets: () =>
          container.has(secretsServiceToken)
            ? container.resolve(secretsServiceToken)
            : undefined,
      }),
    );
    // Device sync: the devices Intune reports, kept apart from the register
    // and linked to it by serial (`device-sync.ts`, 2026-10-14). The sources
    // are read from the connections at each pull; a test container has none.
    container.singleton(deviceSyncServiceToken, () =>
      createDeviceSyncService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        // The connections, then the demo standing in for a platform none
        // names (`device-demo-source.ts`, 2026-10-15).
        sources: async () => {
          const connections = container.resolve(deviceConnectionsServiceToken);
          const database = container.resolve(databaseManagerToken);
          return [
            ...configuredSources(await connections.effective()),
            ...(await connections.demoSources()).map((key) =>
              createDemoSource(database, key),
            ),
          ];
        },
        consoles: () =>
          container.resolve(deviceConnectionsServiceToken).effective(),
        touched: () => container.resolve(itamChangesToken).touched(),
        log: (message, error) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn({ err: error }, message);
        },
      }),
    );
    // Device sync, step 2: where the platforms and the register disagree,
    // and a person's decisions about it (`device-review.ts`, 2026-10-15).
    container.singleton(deviceReviewServiceToken, () =>
      createDeviceReviewService({
        database: container.resolve(databaseManagerToken),
        settings: container.resolve(settingsServiceToken),
        history: container.resolve(historyServiceToken),
        sync: container.resolve(deviceSyncServiceToken),
        touched: () => container.resolve(itamChangesToken).touched(),
      }),
    );
    // The changes the assistant proposes, carried out by the person it
    // works for (`plans.ts`).
    container.singleton(planServiceToken, () => createPlanService(container));
    // Asset Steward choosing a joiner's equipment when their 入职负责人 asks, in the
    // background (`onboarding-advisor.ts`).
    container.singleton(onboardingAdvisorToken, () =>
      createOnboardingAdvisor({
        database: container.resolve(databaseManagerToken),
        onboarding: container.resolve(onboardingServiceToken),
        settings: container.resolve(settingsServiceToken),
        runner: createAssistantRunner(container),
        locale: () =>
          process.env.APP_DEFAULT_LOCALE ??
          this.app.config?.get<AppI18nConfig>('i18n')?.defaultLocale ??
          'en-US',
        touched: () => container.resolve(itamChangesToken).touched(),
        log: (message, error) => {
          if (container.has(loggingToken))
            container
              .resolve(loggingToken)
              .getLogger('itam')
              .warn({ err: error }, message);
        },
      }),
    );
  }

  public override async start(): Promise<void> {
    // The AI working language as saved; a database not yet migrated keeps
    // the deployment's locale until the next start.
    try {
      await this.app.container.resolve(aiLanguageToken).load();
    } catch {
      // The default answers.
    }
    // The lifecycles' effects and sweep, and what an earlier process left
    // queued. Like the agents' setup, it never stops the application
    // starting — a database not yet migrated has no log to recover from —
    // and is tried again at the next start.
    const jobs = this.effectJobs();
    if (jobs)
      try {
        await jobs.start(this.app.container.resolve(lifecycleRuntimeToken));
      } catch (error) {
        this.lifecycleLogger().error(
          'The lifecycle effects did not start',
          error,
        );
      }
    if (!this.app.container.has(authorizationToken)) return;
    // The disposals' first approver range, once (approvers.ts); like the
    // effects, it never stops the application starting.
    try {
      await startApproverRange(this.app.container);
    } catch (error) {
      this.lifecycleLogger().error(
        'The disposal approver range was not set up',
        error,
      );
    }
    // Idempotent and cheap: older seeds may have just re-granted the
    // removed tickets collection and pages or the tables that became
    // `entitlements`.
    await reconcileGrants(
      this.app.container.resolve(authorizationToken).permissionSets,
    );
  }

  public override async shutdown(): Promise<void> {
    await this.lifecycleJobs?.shutdown();
  }

  public override boot(): Promise<void> {
    // The sealed client secrets of device sync connections, for `nocobase
    // secrets status` and `secrets rotate` (2026-10-15).
    if (this.app.container.has(secretsServiceToken))
      this.app.container
        .resolve(secretsServiceToken)
        .registerStore(
          createDeviceConnectionsSecretsStore(() =>
            this.app.container.resolve(databaseManagerToken).connection(),
          ),
        );
    // Defined before any page subscribes, which a topic must be.
    if (this.app.container.has(realtimeServiceToken))
      this.changesTopic ??= this.app.container
        .resolve(realtimeServiceToken)
        .defineTopic<ItamChangesEvent, 'public'>(ITAM_CHANGES_TOPIC, {
          audience: 'public',
        });
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authz = this.app.container.resolve(authorizationToken);

    // Registration is the opt-in for granting on a collection. Since beta.43
    // a Collection owns only read / create / update / delete; this
    // application's own operations (assign, issue, approve…) are composite
    // resources, declared in `authz-resources.ts` and registered below.
    const crud = new Set(['read', 'create', 'update', 'delete']);
    for (const collection of ITAM_COLLECTIONS) {
      authz.database.collections.add({
        // The id a request and a stored grant name: the connection-qualified
        // form the routes build (`main.devices`). Registering the bare name
        // leaves every ITAM collection outside the permission model, which
        // denies each read with COLLECTION_NOT_REGISTERED.
        name: `main.${collection.name}`,
        title: collectionTitleOf(collection.name),
        actions: collection.actions.filter((name) => crud.has(name)),
      });
    }
    // The permission workspace lists the operations under one ITAM
    // subsection of 业务, and the settings item under one of 管理.
    authz.ui.sections.add({
      name: ITAM_RESOURCE_SECTION,
      title: 'ITAM',
      parent: 'business',
    });
    for (const resource of ITAM_RESOURCES)
      authz.ui.place(authz.compositeResources.define(resource), {
        section: ITAM_RESOURCE_SECTION,
      });
    authz.ui.sections.add({
      name: `${ITAM_RESOURCE_SECTION}.admin`,
      title: 'ITAM',
      parent: 'administration',
    });
    authz.settings.add({
      id: ITAM_SETTINGS_RESOURCE.id,
      title: ITAM_SETTINGS_TITLE,
      actions: [
        { name: 'read', title: settingsActionTitleOf('read') },
        { name: 'update', title: settingsActionTitleOf('update') },
      ],
    });
    authz.ui.place(ITAM_SETTINGS_RESOURCE, {
      section: `${ITAM_RESOURCE_SECTION}.admin`,
    });

    return Promise.resolve();
  }
}
