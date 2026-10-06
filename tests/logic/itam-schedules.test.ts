// @vitest-environment node
import { schedulerServiceToken } from '@nocobase/app-plugin-scheduler/server/tokens';
import { afterEach, describe, expect, it } from 'vitest';

import ItamSchedulesProvider from '../../server/providers/itam-schedules.js';
import { maintenanceServiceToken } from '../../server/providers/itam/maintenance.js';
import { onboardingAdvisorToken } from '../../server/providers/itam/onboarding-advisor.js';
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
async function boot(runJob: (job: string) => Promise<Record<string, unknown>>) {
  const defined: Definition[] = [];
  let target: Target | undefined;
  const services = new Map<unknown, unknown>([
    [
      schedulerServiceToken,
      {
        registerTarget(registered: Target) {
          target = registered;
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
    [
      onboardingAdvisorToken,
      { nightly: async () => ({ considered: 3, started: 2 }) },
    ],
  ]);
  const app = {
    container: {
      has: (token: unknown) => services.has(token),
      resolve: (token: unknown) => services.get(token),
    },
  };
  await new ItamSchedulesProvider(app as never).boot();
  return { defined, target: target! };
}

describe('ITAM schedules', () => {
  const locale = process.env.APP_DEFAULT_LOCALE;
  afterEach(() => {
    if (locale === undefined) delete process.env.APP_DEFAULT_LOCALE;
    else process.env.APP_DEFAULT_LOCALE = locale;
  });

  it('defines the leaver, daily, onboarding and monthly tasks in the configured zone and language', async () => {
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
        'itam.onboarding-advice',
        '30 2 * * *',
        'Asia/Shanghai',
        { job: 'onboardingAdvice' },
      ],
      [
        'itam.monthly-depreciation',
        '0 3 1 * *',
        'Asia/Shanghai',
        { job: 'monthly' },
      ],
    ]);
    expect(defined[0]!.title).toBe('人员在职状态更新');
    expect(defined[1]!.title).toBe('资产每日维护');
    expect(target.validate({ job: 'daily' }).valid).toBe(true);
    expect(target.validate({ job: 'leavers' }).valid).toBe(true);
    expect(target.validate({ job: 'onboardingAdvice' }).valid).toBe(true);
    expect(defined[2]!.title).toBe('入职配备建议');
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
    // Noco's pass reports how many joiners it looked at and how many runs
    // it started; the runs themselves go on after it returns.
    expect(await target.start({ job: 'onboardingAdvice' }, context)).toEqual({
      state: 'completed',
      outcome: 'succeeded',
      result: { considered: 3, started: 2 },
    });
    expect(await target.start({ job: 'monthly' }, context)).toEqual({
      state: 'failed',
      reason: 'Depreciation failed',
    });
  });
});
