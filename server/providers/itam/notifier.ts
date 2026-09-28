import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * In-app notifications for the events the specification lists. The
 * notification plugin does the delivery; this wrapper applies the design
 * rules — never notify the actor about their own action, deduplicate
 * recipients, and never let a delivery failure fail the business operation.
 * Services call it after their transaction committed.
 */
export interface NotificationInput {
  /** Business key; the plugin deduplicates repeated sends of the same key. */
  readonly key: string;
  readonly to: readonly (string | null | undefined)[];
  readonly title: string;
  readonly body: string;
  /** Application-internal path the notification opens. */
  readonly url?: string;
  /** The user whose action caused the notification; excluded from `to`. */
  readonly actorId?: string;
  readonly source?: { readonly type: string; readonly referenceId?: string };
}

export interface ItamNotifier {
  notify(input: NotificationInput): Promise<void>;
}

export const itamNotifierToken: ServiceToken<ItamNotifier> =
  createServiceToken<ItamNotifier>('itam/notifier');

/**
 * The plugin's send input since beta.43: one message per channel, each in
 * that channel's own shape. In-app takes the recipient, the text and an
 * optional target the notification opens.
 */
export type NotificationSender = (input: {
  readonly idempotencyKey: string;
  readonly source?: { readonly type: string; readonly referenceId?: string };
  readonly messages: {
    readonly 'in-app': {
      readonly to: string;
      readonly title: string;
      readonly body: string;
      readonly target?: { readonly type: 'route'; readonly path: string };
    };
  };
}) => Promise<unknown>;

export function createItamNotifier(
  send: NotificationSender | undefined,
  log: (message: string, error: unknown) => void = () => {},
): ItamNotifier {
  return {
    async notify(input) {
      if (!send) return;
      const recipients = [
        ...new Set(
          input.to.filter(
            (id): id is string =>
              typeof id === 'string' && id.length > 0 && id !== input.actorId,
          ),
        ),
      ];
      for (const id of recipients) {
        try {
          await send({
            idempotencyKey: `itam:${input.key}:${id}:in-app`,
            source: input.source,
            messages: {
              'in-app': {
                to: id,
                title: input.title,
                body: input.body,
                ...(input.url
                  ? { target: { type: 'route' as const, path: input.url } }
                  : {}),
              },
            },
          });
        } catch (error) {
          log(`Notification ${input.key} to ${id} failed`, error);
        }
      }
    },
  };
}
