import type { Application } from '@nocobase/app-server/application';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  maintenanceServiceToken,
  type MaintenanceJob,
} from './itam/maintenance.js';
import { itamChangesToken } from './itam/changes.js';
import { onboardingAdvisorToken } from './itam/onboarding-advisor.js';
import { settingsServiceToken } from './itam/settings.js';

/**
 * A scheduled job: the maintenance service's, or Noco's nightly pass over
 * the joiners (`onboarding-advisor.ts`).
 */
type ScheduledJob = MaintenanceJob | 'onboardingAdvice';

/** What each task is called on 设置 → 自动化 → 定时任务, in the deployment's language. */
const TITLES: Readonly<
  Record<string, Readonly<Record<ScheduledJob, readonly [string, string]>>>
> = {
  'zh-CN': {
    daily: [
      '资产每日维护',
      '顺延自动续订订阅的到期日，释放过期预留，重新计算工作台「需要关注」的提醒',
    ],
    monthly: ['资产月度折旧', '按每台设备的折旧方式重算账面价值和累计折旧'],
    leavers: [
      '人员离职状态更新',
      '把离职日期已到（当天或更早）仍是在职的人员标记为已离职；在每日维护之前运行，当天的提醒就能列出他们仍持有的资产',
    ],
    onboardingAdvice: [
      '入职配备建议',
      '让 Noco 以入职负责人的身份，为两周内入职、还没挑过或上次没挑成的新人挑选库存里的设备、配件和授权，并写明理由；结果显示在新人的入职配备卡片上，由入职负责人确认或更换',
    ],
  },
  'en-US': {
    daily: [
      'Asset daily maintenance',
      'Rolls auto-renewing subscriptions forward, releases lapsed reservations and recomputes the workbench reminders',
    ],
    monthly: [
      'Asset monthly depreciation',
      "Recomputes every device's book value and accumulated depreciation",
    ],
    leavers: [
      'People leave status update',
      "Marks people still active whose leave date has come as left; runs before the daily maintenance, so that day's reminders list what they still hold",
    ],
    onboardingAdvice: [
      'Onboarding suggestions',
      "Has Noco, as each joiner's onboarding owner, choose devices, accessories and seats in stock for joiners starting within two weeks that have none chosen yet or whose last choice failed, with a reason for each; the onboarding owner confirms or changes them on the joiner's onboarding card",
    ],
  },
};

const SCHEDULES: readonly {
  readonly key: string;
  readonly job: ScheduledJob;
  readonly cron: string;
}[] = [
  { key: 'itam.mark-leavers', job: 'leavers', cron: '50 1 * * *' },
  { key: 'itam.daily-maintenance', job: 'daily', cron: '0 2 * * *' },
  // After the daily run, which releases lapsed reservations: a device it
  // freed is a candidate again.
  {
    key: 'itam.onboarding-advice',
    job: 'onboardingAdvice',
    cron: '30 2 * * *',
  },
  { key: 'itam.monthly-depreciation', job: 'monthly', cron: '0 3 1 * *' },
];

const TARGET_TYPE = 'app.itam.maintenance';

/**
 * The ITAM maintenance jobs, scheduled through the scheduler plugin so an
 * administrator sees each execution — when it ran, whether it succeeded,
 * what it did — at 设置 → 自动化 → 定时任务, and can disable one there (replaced the
 * application's own cron and `jobRuns` table on 2026-09-28). The target runs
 * the job inside `start()`: each is a few queries, short enough for the
 * schedule worker, and re-running one repeats nothing (renewals roll only
 * passed dates, reminders and depreciation are recomputed from the data).
 *
 * The time zone is the ITAM setting read at start-up, so a changed zone
 * takes effect after a restart, when the definitions are synchronised again.
 */
export default class ItamSchedulesProvider extends ServiceProvider<Application> {
  public readonly name: string = 'itam/schedules';

  public override async boot(): Promise<void> {
    const container = this.app.container;
    // The test harness and the CLI load no scheduler.
    if (!container.has(schedulerServiceToken)) return;
    const scheduler = container.resolve(schedulerServiceToken);

    scheduler.registerTarget<{ job: ScheduledJob }>({
      type: TARGET_TYPE,
      title: 'ITAM maintenance',
      validate: (config) =>
        config !== null &&
        typeof config === 'object' &&
        !Array.isArray(config) &&
        SCHEDULES.some(
          (schedule) => schedule.job === (config as { job?: unknown }).job,
        )
          ? { valid: true }
          : { valid: false, reason: 'unknown-maintenance-job' },
      async start(config) {
        try {
          // Noco's runs go on after this returns, one after another: the
          // execution records how many it started, and each run's outcome
          // is on its joiner's card.
          const summary =
            config.job === 'onboardingAdvice'
              ? await container.resolve(onboardingAdvisorToken).nightly()
              : await container
                  .resolve(maintenanceServiceToken)
                  .runJob(config.job);
          // A leaver marked at 01:50 or a loan now overdue reaches pages
          // left open overnight.
          if (container.has(itamChangesToken))
            container.resolve(itamChangesToken).touched();
          return {
            state: 'completed',
            outcome: 'succeeded',
            result: resultOf(summary),
          };
        } catch (error) {
          return {
            state: 'failed',
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });

    // Settings live in a table, so a database whose migrations have not run
    // yet has none; the tasks then keep UTC until the next start.
    let timezone = 'UTC';
    try {
      timezone = (await container.resolve(settingsServiceToken).get('general'))
        .timeZone;
    } catch {
      // Keep UTC.
    }
    const locale =
      process.env.APP_DEFAULT_LOCALE ??
      this.app.config?.get<AppI18nConfig>('i18n')?.defaultLocale ??
      'en-US';
    const titles = TITLES[locale] ?? TITLES['en-US'];
    for (const schedule of SCHEDULES) {
      const [title, description] = titles[schedule.job];
      scheduler.defineSchedule({
        key: schedule.key,
        title,
        description,
        schedule: { cron: schedule.cron, timezone },
        target: { type: TARGET_TYPE, config: { job: schedule.job } },
      });
    }
  }
}

/**
 * The execution's result as the task page shows it: counts only. A
 * reminder list becomes its count per kind.
 */
function resultOf(
  summary: Readonly<Record<string, unknown>>,
): Record<string, number | Record<string, number>> {
  const result: Record<string, number | Record<string, number>> = {};
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === 'number') result[key] = value;
    else if (Array.isArray(value))
      result[key] = Object.fromEntries(
        (value as { kind: string; count: number }[])
          .filter((entry) => entry.count > 0)
          .map((entry) => [entry.kind, entry.count]),
      );
  }
  return result;
}
