import type { DatabaseManager } from '@nocobase/db';

/**
 * The global search's AI answers (2026-10-16, ported from NocoCRM's
 * `crm-agents/search-answers.ts`): a question asked from the search is a
 * conversation of its own, source `SEARCH_SOURCE`, answered in the dialog
 * and listed nowhere (the conversation lists leave the source out). It stays
 * only when the person goes on asking in it, which makes it an ordinary
 * conversation of the source `itam`; otherwise it is deleted when they leave
 * the answer, and one left behind (a window closed on it) by the daily job.
 * The Agents plugin has no way to delete a conversation or to change its
 * source, so its rows are written here. @temporary(nocobase-official): until
 * the plugin can delete a conversation, or answer once without one.
 */
export const SEARCH_SOURCE = 'itam-search';
/** What a kept one becomes: ITAM's own conversations. */
const KEPT_SOURCE = 'itam';
/** One left behind is swept once it is this old. */
const STALE_MS = 60 * 60 * 1000;

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

async function deleteConversations(
  database: DatabaseManager,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return;
  const query = database.query();
  await query
    .deleteFrom('agConversationMessages')
    .where('conversationId', 'in', [...ids])
    .execute();
  await query
    .deleteFrom('agConversations')
    .where('id', 'in', [...ids])
    .execute();
}

/**
 * The person goes on asking: the conversation stays theirs, as one of ITAM's,
 * titled by the question they typed rather than the prompt it was sent in.
 */
export async function keepSearchAnswer(
  database: DatabaseManager,
  userId: string,
  conversationId: string,
  title?: string,
): Promise<boolean> {
  const query = database.query();
  const conversation = await query
    .selectFrom('agConversations')
    .select('source')
    .where('id', '=', conversationId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  if (!conversation) return false;
  if (text(conversation.source) === SEARCH_SOURCE)
    await query
      .updateTable('agConversations')
      .set({ source: KEPT_SOURCE, ...(title ? { title } : {}) })
      .where('id', '=', conversationId)
      .execute();
  return true;
}

/** The person leaves the answer: the conversation goes, if it is still an answer. */
export async function discardSearchAnswer(
  database: DatabaseManager,
  userId: string,
  conversationId: string,
): Promise<void> {
  const conversation = await database
    .query()
    .selectFrom('agConversations')
    .select('id')
    .where('id', '=', conversationId)
    .where('userId', '=', userId)
    .where('source', '=', SEARCH_SOURCE)
    .executeTakeFirst();
  if (conversation) await deleteConversations(database, [conversationId]);
}

/** The daily sweep: every answer nobody kept, left an hour or more. */
export async function sweepSearchAnswers(
  database: DatabaseManager,
  now = new Date(),
): Promise<{ readonly deleted: number }> {
  const left = await database
    .query()
    .selectFrom('agConversations')
    .select(['id', 'createdAt'])
    .where('source', '=', SEARCH_SOURCE)
    .execute();
  const stale = left
    .filter((conversation) => {
      const at = Date.parse(text(conversation.createdAt));
      return !Number.isNaN(at) && now.getTime() - at >= STALE_MS;
    })
    .map((conversation) => text(conversation.id));
  await deleteConversations(database, stale);
  return { deleted: stale.length };
}
