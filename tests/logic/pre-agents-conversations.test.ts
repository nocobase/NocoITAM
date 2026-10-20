// @vitest-environment node
import deletePreAgents1 from '../../database/main/migrations/202610270003_delete_pre_agents_1_conversations.js';
import { afterEach, expect, it } from 'vitest';

import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

let db: TestDatabase | undefined;
afterEach(async () => {
  await db?.destroy();
  db = undefined;
});

// The conversations from before the Agents plugin 1.0 carry no backend
// binding and cannot be opened; the migration deletes them with their
// messages and attachments, and leaves every bound one.
it('deletes the conversations the Agents plugin 1.0 cannot open, and keeps the rest', async () => {
  db = await createTestDatabase();
  const connection = db.database.connection();
  const context = {
    connection,
    query: connection.query,
    builder: connection.builder,
  };
  // Without the plugin's tables there is nothing to do.
  await deletePreAgents1.up(context);

  await connection.builder.createCollection('agConversations', (c) => {
    c.string('id', { length: 64 }).primary().notNull();
    c.json('metadata').nullable();
  });
  await connection.builder.createCollection('agConversationMessages', (c) => {
    c.string('id', { length: 64 }).primary().notNull();
    c.string('conversationId', { length: 64 });
  });
  await connection.builder.createCollection('agChatAttachments', (c) => {
    c.string('id', { length: 64 }).primary().notNull();
    c.string('conversationId', { length: 64 }).nullable();
  });
  await connection.query
    .insertInto('agConversations')
    .values([
      { id: 'old', metadata: null },
      { id: 'native', metadata: { onlineAgent: { version: 1 } } },
      { id: 'runner', metadata: { runnerOnlineAgent: { version: 1 } } },
    ])
    .execute();
  await connection.query
    .insertInto('agConversationMessages')
    .values([
      { id: 'm1', conversationId: 'old' },
      { id: 'm2', conversationId: 'native' },
    ])
    .execute();
  await connection.query
    .insertInto('agChatAttachments')
    .values([{ id: 'a1', conversationId: 'old' }])
    .execute();

  await deletePreAgents1.up(context);

  const ids = async (collection: string) =>
    (
      await connection.query
        .selectFrom(collection)
        .select(['id'])
        .execute<{ id: string }>()
    )
      .map((row) => row.id)
      .sort();
  expect(await ids('agConversations')).toEqual(['native', 'runner']);
  expect(await ids('agConversationMessages')).toEqual(['m2']);
  expect(await ids('agChatAttachments')).toEqual([]);
});
