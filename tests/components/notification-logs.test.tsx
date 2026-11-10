import { renderWithApp } from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import metadata from '../../package.json' with { type: 'json' };
import {
  NotificationLogsView,
  type NotificationLogDetails,
} from '../../client/extensions/nocobase-notification-logs-ui/index.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

// 系统设置 → 通知管理: 通知日志 (2026-11-10, as NocoCRM has it), the UI
// Library's notification-logs-ui block as ITAM shows it (no heading of its
// own, ITAM's tag tokens). Its route and grant are in
// settings-navigation.test.ts.

const namespaces = {
  [metadata.name]: {
    'en-US': async () => ({ default: enUS }),
    'zh-CN': async () => ({ default: zhCN }),
  },
};

const log = (
  id: string,
  status: NotificationLogDetails['log']['status'],
): NotificationLogDetails => ({
  log: {
    id,
    sourceType: 'device',
    sourceReferenceId: `device:${id}`,
    status,
    createdAt: '2026-11-04T09:30:00.000Z',
    updatedAt: '2026-11-04T09:30:00.000Z',
  },
  deliveries: [
    {
      delivery: {
        id: `${id}-inbox`,
        channelName: 'inbox',
        channelType: 'in-app',
        providerType: 'in-app',
        attemptCount: 1,
        status: status === 'failed' ? 'failed' : 'accepted',
        createdAt: '2026-11-04T09:30:00.000Z',
        updatedAt: '2026-11-04T09:30:00.000Z',
      },
      attempts: [
        {
          id: `${id}-attempt`,
          sequence: 1,
          providerType: 'in-app',
          status: status === 'failed' ? 'failed' : 'accepted',
          startedAt: '2026-11-04T09:30:00.000Z',
          ...(status === 'failed'
            ? {
                error: {
                  message: 'In-app notification recipient does not exist.',
                  code: 'IN_APP_NOTIFICATION_RECIPIENT_NOT_FOUND',
                },
              }
            : {}),
        },
      ],
    },
  ],
});

it('lists the deliveries under the module heading, with no heading of its own', async () => {
  const loadLogs = vi.fn(async () => [
    log('sent', 'completed'),
    log('lost', 'failed'),
  ]);
  renderWithApp(<NotificationLogsView loadLogs={loadLogs} />, {
    locale: 'zh-CN',
    namespace: metadata.name,
    namespaces,
  });
  expect(await screen.findByText('lost')).toBeTruthy();
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  expect(screen.queryByText('通知日志')).toBeNull();
  // Two deliveries shown, one needing attention.
  expect(
    screen.getByText('当前投递数').previousElementSibling?.textContent,
  ).toBe('2');
  expect(screen.getByText('需要关注').previousElementSibling?.textContent).toBe(
    '1',
  );
  // Status in ITAM's tag tokens rather than fixed colours.
  expect(screen.getByText('已完成').className).toContain(
    'text-success-foreground',
  );
  expect(screen.getByText('失败').className).toContain('text-destructive');
  // A row opens its deliveries and the provider's attempts, the error in the
  // reader's language.
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: '展开通知' })[1]!);
  expect(await screen.findByText('站内信接收用户不存在。')).toBeTruthy();
});

it('offers Retry when the logs cannot be read, and reads them again', async () => {
  const loadLogs = vi
    .fn<() => Promise<readonly NotificationLogDetails[]>>()
    .mockRejectedValueOnce(new Error('Forbidden'))
    .mockResolvedValueOnce([log('sent', 'completed')]);
  renderWithApp(<NotificationLogsView loadLogs={loadLogs} />, {
    locale: 'zh-CN',
    namespace: metadata.name,
    namespaces,
  });
  expect(await screen.findByText('通知日志不可用')).toBeTruthy();
  await userEvent.setup().click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('sent')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  expect(loadLogs).toHaveBeenCalledTimes(2);
});
