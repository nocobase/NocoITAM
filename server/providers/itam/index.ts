import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';

import { reconcileGrants } from './reconcile-grants.js';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  realtimeServiceToken,
  type RealtimePublicTopic,
} from '@nocobase/app-server/realtime';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { registerAiBridge } from './ai-bridge.js';
import { approvalServiceToken, createApprovalService } from './approvals.js';
import { auditServiceToken, createAuditService } from './audits.js';
import { deviceServiceToken, createDeviceService } from './devices.js';
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
import { createImportService, importServiceToken } from './imports.js';
import {
  createProcurementService,
  procurementServiceToken,
} from './procurement.js';
import { ITAM_COLLECTIONS, ITAM_SETTINGS_RESOURCE } from './collections.js';
import { ITAM_RESOURCE_SECTION, ITAM_RESOURCES } from './authz-resources.js';
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
  createMasterDataService,
  masterDataServiceToken,
} from './master-data.js';
import {
  createMaintenanceService,
  maintenanceServiceToken,
} from './maintenance.js';
import { i18nToken } from '@nocobase/app-server/i18n';
import { createItamNotifier, itamNotifierToken } from './notifier.js';
import { createNumberingService, numberingServiceToken } from './numbering.js';
import { createRepairService, repairServiceToken } from './repairs.js';
import { createReportService, reportServiceToken } from './reports.js';
import { createSettingsService, settingsServiceToken } from './settings.js';
import { createWorkbenchService, workbenchServiceToken } from './workbench.js';
import {
  createLeaverAccounts,
  leaverAccountsToken,
} from './leaver-accounts.js';

export {
  approvalServiceToken,
  deviceServiceToken,
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
  return {
    async create(spec) {
      const users = container.resolve(userAdministrationServiceToken);
      const permissionSets =
        container.resolve(authorizationToken).permissionSets;
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
      // account through the authentication plugin, which owns the row.
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
      const database = container.resolve(databaseManagerToken);
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

  public override register(): void {
    const container = this.app.container;
    container.singleton(settingsServiceToken, () =>
      createSettingsService(container.resolve(databaseManagerToken)),
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
    // "The register changed": published on the realtime topic the pages
    // that show live to-dos subscribe to (`changes.ts`). The topic is
    // defined at boot; a container without realtime publishes nothing.
    container.singleton(itamChangesToken, () =>
      createItamChanges(() =>
        this.changesTopic?.publish({ kind: 'changed' }),
      ),
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
          return container
            .resolve(i18nToken)
            .getFixedT('itam')(text.key, { ...text.params });
        },
      ),
    );
    container.singleton(deviceServiceToken, () =>
      createDeviceService(
        container.resolve(databaseManagerToken),
        container.resolve(historyServiceToken),
        container.resolve(numberingServiceToken),
        container.resolve(settingsServiceToken),
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
        notifier: container.resolve(itamNotifierToken),
        devices: container.resolve(deviceServiceToken),
        stock: container.resolve(stockServiceToken),
        entitlements: container.resolve(entitlementServiceToken),
      }),
    );
    container.singleton(repairServiceToken, () =>
      createRepairService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        settings: container.resolve(settingsServiceToken),
        devices: container.resolve(deviceServiceToken),
        numbering: container.resolve(numberingServiceToken),
      }),
    );
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
        notifier: container.resolve(itamNotifierToken),
      }),
    );
    container.singleton(auditServiceToken, () =>
      createAuditService({
        database: container.resolve(databaseManagerToken),
        history: container.resolve(historyServiceToken),
        devices: container.resolve(deviceServiceToken),
        notifier: container.resolve(itamNotifierToken),
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
      }),
    );
    container.singleton(reportServiceToken, () =>
      createReportService(
        container.resolve(databaseManagerToken),
        container.resolve(settingsServiceToken),
      ),
    );
    // AI tools under `ai/` are registered with the AI plugin at boot and
    // reach the ITAM services through this bridge.
    registerAiBridge(container);
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
        refreshReminders: () =>
          container.resolve(maintenanceServiceToken).computeReminders(),
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
  }

  public override async start(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    // Idempotent and cheap: older seeds may have just re-granted the
    // removed tickets collection and pages or the tables that became
    // `entitlements`.
    await reconcileGrants(
      this.app.container.resolve(authorizationToken).permissionSets,
    );
  }

  public override boot(): Promise<void> {
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
        title: collection.title,
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
      title: 'ITAM settings',
      actions: [{ name: 'read' }, { name: 'update' }],
    });
    authz.ui.place(ITAM_SETTINGS_RESOURCE, {
      section: `${ITAM_RESOURCE_SECTION}.admin`,
    });

    // The ITAM assistant and its tools (`ai/`), registered with the AI
    // employee plugin here, after every provider registered its services.
    // The plugin loads only what a registrar hands it; it does not scan
    // `ai/`, so without this the employee and its tools do not exist.
    // Imported here rather than at the top: the tools import this module's
    // services, and a static import would evaluate them mid-cycle.
    if (this.app.container.has(aiManagerToken)) {
      const ai = this.app.container.resolve(aiManagerToken);
      const settings = this.app.container.resolve(settingsServiceToken);
      return import('../../../ai/index.js').then(
        ({ ItamAiResources, LOGO_AVATAR_PATH }) => {
          // The employee's avatar is the application's mark. The record keeps
          // the root-relative path, which the client resolves under the mount
          // path; with a public origin configured it is absolutised, so the
          // plugin's own settings pages — which render it outside this
          // application — show it too. NocoCRM does the same.
          const identity = this.app.config.get<{ publicOrigin?: string }>('app');
          const origin = (identity?.publicOrigin ?? '')
            .toString()
            .trim()
            .replace(/\/+$/, '');
          const avatar = origin
            ? `${origin}${this.app.publicBasePath.replace(/\/+$/, '')}${LOGO_AVATAR_PATH}`
            : undefined;
          return new ItamAiResources(settings, avatar).registerAIResources(ai);
        },
      );
    }
    return Promise.resolve();
  }
}
