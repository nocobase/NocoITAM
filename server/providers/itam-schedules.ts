import type { Application } from '@nocobase/app-server/application';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  maintenanceServiceToken,
  type MaintenanceJob,
} from './itam/maintenance.js';
import { itamChangesToken } from './itam/changes.js';
import { deviceSyncServiceToken } from './itam/device-sync.js';
import { settingsServiceToken } from './itam/settings.js';

/** What each task is called on 设置 → 自动化 → 定时任务, in the deployment's language. */
const TITLES: Readonly<
  Record<string, Readonly<Record<MaintenanceJob, readonly [string, string]>>>
> = {
  'zh-CN': {
    daily: [
      '资产每日维护',
      '顺延自动续订订阅的到期日，释放过期预留，重新计算待办「需要关注」的提醒',
    ],
    monthly: ['资产月度折旧', '按每台设备的折旧方式重算账面价值和累计折旧'],
    leavers: [
      '人员在职状态更新',
      '按入职日期和离职日期更新在职状态：入职日期已到的待入职人员改为在职，离职日期已到的改为已离职；在每日维护之前运行，当天的提醒就能列出离职人员仍持有的资产',
    ],
  },
  'en-US': {
    daily: [
      'Asset daily maintenance',
      'Rolls auto-renewing subscriptions forward, releases lapsed reservations and recomputes the reminders on To-dos',
    ],
    monthly: [
      'Asset monthly depreciation',
      "Recomputes every device's book value and accumulated depreciation",
    ],
    leavers: [
      'People employment status update',
      "Updates employment status from the joining and leave dates: joiners whose first day has come become active, people whose leave date has come are marked as left; runs before the daily maintenance, so that day's reminders list what leavers still hold",
    ],
  },
};

// Noco's nightly pass over the joiners (`itam.onboarding-advice`, 02:30)
// went on 2026-10-06: Noco chooses only when the 入职负责人 asks. A database
// that synchronised it keeps the definition until `scheduler sync
// --finalize` deactivates it; a firing before then finds no definition and
// runs nothing. The work agents' daily pass (`itam.agent-passes`, 02:30,
// target `app.itam.agents`) went the same way on 2026-10-17 with the agents
// it ran (离职回收, 授权续费).
const SCHEDULES: readonly {
  readonly key: string;
  readonly job: MaintenanceJob;
  readonly cron: string;
}[] = [
  { key: 'itam.mark-leavers', job: 'leavers', cron: '50 1 * * *' },
  { key: 'itam.daily-maintenance', job: 'daily', cron: '0 2 * * *' },
  { key: 'itam.monthly-depreciation', job: 'monthly', cron: '0 3 1 * *' },
];

const TARGET_TYPE = 'app.itam.maintenance';

/**
 * Device sync (2026-10-14): its own target, because a pull talks to a
 * platform over the network rather than recomputing from the register.
 * 01:30, before 人员在职状态更新 at 01:50, so a leaver is judged on that
 * night's data.
 */
const SYNC_TARGET_TYPE = 'app.itam.device-sync';
const SYNC_SCHEDULE = { key: 'itam.device-sync', cron: '30 1 * * *' };
const SYNC_TITLES: Readonly<Record<string, readonly [string, string]>> = {
  'zh-CN': [
    '设备同步',
    '从已连接的 MDM（Intune、Jamf Pro）拉取设备清单，更新设备的 MDM 信息，按序列号关联台账设备；没有连接任何平台时什么也不做',
  ],
  'en-US': [
    'Device sync',
    'Pulls the device list from the connected management platforms (Intune, Jamf Pro), updates what each platform reports and links the register devices by serial number; does nothing when no platform is connected',
  ],
};

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

    scheduler.registerTarget<{ job: MaintenanceJob }>({
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
          const summary = await container
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

    scheduler.registerTarget<Record<string, never>>({
      type: SYNC_TARGET_TYPE,
      title: 'ITAM device sync',
      validate: () => ({ valid: true }),
      async start() {
        try {
          const runs = await container
            .resolve(deviceSyncServiceToken)
            .runAll('schedule');
          const failed = runs.filter((run) => run.status !== 'succeeded');
          // A platform that could not be read fails the execution, so the
          // task page shows it; its run on 设置 → MDM says why.
          if (failed.length > 0)
            return {
              state: 'failed',
              reason: failed
                .map(
                  (run) => `${String(run.source)}: ${String(run.failureCode)}`,
                )
                .join('; '),
            };
          return {
            state: 'completed',
            outcome: 'succeeded',
            result: Object.fromEntries(
              runs.map((run) => [
                String(run.source),
                {
                  seen: Number(run.seen),
                  added: Number(run.added),
                  linked: Number(run.linked),
                  gone: Number(run.gone),
                },
              ]),
            ),
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
    const [syncTitle, syncDescription] =
      SYNC_TITLES[locale] ?? SYNC_TITLES['en-US'];
    scheduler.defineSchedule({
      key: SYNC_SCHEDULE.key,
      title: syncTitle,
      description: syncDescription,
      schedule: { cron: SYNC_SCHEDULE.cron, timezone },
      target: { type: SYNC_TARGET_TYPE, config: {} },
    });
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
