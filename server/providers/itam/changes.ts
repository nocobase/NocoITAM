import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * The realtime topic that says "the register changed, read again".
 *
 * The workbench's 我的待办 and the inbox's 待我处理 are live queries — a
 * leaver, an overdue loan, an approval waiting on the reader are computed
 * when the page asks — so a page left open used to show what was true when
 * it was opened (2026-10-05). The topic carries no data: what a to-do card
 * holds depends on who reads it, so each open page asks again with its own
 * permissions. It is public for that reason; the signal says only that
 * something was written.
 */
export const ITAM_CHANGES_TOPIC = 'itam:changes';

export interface ItamChangesEvent {
  readonly kind: 'changed';
}

/**
 * Coalesces writes into one signal. Every successful write through the ITAM
 * routes, every confirmed AI write and every scheduled job calls `touched()`;
 * a burst — an import, a demo, a batch return — goes out once, shortly after
 * it stops, and a long one still goes out at least every `maxWait`.
 */
export interface ItamChanges {
  /**
   * Something was written. `actorId` is who wrote it, where that is known;
   * the burst carries the last one named, for what is recorded because of
   * it (a leaver's handover completing).
   */
  touched(actorId?: string): void;
}

/** One coalesced burst of writes, as handed to the publisher. */
export interface ItamChangesBurst {
  readonly actorId?: string;
}

export const itamChangesToken: ServiceToken<ItamChanges> =
  createServiceToken<ItamChanges>('itam/changes');

export function createItamChanges(
  publish: (burst: ItamChangesBurst) => void | Promise<void>,
  { wait = 400, maxWait = 3000 }: { wait?: number; maxWait?: number } = {},
): ItamChanges {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt: number | undefined;
  let actorId: string | undefined;
  const flush = () => {
    const burst = actorId ? { actorId } : {};
    timer = undefined;
    firstAt = undefined;
    actorId = undefined;
    // A missed signal costs a page a refresh, never the write itself.
    const failed = (error: unknown) => {
      console.error('Failed to publish the ITAM change signal.', error);
    };
    try {
      void Promise.resolve(publish(burst)).catch(failed);
    } catch (error) {
      failed(error);
    }
  };
  return {
    touched(actor) {
      if (actor) actorId = actor;
      const now = Date.now();
      firstAt ??= now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        flush,
        Math.max(0, Math.min(wait, firstAt + maxWait - now)),
      );
      // A pending signal never keeps the process alive on shutdown.
      timer.unref?.();
    },
  };
}
