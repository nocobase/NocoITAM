import type {
  NotificationTemplateDefinition,
  NotificationTemplateView,
} from '@nocobase/app-plugin-notification/server';

import { itamMessages, type ItamMessage } from './notification-messages.js';
import type { TranslatableText } from './notifier.js';

/**
 * ITAM's notifications in System settings → Notification management →
 * Notification templates (template 1.0.0-beta.92, 2026-11-10): each scenario
 * ITAM sends, with its trigger, recipients and a preview rendered by the same
 * builder the sending service calls (`notification-messages.ts`) on
 * synthetic values. Nothing here reads a record, resolves a user or sends.
 *
 * Every registered word here is in English, as the plugin carries it; the
 * client words each template again by id in every language
 * (client/pages/settings/notification-template-text.ts), so a change here is
 * made there too.
 *
 * The approval and stocktake strings under `notifications` in the server
 * locales have no sender, so they are not listed.
 */
export interface ItamTemplateContext {
  /** Resolves a message in a language, as the notifier does in the deployment's. */
  readonly translate: (
    locale: string,
    text: TranslatableText,
  ) => string | Promise<string>;
  /** The languages the server's messages are written in, the deployment's first. */
  readonly locales: readonly string[];
  /** The in-app channel ITAM sends through, described without probing it. */
  readonly channels: () => NotificationTemplateView['channels'];
}

interface Scenario<Input> {
  readonly id: string;
  /** The directory's group (2026-11-10): what the notification is about. */
  readonly category: 'Devices' | 'People' | 'Comments';
  readonly name: string;
  readonly trigger: string;
  readonly recipients: string;
  readonly businessRule: string;
  readonly variables: readonly { name: string; description: string }[];
  readonly build: (input: Input) => ItamMessage;
  /** Placeholders, shown as the template's shape. */
  readonly definition: Input;
  /** Fixed synthetic values: no real person, device or link. */
  readonly sample: Input;
}

/** A scenario with its input type closed over: the message for either example. */
interface ListedScenario extends Omit<
  Scenario<unknown>,
  'build' | 'definition' | 'sample'
> {
  readonly message: (example: 'definition' | 'sample') => ItamMessage;
}

const scenario = <Input>({
  build,
  definition,
  sample,
  ...rest
}: Scenario<Input>): ListedScenario => ({
  ...rest,
  message: (example) => build(example === 'sample' ? sample : definition),
});

const SCENARIOS: readonly ListedScenario[] = [
  scenario({
    id: 'itam.loan-overdue',
    category: 'Devices',
    name: 'Loan overdue',
    trigger:
      'The daily overdue-loan check finds a device on loan past its expected return date.',
    recipients: 'The device’s owner (负责人).',
    businessRule:
      'Runs with the scheduled job; sent once per device and expected date.',
    variables: [
      { name: 'deviceNo', description: 'The device’s number.' },
      { name: 'date', description: 'The expected return date.' },
    ],
    build: itamMessages.loanOverdue,
    definition: { deviceNo: '{{deviceNo}}', date: '{{date}}' },
    sample: { deviceNo: 'DE-000123', date: '2026-01-15' },
  }),
  scenario({
    id: 'itam.leaver-recovery',
    category: 'People',
    name: 'Leaver recovery',
    trigger:
      'A person is marked as leaving while devices, stock or seats are still assigned to them.',
    recipients:
      'Each owner (负责人) of some of those holdings, about their own share; never the person who acted.',
    businessRule: 'Sent once per leaver and owner.',
    variables: [
      { name: 'name', description: 'The leaver’s name.' },
      {
        name: 'count',
        description:
          'How many of their holdings are the recipient’s to settle.',
      },
    ],
    build: itamMessages.leaverRecovery,
    definition: { name: '{{name}}', count: 0 },
    sample: { name: 'Alex Example', count: 3 },
  }),
  scenario({
    id: 'itam.comment-mentioned',
    category: 'Comments',
    name: 'Mentioned in a comment',
    trigger: 'A comment on a record names somebody with @.',
    recipients: 'The people the comment names, except its author.',
    businessRule: 'Sent once per comment.',
    variables: [
      { name: 'actor', description: 'The comment’s author.' },
      { name: 'title', description: 'The record commented on.' },
      {
        name: 'text',
        description: 'The comment, shortened; the author’s own words.',
      },
    ],
    build: itamMessages.commentMentioned,
    definition: { actor: '{{actor}}', title: '{{title}}', text: '{{text}}' },
    sample: {
      actor: 'Sam Example',
      title: 'DE-000123',
      text: 'Could you check the battery before it goes out again?',
    },
  }),
  scenario({
    id: 'itam.comment-replied',
    category: 'Comments',
    name: 'Reply in a comment thread',
    trigger: 'Somebody comments on a record others have commented on.',
    recipients:
      'Everyone earlier in the thread the comment does not name, except its author.',
    businessRule: 'Sent once per comment.',
    variables: [
      { name: 'actor', description: 'The comment’s author.' },
      { name: 'title', description: 'The record commented on.' },
      {
        name: 'text',
        description: 'The comment, shortened; the author’s own words.',
      },
    ],
    build: itamMessages.commentReplied,
    definition: { actor: '{{actor}}', title: '{{title}}', text: '{{text}}' },
    sample: {
      actor: 'Sam Example',
      title: 'DE-000123',
      text: 'Done, it holds a full charge now.',
    },
  }),
];

/** The directory entries; `register` each, keeping what it returns to release. */
export function itamNotificationTemplates(
  context: ItamTemplateContext,
): NotificationTemplateDefinition[] {
  return SCENARIOS.map((item) => ({
    id: item.id,
    contributor: 'NocoITAM',
    category: item.category,
    name: item.name,
    trigger: item.trigger,
    recipients: item.recipients,
    businessRule: item.businessRule,
    locales: context.locales,
    languagePolicy:
      'Written in the deployment’s default language, whatever the reader’s interface language; a comment’s text passes through as its author wrote it.',
    variables: item.variables,
    channels: context.channels,
    render: async (locale, example) => {
      const message = item.message(example);
      return {
        title: await context.translate(locale, message.title),
        body: await context.translate(locale, message.body),
      };
    },
  }));
}
