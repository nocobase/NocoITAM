import type { TranslatableText } from './notifier.js';

/**
 * What ITAM puts in somebody's inbox, one builder per scenario (template
 * 1.0.0-beta.92, 2026-11-10). The sending services and the notification
 * templates directory (`notification-templates.ts`) build the same title and
 * body from these, so a preview shows exactly what is sent.
 */
export interface ItamMessage {
  readonly title: TranslatableText;
  readonly body: TranslatableText;
}

export const itamMessages = {
  /** A device on loan past its expected return date, to its owner. */
  loanOverdue: (input: {
    readonly deviceNo: string;
    readonly date: string;
  }): ItamMessage => ({
    title: {
      key: 'notifications.loanOverdue',
      params: { deviceNo: input.deviceNo },
    },
    body: {
      key: 'notifications.loanOverdueBody',
      params: { date: input.date },
    },
  }),

  /** A leaver's holdings to recover, to each owner of some of them. */
  leaverRecovery: (input: {
    readonly name: string;
    readonly count: number;
  }): ItamMessage => ({
    title: {
      key: 'notifications.leaverRecovery',
      params: { name: input.name },
    },
    body: {
      key: 'notifications.leaverRecoveryBody',
      params: { count: input.count },
    },
  }),

  /** A comment that names somebody, to the people it names. */
  commentMentioned: (input: {
    readonly actor: string;
    readonly title: string;
    readonly text: string;
  }): ItamMessage => ({
    title: {
      key: 'notifications.commentMentioned',
      params: { actor: input.actor, title: input.title },
    },
    // The commenter's own words, as written.
    body: { text: input.text },
  }),

  /** A comment in a thread, to the others in it it does not name. */
  commentReplied: (input: {
    readonly actor: string;
    readonly title: string;
    readonly text: string;
  }): ItamMessage => ({
    title: {
      key: 'notifications.commentReplied',
      params: { actor: input.actor, title: input.title },
    },
    body: { text: input.text },
  }),
} as const;
