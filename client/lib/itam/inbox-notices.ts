import { recordOrTabTarget, type RecordTarget } from './record-view.js';
import type { InboxEntry } from '#extensions/nocobase-inbox/model';

/**
 * What an ITAM notification in the inbox opens (2026-10-16): the record its
 * notice names (`/api/itam/notices`), and the comment it is about.
 * The renderer is `client/components/itam/inbox-notices.ts`.
 */
export interface NoticeData {
  readonly path?: string;
  readonly focus?: string | null;
}

export const noticeData = (entry: InboxEntry): NoticeData =>
  (entry.notice?.data as NoticeData | null) ?? {};

/** The record a notification opens, as its notice names it. */
export function noticePath(entry: InboxEntry): string | undefined {
  if (entry.notice?.source !== 'itam') return undefined;
  const path = noticeData(entry).path;
  return path && noticeRecord(path) ? path : undefined;
}

/** The record behind a path that may name one of its tabs. */
export function noticeRecord(path: string): RecordTarget | undefined {
  return recordOrTabTarget(path);
}
