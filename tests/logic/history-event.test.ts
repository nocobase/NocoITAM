import { I18nRuntime } from '@nocobase/i18n';
import { expect, it } from 'vitest';

import { describeEvent } from '../../client/lib/itam/history-event.js';
import zhCN from '../../client/locales/zh-CN.js';
import enUS from '../../client/locales/en-US.js';

it('translates counted events in both languages without rewriting comments', async () => {
  const runtime = new I18nRuntime({ defaultLocale: 'zh-CN' });
  runtime.registerApplicationNamespace('test', {
    'zh-CN': async () => ({ default: zhCN }),
    'en-US': async () => ({ default: enUS }),
  });
  await runtime.init('zh-CN');
  const event = {
    id: 'event',
    actorId: 'user',
    createdAt: '2026-09-17',
    payload: null,
  };
  const describe = (
    type: string,
    summary: string,
    payload: Record<string, unknown> | null = null,
  ) =>
    describeEvent(
      { ...event, type, summary, payload },
      runtime.getFixedT('test'),
      'deviceStatus',
    );
  // The type label already says 席位增加: the summary is the count alone.
  expect(describe('seatsAdded', 'Seats added: 1', { quantity: 1 })).toBe('1');
  expect(
    describe('issue', 'Issued 1', { quantity: 1, targetLabel: '刘洋' }),
  ).toBe('1 给 刘洋');
  expect(
    describe('devicesChanged', '2 device(s) listed', {
      deviceIds: ['a', 'b'],
    }),
  ).toBe('清单共 2 台设备');
  expect(
    describe('counted', '3 item(s) counted (5/9)', {
      count: 3,
      counted: 5,
      expected: 9,
    }),
  ).toBe('3 条（已盘 5 / 应盘 9）');
  // An older receipt without the item's name keeps its stored sentence.
  expect(describe('received', 'Received 2 × Dock', { quantity: 2 })).toBe(
    'Received 2 × Dock',
  );
  expect(describe('created', 'Created with 4 seat(s)', { seatCount: 4 })).toBe(
    '总席位 4',
  );
  expect(
    describe('created', 'Created with unlimited seats', { seatCount: null }),
  ).toBe('席位不限');
  expect(describe('note', 'User typed this')).toBe('User typed this');
  await runtime.changeLanguage('en-US');
  expect(describe('seatsAdded', 'Seats added: 2', { quantity: 2 })).toBe('2');
  expect(
    describe('devicesChanged', '1 device(s) listed', { deviceIds: ['a'] }),
  ).toBe('1 device listed');
});

it("says what a department's onboarding kit gained, lost and changed", async () => {
  const runtime = new I18nRuntime({ defaultLocale: 'zh-CN' });
  runtime.registerApplicationNamespace('test', {
    'zh-CN': async () => ({ default: zhCN }),
    'en-US': async () => ({ default: enUS }),
  });
  await runtime.init('zh-CN');
  const describe = (payload: Record<string, unknown>) =>
    describeEvent(
      {
        id: 'event',
        actorId: 'user',
        createdAt: '2026-10-22',
        type: 'onboardingKitChanged',
        summary: 'Onboarding kit changed',
        payload,
      },
      runtime.getFixedT('test'),
      'deviceStatus',
    );
  expect(
    describe({
      position: null,
      added: [{ label: 'MX Keys', quantity: 1 }],
      removed: [{ label: 'WD22TB4', quantity: 1 }],
      changed: [{ label: 'U2723QE', from: 1, to: 2 }],
    }),
  ).toBe(
    '部门默认配置：新增 MX Keys ×1；删除 WD22TB4 ×1；修改 U2723QE ×1 → ×2',
  );
  expect(
    describe({
      position: '前端工程师',
      deleted: true,
      added: [],
      removed: [{ label: 'WD22TB4', quantity: 1 }],
      changed: [],
    }),
  ).toBe('删除 前端工程师 的配置');
});
