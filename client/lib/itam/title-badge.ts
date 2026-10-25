import { useEffect } from 'react';

/**
 * The inbox's number at the front of the browser tab's title, "(3) NocoITAM"
 * (2026-10-25, as NocoCRM's `inbox-badge.ts`): what the sidebar's 收件箱
 * counts (`useNavigationCounts`), so a reader on another tab sees something
 * is waiting.
 */

const TITLE_COUNT = /^\(\d+\+?\) /;

/** The badge's text for `count`: "99+" above 99, none at zero. */
export function titleBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * `title` with `text` in front as `(3) `, or with none when `text` is null;
 * an earlier count is replaced, so applying it again never stacks.
 */
export function titleWithBadge(title: string, text: string | null): string {
  const base = title.replace(TITLE_COUNT, '');
  return text ? `(${text}) ${base}` : base;
}

/** Puts `text` in front of the tab's title while mounted, and takes it off. */
export function useDocumentTitleBadge(text: string | null): void {
  useEffect(() => {
    document.title = titleWithBadge(document.title, text);
    return () => {
      document.title = titleWithBadge(document.title, null);
    };
  }, [text]);
}
