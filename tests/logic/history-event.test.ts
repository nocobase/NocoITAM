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
  expect(describe('seatsAdded', 'Seats added: 1', { quantity: 1 })).toBe(
    '席位增加 1',
  );
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
    '创建，总席位 4',
  );
  expect(
    describe('created', 'Created with unlimited seats', { seatCount: null }),
  ).toBe('创建，席位不限');
  expect(describe('note', 'User typed this')).toBe('User typed this');
  await runtime.changeLanguage('en-US');
  expect(describe('seatsAdded', 'Seats added: 2', { quantity: 2 })).toBe(
    'Seats added: 2',
  );
  expect(
    describe('devicesChanged', '1 device(s) listed', { deviceIds: ['a'] }),
  ).toBe('1 device listed');
});
