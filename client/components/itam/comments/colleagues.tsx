import type { ReactNode } from 'react';

import { useItamList } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';

/** Somebody a comment may mention: an IT account. */
export interface Colleague {
  readonly id: string;
  readonly name: string;
}

/**
 * The accounts a comment may @-mention: the ones `/itam/users` offers (IT,
 * holding a permission set of this application, not left), other than the
 * writer. `all` keeps the writer, to name the authors of what is shown.
 */
export function useColleagues(): {
  readonly mentionable: readonly Colleague[];
  readonly all: readonly Colleague[];
  readonly me: string | undefined;
} {
  const me = useCurrentUserId();
  const list = useItamList('itam/users', { pageSize: 100 });
  const all = (list.data?.data ?? []).map((user) => ({
    id: text(user.id),
    name: text(user.name) || text(user.username),
  }));
  return { mentionable: all.filter((user) => user.id !== me), all, me };
}

/** The mentioned colleagues whose "@Name" the text still holds. */
export function mentionsIn(
  body: string,
  mentions: readonly string[],
  users: readonly Colleague[],
): string[] {
  return mentions.filter((id) => {
    const name = users.find((user) => user.id === id)?.name;
    return name ? body.includes(`@${name}`) : false;
  });
}

/** How a mentioned colleague reads in a comment. */
export const MENTION_CLASS = 'font-medium text-primary';

/** A comment's text with the colleagues it mentions picked out. */
export function withMentions(
  body: string,
  mentions: unknown,
  users: readonly Colleague[],
): ReactNode[] {
  const names = (Array.isArray(mentions) ? mentions : [])
    .map((id) => users.find((user) => user.id === text(id))?.name)
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => b.length - a.length);
  if (!names.length) return [body];
  const pattern = new RegExp(
    `(${names.map((name) => `@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|')})`,
  );
  // Keyed by where each piece starts in the text.
  let offset = 0;
  return body.split(pattern).map((part, index) => {
    const start = offset;
    offset += part.length;
    return index % 2 ? (
      <span key={`m${String(start)}`} className={MENTION_CLASS}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

/** A name's initials: the first letter of each of its first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  // A Chinese name is one word: its first character.
  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}
