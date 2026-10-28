import { I18nRuntime } from '@nocobase/i18n';
import { expect, it } from 'vitest';

import {
  describeEvent,
  eventTargetLink,
} from '../../client/lib/itam/history-event.js';
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
  // Received on an order, it names the order (2026-10-28).
  expect(
    describe('seatsAdded', 'Seats added: 1', {
      quantity: 1,
      purchaseOrderId: 'po1',
      targetLabel: 'PO-000085',
    }),
  ).toBe('1（采购单 PO-000085）');
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

// A stock movement says its note after what it did (2026-10-22).
it("adds a stock movement's note after it", async () => {
  const runtime = new I18nRuntime({ defaultLocale: 'zh-CN' });
  runtime.registerApplicationNamespace('test', {
    'zh-CN': async () => ({ default: zhCN }),
    'en-US': async () => ({ default: enUS }),
  });
  await runtime.init('zh-CN');
  const describe = (type: string, payload: Record<string, unknown>) =>
    describeEvent(
      {
        id: 'event',
        actorId: 'user',
        createdAt: '2026-10-22',
        type,
        summary: type,
        payload,
      },
      runtime.getFixedT('test'),
      'deviceStatus',
    );
  expect(describe('stockIn', { quantity: 110, notes: '年度备货' })).toBe(
    '110：年度备货',
  );
  expect(
    describe('issue', {
      quantity: 1,
      targetLabel: '王芳',
      notes: '出差借用',
    }),
  ).toBe('1 给 王芳：出差借用');
  expect(describe('issue', { quantity: 1, targetLabel: '王芳' })).toBe(
    '1 给 王芳',
  );
});

it('names the account on a reclaimed seat as on an assigned one', () => {
  const event = (type: string, targetLabel: string) => ({
    id: type,
    actorId: 'user',
    createdAt: '2026-10-28',
    type,
    summary: '',
    payload: {
      holderType: 'person',
      holderId: 'p1',
      account: 'liu.yang@northbridge.example',
      targetLabel,
    },
  });
  for (const row of [
    event('seatReclaim', '刘洋'),
    event('seatAssign', '刘洋 (liu.yang@northbridge.example)'),
  ])
    expect(eventTargetLink(row)).toEqual({
      to: '/people/p1',
      label: '刘洋 (liu.yang@northbridge.example)',
      slot: 'target',
    });
});
