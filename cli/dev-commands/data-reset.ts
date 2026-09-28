import { Command, Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import path from 'node:path';

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
import { ServiceContainer } from '@nocobase/service-provider';

import { demoAccountUsernames } from '../../server/providers/itam/demo.js';
import ItamProvider, {
  demoServiceToken,
} from '../../server/providers/itam/index.js';
import { createApp } from '../../server/app.js';
import appRuntime from '../../server/runtime.js';

/**
 * Every ITAM-owned table, children before parents. Users, sessions,
 * permission sets and the other plugins' tables are not touched, so the
 * developer stays signed in with the same roles.
 */
const ITAM_TABLES = [
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
  'itamSettings',
] as const;

export default class AppDataReset extends Command {
  static override summary =
    'Development only: wipe ITAM data and re-run the seeds.';
  static override description =
    'Deletes every ITAM table and the ITAM seed history, then runs the seeds again so edited seed files take effect. Users, sessions and permission sets stay. --demo generates the demo data afterwards as the first user.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --demo',
  ];

  static override flags: {
    demo: Interfaces.BooleanFlag<boolean>;
  } = {
    demo: Flags.boolean({
      default: false,
      description: 'Generate the demo data after seeding.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDataReset);
    // Flags reach development commands unparsed (inspect:server --json has
    // the same gap), so the raw argument decides too.
    const demo = flags.demo || process.argv.includes('--demo');
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir: path.resolve(import.meta.dirname, '..', '..'),
    });
    // Since template beta.43 the configuration is read by namespace and the
    // task runner takes the application's plan (paths, contributions and
    // container), the way `pnpm db:apply` assembles it.
    const app = createApp(runtime);
    const config = app.config.get<AppDatabaseConfig>('database');
    if (!config) this.error('No database is configured.');
    const database = createAppDatabaseManager(config, app.paths);
    if (!database) this.error('No database is configured.');

    try {
      for (const table of ITAM_TABLES)
        await database.query().deleteFrom(table).allowAllRows().execute();
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
        // The AI plugin's conversations reference the user, so an account
        // that talked to the assistant cannot be deleted before them. They
        // were the demo account's, and go with it.
        const sessions = await database
          .query()
          .selectFrom('aiConversations' as never)
          .select(['sessionId' as never])
          .where('userId' as never, '=', id)
          .execute<{ sessionId: string }>();
        const sessionIds = sessions.map((row) => row.sessionId);
        if (sessionIds.length > 0)
          for (const table of ['aiToolMessages', 'aiMessages'] as const)
            await database
              .query()
              .deleteFrom(table as never)
              .where('sessionId' as never, 'in', sessionIds as never)
              .execute();
        for (const table of [
          'aiUsageEvents',
          'aiConversations',
          'usersAiEmployees',
        ] as const)
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
      // an administrator's own edits have to be kept.)
      const sets = ['itam-employee', 'itam-it-support', 'itam-asset-manager'];
      await database
        .query()
        .deleteFrom('authorizationPermissionSets' as never)
        .where('key' as never, 'in', sets as never)
        .execute();
      this.log(
        `Wiped ${ITAM_TABLES.length} ITAM tables, the seed history, ${accounts.length} demo accounts and ${sets.length} permission sets.`,
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
      this.log(
        `[${entry.connection}] seeds: ${entry.status}${entry.error ? `: ${entry.error}` : ''} (${entry.executed?.length ?? 0} executed)`,
      );
    if (!seeded.ok) this.exit(1);
    if (!demo) return;
    this.log('Generating demo data…');

    // The demo runs through the services, so a container with the same
    // doubles the tests use stands in for the running application.
    const demoDatabase = createAppDatabaseManager(config, app.paths);
    if (!demoDatabase) this.error('No database is configured.');
    try {
      const actor = await demoDatabase
        .query()
        .selectFrom('user' as never)
        .select(['id' as never])
        .orderBy('createdAt' as never)
        .executeTakeFirst<{ id: string }>();
      if (!actor) this.error('Sign up a user first; the demo needs an actor.');
      const container = new ServiceContainer();
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
      const pass = async (_context: unknown, next: () => Promise<void>) =>
        next();
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
      this.log(`Demo data generated: ${JSON.stringify(summary.counts)}`);
      // Sign-ins need the authentication and users plugins, which this bare
      // container does not assemble, so this command generates the records
      // without them. Generating from the running application (设置 →
      // 演示数据) creates the demo accounts as well.
      this.log(
        'No demo sign-ins were created: generate the demo from the running application for those.',
      );
    } finally {
      await demoDatabase.destroy();
    }
  }
}
