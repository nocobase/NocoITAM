import type { NotificationTemplateView } from '@nocobase/app-plugin-notification/client';
import { useCallback, useMemo } from 'react';

import { useAdminText } from './common/hooks.js';

// The registered notification templates in the reader's language (2026-11-10,
// as NocoCRM has it). The Notification plugin carries a template's name,
// trigger, recipients, conditions, language rule, category and variables as
// one English string each (NotificationTemplateView); ITAM's own templates
// (server/providers/itam/notification-templates.ts) and the Users plugin's
// invitation are worded again in every language under
// `admin.notificationTemplates`, by template id, so a change to one of ITAM's
// templates is made there and here together. A template ITAM does not know
// keeps the registered English.

type ItemKey =
  | 'loanOverdue'
  | 'leaverRecovery'
  | 'commentMentioned'
  | 'commentReplied'
  | 'usersInvitation';

interface Known {
  readonly key: ItemKey;
  /** ITAM's own: written in the application's default language, under the notifier's rules. */
  readonly itam?: boolean;
  // Whether one message carries every language it lists, so that the preview
  // reads the same whichever language is asked for (the invitation).
  readonly allLanguages?: boolean;
}

const KNOWN: Readonly<Record<string, Known>> = {
  'itam.loan-overdue': { key: 'loanOverdue', itam: true },
  'itam.leaver-recovery': { key: 'leaverRecovery', itam: true },
  'itam.comment-mentioned': { key: 'commentMentioned', itam: true },
  'itam.comment-replied': { key: 'commentReplied', itam: true },
  'users.invitation': { key: 'usersInvitation', allLanguages: true },
};

// The variables each known template words again; anything else shows as
// registered.
const VARIABLES: Readonly<Record<ItemKey, ReadonlySet<string>>> = {
  loanOverdue: new Set(['deviceNo', 'date']),
  leaverRecovery: new Set(['name', 'count']),
  commentMentioned: new Set(['actor', 'title', 'text']),
  commentReplied: new Set(['actor', 'title', 'text']),
  usersInvitation: new Set(['app', 'inviter', 'items', 'date', 'url']),
};

// The registered categories, channel types and contributors ITAM words
// again; anything else shows as registered.
const CATEGORIES: Readonly<Record<string, string>> = {
  Accounts: 'accounts',
  Devices: 'devices',
  People: 'people',
  Comments: 'comments',
};
const CHANNEL_TYPES = new Set(['in-app', 'email']);
const CONTRIBUTORS: Readonly<Record<string, string>> = {
  NocoITAM: 'itam',
  '@nocobase/app-plugin-users': 'users',
};

// The directory's queries: the list, a template, a template's preview.
export const NOTIFICATION_TEMPLATES_KEY = ['itam', 'notificationTemplates'];

export interface TemplateText {
  readonly name: (view: NotificationTemplateView) => string;
  readonly trigger: (view: NotificationTemplateView) => string;
  readonly recipients: (view: NotificationTemplateView) => string;
  /** The conditions, one sentence each. */
  readonly conditions: (view: NotificationTemplateView) => readonly string[];
  readonly language: (view: NotificationTemplateView) => string;
  /** Whether one message carries every language: no preview language to pick. */
  readonly allLanguages: (view: NotificationTemplateView) => boolean;
  readonly category: (category: string) => string;
  readonly channelType: (type: string) => string;
  readonly contributor: (contributor: string) => string;
  readonly variable: (
    view: NotificationTemplateView,
    name: string,
    registered: string,
  ) => string;
}

export function useTemplateText(): TemplateText {
  const { text } = useAdminText();
  const word = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      text(`notificationTemplates.${key}`, options),
    [text],
  );
  return useMemo(() => {
    const item = (view: NotificationTemplateView) => KNOWN[view.id];
    return {
      name: (view) => {
        const known = item(view);
        return known ? word(`items.${known.key}.name`) : view.name;
      },
      trigger: (view) => {
        const known = item(view);
        return known ? word(`items.${known.key}.trigger`) : view.trigger;
      },
      recipients: (view) => {
        const known = item(view);
        return known ? word(`items.${known.key}.recipients`) : view.recipients;
      },
      // A known template's rule of its own, then, for ITAM's, what every one
      // of them keeps to. ITAM has no switch to turn a notification off.
      conditions: (view) => {
        const known = item(view);
        if (!known) return [view.businessRule];
        const own = word(`items.${known.key}.rule`);
        return known.itam ? [own, word('always')] : [own];
      },
      language: (view) => {
        const known = item(view);
        if (!known) return view.languagePolicy;
        return known.itam
          ? word('itamLanguage')
          : word(`items.${known.key}.language`);
      },
      allLanguages: (view) => item(view)?.allLanguages === true,
      category: (category) => {
        const key = CATEGORIES[category];
        return key ? word(`categories.${key}`) : category;
      },
      channelType: (type) =>
        CHANNEL_TYPES.has(type) ? word(`channelTypes.${type}`) : type,
      contributor: (contributor) => {
        const key = CONTRIBUTORS[contributor];
        return key ? word(`contributors.${key}`) : contributor;
      },
      variable: (view, name, registered) => {
        const known = item(view);
        return known && VARIABLES[known.key].has(name)
          ? word(`items.${known.key}.variables.${name}`)
          : registered;
      },
    };
  }, [word]);
}
