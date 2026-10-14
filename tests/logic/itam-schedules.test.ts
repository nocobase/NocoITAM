// @vitest-environment node
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { afterEach, describe, expect, it } from 'vitest';

import ItamSchedulesProvider from '../../server/providers/itam-schedules.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { maintenanceServiceToken } from '../../server/providers/itam/maintenance.js';
import { settingsServiceToken } from '../../server/providers/itam/settings.js';

interface Definition {
  readonly key: string;
  readonly title: string;
  readonly schedule: { readonly cron: string; readonly timezone: string };
  readonly target: { readonly type: string; readonly config: unknown };
}
interface Target {
  readonly type: string;
  validate(config: unknown): { valid: boolean };
  start(
    config: { job: string },
    context: { scheduleId: string; occurrenceId: string },
  ): Promise<Record<string, unknown>>;
}

/** The provider against a stand-in scheduler, settings and maintenance. */
async function boot(
  runJob: (job: string) => Promise<Record<string, unknown>>,
  runAll: () => Promise<Record<string, unknown>[]> = async () => [],
) {
  const defined: Definition[] = [];
  const targets = new Map<string, Target>();
  const services = new Map<unknown, unknown>([
    [
      schedulerServiceToken,
      {
        registerTarget(registered: Target) {
          targets.set(registered.type, registered);
          return { reportCompletion: async () => {} };
        },
        defineSchedule(definition: Definition) {
          defined.push(definition);
        },
      },
    ],
    [
      settingsServiceToken,
      { get: async () => ({ timeZone: 'Asia/Shanghai' }) },
    ],
    [maintenanceServiceToken, { runJob }],
    [deviceSyncServiceToken, { runAll }],
  ]);
  const app = {
    container: {
      has: (token: unknown) => services.has(token),
      resolve: (token: unknown) => services.get(token),
    },
  };
  await new ItamSchedulesProvider(app as never).boot();
  return {
    defined,
    target: targets.get('app.itam.maintenance')!,
    sync: targets.get('app.itam.device-sync')!,
  };
}

describe('ITAM schedules', () => {
  const locale = process.env.APP_DEFAULT_LOCALE;
  afterEach(() => {
    if (locale === undefined) delete process.env.APP_DEFAULT_LOCALE;
    else process.env.APP_DEFAULT_LOCALE = locale;
  });

  it('defines the leaver, daily and monthly tasks in the configured zone and language', async () => {
    process.env.APP_DEFAULT_LOCALE = 'zh-CN';
    const { defined, target } = await boot(async () => ({}));
    expect(
      defined.map((definition) => [
        definition.key,
        definition.schedule.cron,
        definition.schedule.timezone,
        definition.target.config,
      ]),
    ).toEqual([
      ['itam.mark-leavers', '50 1 * * *', 'Asia/Shanghai', { job: 'leavers' }],
      [
        'itam.daily-maintenance',
        '0 2 * * *',
        'Asia/Shanghai',
        { job: 'daily' },
      ],
      [
        'itam.monthly-depreciation',
        '0 3 1 * *',
        'Asia/Shanghai',
        { job: 'monthly' },
      ],
      // Device sync (2026-10-14), before the leavers are judged at 01:50.
      ['itam.device-sync', '30 1 * * *', 'Asia/Shanghai', {}],
    ]);
    expect(defined[3]!.title).toBe('设备同步');
    expect(defined[3]!.target.type).toBe('app.itam.device-sync');
    expect(defined[0]!.title).toBe('人员在职状态更新');
    expect(defined[1]!.title).toBe('资产每日维护');
    expect(target.validate({ job: 'daily' }).valid).toBe(true);
    expect(target.validate({ job: 'leavers' }).valid).toBe(true);
    // Noco chooses only when asked (2026-10-06): no nightly task.
    expect(target.validate({ job: 'onboardingAdvice' }).valid).toBe(false);
    expect(target.validate({ job: 'reminders' }).valid).toBe(false);
  });

  it('reports what a run did as counts, and a failure as its reason', async () => {
    const { target } = await boot(async (job) => {
      if (job === 'monthly') throw new Error('Depreciation failed');
      return {
        subscriptions: 1,
        reservationsReleased: 0,
        reminders: [
          { kind: 'lowStock', count: 2, severity: 'warning' },
          { kind: 'loanOverdue', count: 0, severity: 'info' },
        ],
      };
    });
    const context = { scheduleId: 's', occurrenceId: 'o' };
    expect(await target.start({ job: 'daily' }, context)).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: {
        subscriptions: 1,
        reservationsReleased: 0,
        reminders: { lowStock: 2 },
      },
    });
    expect(await target.start({ job: 'monthly' }, context)).toEqual({
      state: 'failed',
      reason: 'Depreciation failed',
    });
  });

  it("reports each platform's pull, and fails the run when a platform could not be read", async () => {
    let runs: Record<string, unknown>[] = [
      {
        source: 'intune',
        status: 'succeeded',
        seen: 12,
        added: 2,
        linked: 1,
        gone: 0,
      },
    ];
    const { sync } = await boot(
      async () => ({}),
      async () => runs,
    );
    const context = { scheduleId: 's', occurrenceId: 'o' };
    expect(await sync.start({} as never, context)).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: { intune: { seen: 12, added: 2, linked: 1, gone: 0 } },
    });
    runs = [{ source: 'intune', status: 'failed', failureCode: 'AUTH_FAILED' }];
    expect(await sync.start({} as never, context)).toEqual({
      state: 'failed',
      reason: 'intune: AUTH_FAILED',
    });
  });
});
