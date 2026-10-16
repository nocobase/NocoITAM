// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sweepSearchAnswers } from '../../server/providers/itam-agents/search-answers.js';
import { aiRoutes } from '../../server/routes/itam/ai.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

interface TableBuilder {
  string(name: string): { primary(): unknown };
  text(name: string): unknown;
}

// The global search's AI answers: a question asked from the search is a
// conversation listed nowhere, kept (as one of ITAM's, titled by the
// question) when the reader goes on asking, deleted when they leave it, and
// swept by the daily job when left behind. Each person acts on their own only.
describe('search answers', () => {
  let app: TestApp;

  const conversation = async (id: string) =>
    app.db.database
      .query()
      .selectFrom('agConversations')
      .select(['id', 'source', 'title'])
      .where('id', '=', id)
      .executeTakeFirst();
  const messages = async (id: string) =>
    (
      await app.db.database
        .query()
        .selectFrom('agConversationMessages')
        .select('id')
        .where('conversationId', '=', id)
        .execute()
    ).length;

  beforeEach(async () => {
    app = await createTestApp();
    await app.mount(aiRoutes);
    // The Agents plugin's tables, as far as the answers touch them, under
    // the names the query layer maps to; the test database has only ITAM's own.
    const client = await app.db.database.connection().client<{
      schema: {
        createTable(
          name: string,
          build: (table: TableBuilder) => void,
        ): Promise<unknown>;
      };
    }>();
    await client.schema.createTable('ag_conversations', (table) => {
      table.string('id').primary();
      table.string('user_id');
      table.string('source');
      table.string('title');
      table.string('created_at');
    });
    await client.schema.createTable('ag_conversation_messages', (table) => {
      table.string('id').primary();
      table.string('conversation_id');
      table.text('content');
    });
    const old = '2026-10-16T08:00:00.000Z';
    const fresh = '2026-10-16T09:30:00.000Z';
    await app.db.database
      .query()
      .insertInto('agConversations')
      .values([
        {
          id: 'a1',
          userId: 'mia',
          source: 'itam-search',
          title: 'Prompt',
          createdAt: fresh,
        },
        {
          id: 'a2',
          userId: 'mia',
          source: 'itam-search',
          title: 'Prompt',
          createdAt: old,
        },
        {
          id: 'c1',
          userId: 'mia',
          source: 'panel',
          title: 'Chat',
          createdAt: old,
        },
      ])
      .execute();
    await app.db.database
      .query()
      .insertInto('agConversationMessages')
      .values([
        { id: 'm1', conversationId: 'a1', content: 'q' },
        { id: 'm2', conversationId: 'a2', content: 'q' },
        { id: 'm3', conversationId: 'c1', content: 'q' },
      ])
      .execute();
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('keeps an answer as one of ITAM’s conversations, titled by the question', async () => {
    const response = await app.request('/api/itam/ai/search-answers/a1/keep', {
      ...json({ title: 'Which warranties end soon' }),
      user: 'mia',
    });
    expect(response.status).toBe(200);
    expect(await conversation('a1')).toEqual({
      id: 'a1',
      source: 'itam',
      title: 'Which warranties end soon',
    });
  });

  it('keeps nobody else’s conversation', async () => {
    const response = await app.request('/api/itam/ai/search-answers/a1/keep', {
      ...json({}),
      user: 'sam',
    });
    expect(response.status).toBe(404);
    expect((await conversation('a1'))?.source).toBe('itam-search');
  });

  it('discards an answer with its messages, and only an answer of the reader’s', async () => {
    const remove = (id: string, user: string) =>
      app.request(`/api/itam/ai/search-answers/${id}`, {
        method: 'DELETE',
        user,
      });
    expect((await remove('a1', 'sam')).status).toBe(200);
    expect(await conversation('a1')).toBeDefined();
    // An ordinary conversation is not an answer to discard.
    await remove('c1', 'mia');
    expect(await conversation('c1')).toBeDefined();
    await remove('a1', 'mia');
    expect(await conversation('a1')).toBeUndefined();
    expect(await messages('a1')).toBe(0);
    expect(await messages('c1')).toBe(1);
  });

  it('refuses a request without a session', async () => {
    const response = await app.request('/api/itam/ai/search-answers/a1', {
      method: 'DELETE',
      user: '',
    });
    expect(response.status).toBe(401);
  });

  it('sweeps the answers left an hour or more', async () => {
    const result = await sweepSearchAnswers(
      app.db.database,
      new Date('2026-10-16T10:00:00.000Z'),
    );
    expect(result.deleted).toBe(1);
    expect(await conversation('a2')).toBeUndefined();
    expect(await messages('a2')).toBe(0);
    expect(await conversation('a1')).toBeDefined();
    expect(await conversation('c1')).toBeDefined();
  });
});
