import { databaseManagerToken } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import { demoDataToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  DEMO_LANGUAGES,
  DEMO_STAFF,
  demoAccountsIn,
  demoServiceToken,
  type DemoLanguage,
} from './itam/demo.js';

/** Adapt the existing ITAM story; Demo Mode owns lifecycle, accounts and resets. */
export default class ItamDemoModeProvider extends ServiceProvider<Application> {
  public readonly name = 'itam/demo-mode';

  public override async boot(): Promise<void> {
    const data = this.app.container.resolve(demoDataToken);
    const demo = this.app.container.resolve(demoServiceToken);
    data.register({
      id: 'itam',
      languages: DEMO_LANGUAGES,
      accounts: (language) =>
        demoAccountsIn(language as DemoLanguage).map((account) => ({
          ...account,
          role:
            DEMO_STAFF[language as DemoLanguage].find(
              (spec) => spec.username === account.username,
            )?.position ?? DEMO_STAFF[language as DemoLanguage][2].position,
        })),
      timeZone: (language) => (language === 'zh-CN' ? 'Asia/Shanghai' : 'UTC'),
      generate: async (context) => {
        // First import can adopt the already generated story without rewriting
        // any business row. Legacy identities stay under the old cleanup until
        // the first reset; new identities then belong entirely to the plugin.
        const existing = await demo.status();
        if (existing.generated) {
          const records = await this.app.container
            .resolve(databaseManagerToken)
            .query()
            .selectFrom('demoRecords')
            .select(['collection', 'recordId'])
            .execute<{ collection: string; recordId: string }>();
          for (const record of records)
            if (!['accounts', 'importerGrants'].includes(record.collection))
              await context.track(record.collection, record.recordId);
          await context.setData({ adoptedLegacyData: true });
          await context.progress(1);
          return;
        }

        await demo.generate(context.actorId, context.language as DemoLanguage, {
          createAccount: (spec) =>
            context.createAccount({
              username: spec.username,
              name: spec.name,
              email: spec.email,
              password: spec.password,
              roleScopes: { app: [spec.permissionSet] },
            }),
          progress: (fraction) => context.progress(fraction),
          track: (collection, id) => context.track(collection, id),
        });
      },
      clear: async (context) => {
        await demo.clear(context.actorId, { allBusiness: true });
      },
      counts: async () => {
        const counts = (await demo.status()).counts;
        // Present business totals, not the generator's internal tracking rows.
        return Object.fromEntries(
          [
            'devices',
            'stockItems',
            'entitlements',
            'purchaseOrders',
            'repairs',
            'auditTasks',
            'disposals',
            'people',
            'models',
            'manufacturers',
            'vendors',
            'locations',
            'categories',
            'onboardingKits',
          ]
            .filter((key) => counts[key] !== undefined)
            .map((key) => [key, counts[key]]),
        );
      },
    });
  }
}
