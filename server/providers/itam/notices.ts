import type { DatabaseManager } from '@nocobase/db';

/**
 * What ITAM knows about the in-app notifications a reader holds, for the
 * inbox (2026-10-16, after NocoCRM's `notices.ts`): each by its
 * notification's id, the record its route target opens and the comment it
 * is about (`?focus=`, which every comment notification carries). The
 * inbox then shows that record beside the list, at that comment. Read from
 * the in-app plugin's own items, and only the reader's: the record itself
 * is loaded by the pane under the reader's own grants, so nothing here says
 * more than the notification already did.
 */
export interface ItamNotice {
  readonly notificationId: string;
  readonly source: 'itam';
  readonly kind: 'info';
  readonly type: 'record';
  readonly subject: {
    readonly type: string;
    readonly id: string;
    readonly label: null;
  };
  readonly decisionKey: null;
  readonly data: { readonly path: string; readonly focus: string | null };
  readonly count: 1;
  readonly resolvedAt: null;
  readonly outcome: null;
}

/** How many ids one request may ask about: an inbox page's worth and more. */
export const NOTICE_LIMIT = 200;

/** `/route/id`, then at most a tab, then the query. */
const RECORD_PATH =
  /^\/([a-z][a-z-]*)\/([^/?#]+)(?:\/[a-z][a-z-]*)?\/?(?:\?(.*))?$/;

export async function noticesOf(
  database: DatabaseManager,
  userId: string,
  notificationIds: readonly string[],
): Promise<ItamNotice[]> {
  const ids = [...new Set(notificationIds.filter(Boolean))].slice(
    0,
    NOTICE_LIMIT,
  );
  if (!ids.length) return [];
  // Without the in-app plugin's table every item stays a plain notification.
  const items = await database
    .query()
    .selectFrom('notificationInAppItems')
    .select(['notificationId', 'target'])
    .where('userId', '=', userId)
    .where('notificationId', 'in', ids)
    .execute<{ notificationId: unknown; target: unknown }>()
    .catch(() => []);
  const notices: ItamNotice[] = [];
  for (const item of items) {
    const path = targetPath(item.target);
    const match = path ? RECORD_PATH.exec(path) : null;
    if (!path || !match) continue;
    const focus = new URLSearchParams(match[3] ?? '').get('focus');
    notices.push({
      notificationId: String(item.notificationId),
      source: 'itam',
      kind: 'info',
      type: 'record',
      subject: { type: match[1] ?? '', id: match[2] ?? '', label: null },
      decisionKey: null,
      data: { path, focus: focus || null },
      count: 1,
      resolvedAt: null,
      outcome: null,
    });
  }
  return notices;
}

/** The route an in-app item opens, as the plugin stored it. */
function targetPath(target: unknown): string | null {
  let value = target;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const { type, path } = value as { type?: unknown; path?: unknown };
  return type === 'route' && typeof path === 'string' ? path : null;
}
