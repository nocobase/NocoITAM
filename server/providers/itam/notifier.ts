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
/**
 * A message named rather than written. Nothing this application puts in
 * somebody's inbox is English prose, so a notification carries the key of a
 * string in `server/locales` and the values it interpolates; the notifier
 * resolves it in the deployment's language.
 */
export type TranslatableText =
  | {
      readonly key: string;
      readonly params?: Readonly<Record<string, unknown>>;
    }
  /**
   * Somebody's own words — an approver's comment — which pass through as
   * they were written. The rule is that the *application* does not write
   * prose into an inbox, not that a person's sentence is rewritten.
   */
  | { readonly text: string };

export interface NotificationInput {
  /** Business key; the plugin deduplicates repeated sends of the same key. */
  readonly key: string;
  readonly to: readonly (string | null | undefined)[];
  readonly title: TranslatableText;
  readonly body: TranslatableText;
  /** Application-internal path the notification opens. */
  readonly url?: string;
  /** The user whose action caused the notification; excluded from `to`. */
  readonly actorId?: string;
  readonly source?: { readonly type: string; readonly referenceId?: string };
}

export interface ItamNotifier {
  notify(input: NotificationInput): Promise<void>;
  /**
   * The same delivery, failing when a recipient's does: for a lifecycle
   * effect (2026-10-18), which retries what failed and keeps the failure
   * visible rather than only logging it. The plugin deduplicates by key, so
   * a retry does not reach anyone twice.
   */
  deliver(input: NotificationInput): Promise<void>;
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
  /**
   * Resolves a named message. A container without i18n — a test's — falls
   * back to the key, which keeps the delivery and its assertions working
   * without pretending to translate.
   */
  translate: (text: TranslatableText) => string = (text) =>
    'text' in text ? text.text : text.key,
): ItamNotifier {
  const deliver = async (
    input: NotificationInput,
    failed: (id: string, error: unknown) => void,
  ): Promise<void> => {
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
              title: translate(input.title),
              body: translate(input.body),
              ...(input.url
                ? { target: { type: 'route' as const, path: input.url } }
                : {}),
            },
          },
        });
      } catch (error) {
        failed(id, error);
      }
    }
  };
  return {
    notify: (input) =>
      deliver(input, (id, error) =>
        log(`Notification ${input.key} to ${id} failed`, error),
      ),
    async deliver(input) {
      const failures: unknown[] = [];
      await deliver(input, (_id, error) => failures.push(error));
      if (failures.length > 0)
        throw new AggregateError(
          failures,
          `Notification ${input.key} failed for ${String(failures.length)} recipient(s)`,
        );
    },
  };
}
