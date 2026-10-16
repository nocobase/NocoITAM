import { useTranslation } from '@nocobase/i18n/client';
import { Bell, MessageSquareText } from 'lucide-react';

import { NoticeRecord } from './inbox-notice-record.js';
import { noticeData, noticeRecord } from '@/lib/itam/inbox-notices';
import type { InboxNotice } from '#extensions/nocobase-inbox/model';
import { defineInboxRenderer } from '#extensions/nocobase-inbox/registry';
import type { InboxSource } from '#extensions/nocobase-inbox/source';

/**
 * The inbox's knowledge of the notifications ITAM sends (2026-10-16, after
 * NocoCRM's `inbox-notices.ts`): the source asks the server which record
 * each in-app item opens (`/api/itam/notices`), and the renderer names the
 * record's kind on the card and, picked, shows the record itself beside
 * the list — its own detail page, at the comment the notification is about
 * (`inbox-notice-record.tsx`). On a phone the inbox opens the record's page
 * instead (`client/pages/itam/inbox.tsx`). An item ITAM did not send keeps
 * the inbox's plain rendering.
 */

export const itamInboxSource: InboxSource = {
  id: 'itam',
  notices: async (notificationIds, { api, signal }) => {
    if (!notificationIds.length) return [];
    const response = await api.request<{ data?: unknown }>({
      path: `itam/notices?ids=${encodeURIComponent(notificationIds.join(','))}`,
      signal,
    });
    return Array.isArray(response?.data)
      ? (response.data as InboxNotice[])
      : [];
  },
};

export const itamNoticeRenderer = defineInboxRenderer<unknown>({
  source: 'itam',
  icon: (entry) => (noticeData(entry).focus ? MessageSquareText : Bell),
  useWording() {
    const { t } = useTranslation();
    return {
      // The record's kind, as the pages name it.
      label: (entry) => {
        const path = noticeData(entry).path;
        const target = path ? noticeRecord(path) : undefined;
        return target
          ? t(`${target.i18n}.object`)
          : t('inbox.tabs.info', { defaultValue: 'Notifications' });
      },
      text: ({ item }) => ({
        title: item.title ?? '',
        sentence: item.body && item.body !== item.title ? item.body : null,
      }),
    };
  },
  Placeholder: NoticeRecord,
});
