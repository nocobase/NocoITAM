import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Deletes the conversations held before the Agents plugin 1.0 (2026-10-20,
 * template 1.0.0-beta.73), with their messages and attachments. Plugin 1.0
 * opens a conversation only through the backend its metadata binds it to
 * (`onlineAgent` or `runnerOnlineAgent`); one from before carries neither,
 * and opening it fails with "no valid OnlineAgent backend binding". The
 * user chose to clear them rather than keep what cannot be read. The name
 * sorts after the plugin's 1.0 migrations (`202610270002_…`), so every
 * conversation the plugin can still bind has its binding by then.
 *
 * Irreversible: `down` cannot bring deleted conversations back.
 */

type Row = { id: string; metadata: unknown };

function unbound(metadata: unknown): boolean {
  let value: unknown = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return true;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  return !('onlineAgent' in value) && !('runnerOnlineAgent' in value);
}

const migration: MigrationDefinition = defineMigration({
  name: '202610270003_delete_pre_agents_1_conversations',
  async up({ builder, query }: MigrationContext): Promise<void> {
    // A database without the Agents plugin (the tests') has nothing to clear.
    if (!(await builder.hasCollection('agConversations'))) return;
    const rows = await query
      .selectFrom('agConversations')
      .select(['id', 'metadata'])
      .execute<Row>();
    for (const { id } of rows.filter((row) => unbound(row.metadata))) {
      await query
        .deleteFrom('agChatAttachments')
        .where('conversationId', '=', id)
        .execute();
      await query
        .deleteFrom('agConversationMessages')
        .where('conversationId', '=', id)
        .execute();
      await query.deleteFrom('agConversations').where('id', '=', id).execute();
    }
  },
  async down(): Promise<void> {
    // Deleted conversations cannot be restored.
  },
});

export default migration;
