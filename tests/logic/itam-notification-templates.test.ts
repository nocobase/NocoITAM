import { NotificationTemplateRegistry } from '@nocobase/app-plugin-notification/server';
import { expect, it } from 'vitest';

import { itamMessages } from '../../server/providers/itam/notification-messages.js';
import { itamNotificationTemplates } from '../../server/providers/itam/notification-templates.js';
import type { TranslatableText } from '../../server/providers/itam/notifier.js';
import enUS from '../../server/locales/en-US.js';

// ITAM's notifications in the template's notification templates directory
// (template 1.0.0-beta.92, 2026-11-10).

const strings = enUS.notifications as Record<string, string>;
/** The server's English, interpolated as i18next would. */
const translate = (_locale: string, text: TranslatableText): string =>
  'text' in text
    ? text.text
    : strings[text.key.replace('notifications.', '')]!.replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(text.params?.[name] ?? ''),
      );

const registry = (): NotificationTemplateRegistry => {
  const result = new NotificationTemplateRegistry();
  for (const definition of itamNotificationTemplates({
    locales: ['en-US', 'zh-CN'],
    translate,
    channels: () => [
      { name: 'in-app', type: 'in-app', configured: true, enabled: null },
    ],
  }))
    result.register(definition);
  return result;
};

it('lists each scenario ITAM sends, and only those', () => {
  expect(
    registry()
      .list()
      .map((view) => view.id),
  ).toEqual([
    'itam.loan-overdue',
    'itam.leaver-recovery',
    'itam.comment-mentioned',
    'itam.comment-replied',
  ]);
  for (const view of registry().list()) {
    expect(view.trigger).not.toBe('');
    expect(view.recipients).not.toBe('');
    expect(view.locales[0]).toBe('en-US');
    expect(view.channels).toEqual([
      { name: 'in-app', type: 'in-app', configured: true, enabled: null },
    ]);
  }
});

it('previews with the sending builder on synthetic values', async () => {
  const preview = await registry().preview('itam.loan-overdue', 'en-US');
  expect(preview?.synthetic).toBe(true);
  const sent = itamMessages.loanOverdue({
    deviceNo: 'DE-000123',
    date: '2026-01-15',
  });
  expect(preview?.content).toEqual({
    title: translate('en-US', sent.title),
    body: translate('en-US', sent.body),
  });
  expect(preview?.definition.title).toContain('{{deviceNo}}');
});

it('passes a comment through as its author wrote it', async () => {
  const preview = await registry().preview('itam.comment-mentioned', 'en-US');
  expect(preview?.content.title).toBe('Sam Example mentioned you on DE-000123');
  expect(preview?.content.body).toBe(
    'Could you check the battery before it goes out again?',
  );
});
