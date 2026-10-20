import path from 'node:path';
import { parseArgs } from 'node:util';

import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  createAppDatabaseManager,
  runAppDatabaseTasks,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceContainer,
  type ServiceFactory,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  approverDirectoryToken,
  type ApproverDirectory,
} from '../server/providers/itam/approvers.js';
import { demoAccountUsernames } from '../server/providers/itam/demo.js';
import ItamProvider, {
  demoServiceToken,
} from '../server/providers/itam/index.js';
import { createApp } from '../server/app.js';
import appRuntime from '../server/runtime.js';

/**
 * Development only: wipe ITAM data and re-run the seeds.
 *
 * Deletes every ITAM table and the ITAM seed history, then runs the seeds
 * again so edited seed files take effect. Users, sessions and permission sets
 * stay. `--demo` generates the demo data afterwards as the first user.
 *
 *   pnpm --silent data:reset [--demo]
 *
 * A script rather than a `pnpm nocobase app …` command: since
 * `@nocobase/app-cli` 1.0 every application command ships in the deployment's
 * `dist/cli`, and a command that wipes the database has no business there.
 */

/**
 * Every ITAM-owned table, children before parents. Users, sessions,
 * permission sets and the other plugins' tables are not touched, so the
 * developer stays signed in with the same roles.
 */
const ITAM_TABLES = [
  // Work agents' runs and the plans Asset Steward and they proposed (2026-10-17).
  'itamAgentRuns',
  'itamPlanSteps',
  'itamPlans',
  // Device sync (2026-10-14, 2026-10-15).
  'deviceSyncDismissals',
  'deviceSyncExemptions',
  'managedDevices',
  'deviceSyncRuns',
  'onboardingRuns',
  'receiptRuns',
  'reminders',
  'demoRecords',
  'attachmentLinks',
  'itamFiles',
  'changeLogs',
  'historyEvents',
  'allocations',
  'approvals',
  'disposalDevices',
  'disposals',
  'auditItems',
  'auditTasks',
  'repairs',
  'purchaseReceipts',
  'purchaseOrderLines',
  'purchaseOrders',
  'entitlementSeats',
  'entitlements',
  'stockMovements',
  'stockHoldings',
  'stockItems',
  'devices',
  'people',
  'departments',
  'locations',
  'softwareProducts',
  'models',
  'manufacturers',
  'vendors',
  'categories',
  'numberSequences',
] as const;

/**
 * `itamSettings` rows that stay: the markers of what ITAM created in the
 * Agents plugin (Asset Steward, the work agents, the skills). The plugin's own
 * tables are not wiped, so without its marker the next start would create
 * a second Asset Steward beside the first, as a development database once did
 * (2026-10-17). Every other settings row is wiped as before.
 */
const KEPT_SETTINGS_PREFIX = 'agents-';

/**
 * The demo's container: the provider's own services, except that anyone may
 * be asked to approve. The authorization double below allows everything,
 * but the approver range stored in the database still names the IT Asset
 * Manager set, and without the accounts plugins nobody holds it — so the
 * demo's stand-in approver was refused on submit (`APPROVER_NOT_IN_RANGE`,
 * since purchase orders got a range on 2026-10-19). The range agrees with
 * the authorization double instead; the running application checks it as
 * written.
 */
class DemoContainer extends ServiceContainer {
  override singleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>) {
    if (token !== (approverDirectoryToken as ServiceToken<unknown>))
      return super.singleton(token, factory);
    super.singleton(token, (resolver) => {
      const directory = factory(resolver) as ApproverDirectory;
      return {
        ...directory,
        mayApprove: async () => true,
      } satisfies ApproverDirectory as T;
    });
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { demo: { type: 'boolean', default: false } },
  });
  const demo = values.demo;
  const runtime = await resolveStandaloneAppRuntime(appRuntime, {
    rootDir: path.resolve(import.meta.dirname, '..'),
  });
  // Since template beta.43 the configuration is read by namespace and the
  // task runner takes the application's plan (paths, contributions and
  // container), the way `pnpm db:apply` assembles it.
  const app = createApp(runtime);
  const config = app.config.get<AppDatabaseConfig>('database');
  if (!config) return fail('No database is configured.');
  const database = createAppDatabaseManager(config, app.paths);
  if (!database) return fail('No database is configured.');

  try {
    for (const table of ITAM_TABLES)
      await database.query().deleteFrom(table).allowAllRows().execute();
    await database
      .query()
      .deleteFrom('itamSettings')
      .where('key', 'not like', `${KEPT_SETTINGS_PREFIX}%`)
      .execute();
    await database
      .query()
      .deleteFrom('__nocobase_seeds' as never)
      .where('packageName' as never, '=', 'itam')
      .execute();
    // The demo's own sign-ins go with it. They are tracked in
    // `demoRecords`, which the wipe above empties, so they are removed by
    // the names the demo owns instead — leaving them behind would strand
    // accounts whose person records no longer exist.
    const usernames = demoAccountUsernames();
    const accounts = await database
      .query()
      .selectFrom('user' as never)
      .select(['id' as never])
      .where('username' as never, 'in', usernames as never)
      .execute<{ id: string }>();
    for (const table of ['session', 'account'] as const)
      for (const { id } of accounts)
        await database
          .query()
          .deleteFrom(table as never)
          .where('userId' as never, '=', id)
          .execute();
    for (const { id } of accounts) {
      // The Agents plugin's conversations, their messages and chat
      // preference were the demo account's, and go with it. Since Agents
      // 1.0 (2026-10-20) they live in `ag*` tables; the old AI plugin's
      // `ai*` tables are gone, and reading them stopped the reset.
      const conversations = await database
        .query()
        .selectFrom('agConversations' as never)
        .select(['id' as never])
        .where('userId' as never, '=', id)
        .execute<{ id: string }>();
      const conversationIds = conversations.map((row) => row.id);
      if (conversationIds.length > 0)
        await database
          .query()
          .deleteFrom('agConversationMessages' as never)
          .where('conversationId' as never, 'in', conversationIds as never)
          .execute();
      for (const table of ['agConversations', 'agChatPreferences'] as const)
        await database
          .query()
          .deleteFrom(table as never)
          .where('userId' as never, '=', id)
          .execute();
      await database
        .query()
        .deleteFrom('authorizationPermissionSetAssignments' as never)
        .where('subjectId' as never, '=', id)
        .execute();
      await database
        .query()
        .deleteFrom('user' as never)
        .where('id' as never, '=', id)
        .execute();
    }
    // The three seeded Permission Sets go too. The seed writes a set only
    // when it is absent, so editing a grant in it has no effect on a
    // database that already ran it — which is the whole point of this
    // command. Assignments name a set by key and survive the rewrite.
    // (`reconcile-grants.ts` is the other path, for a real upgrade, where
    // an administrator's own edits have to be kept.) The Employee set is no
    // longer seeded (2026-10-05) and is listed only so an older database
    // loses it here too.
    const sets = ['itam-employee', 'itam-it-support', 'itam-asset-manager'];
    await database
      .query()
      .deleteFrom('authorizationPermissionSets' as never)
      .where('key' as never, 'in', sets as never)
      .execute();
    console.log(
      `Wiped ${ITAM_TABLES.length} ITAM tables, the settings but the Agents markers, the seed history, ${accounts.length} demo accounts and ${sets.length} permission sets.`,
    );
  } finally {
    await database.destroy();
  }

  const seeded = await runAppDatabaseTasks(config, {
    kind: 'seeds',
    paths: app.paths,
    runtimeConfig: app.config,
    container: app.container,
    contributions: app.databaseTaskContributions,
  });
  for (const entry of seeded.results)
    console.log(
      `[${entry.connection}] seeds: ${entry.status}${entry.error ? `: ${entry.error}` : ''} (${entry.executed?.length ?? 0} executed)`,
    );
  if (!seeded.ok) return fail('Seeding failed.');
  if (!demo) return;
  console.log('Generating demo data…');

  // The demo runs through the services, so a container with the same
  // doubles the tests use stands in for the running application.
  const demoDatabase = createAppDatabaseManager(config, app.paths);
  if (!demoDatabase) return fail('No database is configured.');
  try {
    const actor = await demoDatabase
      .query()
      .selectFrom('user' as never)
      .select(['id' as never])
      .orderBy('createdAt' as never)
      .executeTakeFirst<{ id: string }>();
    if (!actor) return fail('Sign up a user first; the demo needs an actor.');
    const container = new DemoContainer();
    container.instance(databaseManagerToken, demoDatabase);
    container.instance(notificationServiceToken, {
      send: async (input: { idempotencyKey: string }) => ({
        notificationId: '0',
        idempotencyKey: input.idempotencyKey,
        deduplicated: false,
        status: 'completed',
        deliveries: [],
      }),
    } as never);
    const pass = async (_context: unknown, next: () => Promise<void>) => next();
    container.instance(authenticationToken, {
      required: () => pass,
      optional: () => pass,
    } as never);
    container.instance(authorizationToken, {
      middleware: () => pass,
      guard: () => pass,
      for: () => ({
        identity: { principal: { type: 'user', id: actor.id }, subjects: [] },
        authorize: async () => ({ effect: 'allow', reasons: [] }),
        can: async () => true,
      }),
    } as never);
    // The demo writes its texts in the configured default locale.
    new ItamProvider({
      container,
      config: app.config,
    } as never).register();
    const summary = await container
      .resolve(demoServiceToken)
      .generate(actor.id);
    console.log(`Demo data generated: ${JSON.stringify(summary.counts)}`);
    // Sign-ins need the authentication and users plugins, which this bare
    // container does not assemble, so this command generates the records
    // without them. Generating from the running application (设置 →
    // 演示数据) creates the demo accounts as well.
    console.log(
      'No demo sign-ins were created: generate the demo from the running application for those.',
    );
  } finally {
    await demoDatabase.destroy();
  }
}

await main();
