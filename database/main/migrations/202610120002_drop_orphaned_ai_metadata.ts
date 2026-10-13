import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The AI employee plugin left the application with template 1.0.0-beta.64
 * (the assistant runs on the Agents plugin). `202609230003_write_ai_collection_metadata`
 * wrote Collection metadata for that plugin's tables, which a database that
 * ran the plugin still holds — their rows stay, as the conversations people
 * had. A database created after the plugin left never had those tables, and
 * the documents there describe nothing: each is removed where its table is
 * missing, so the metadata and the tables agree again.
 *
 * There is nothing to put back: a document for a table that does not exist
 * is what the migration corrects, so `down` leaves the metadata as it is.
 */
const AI_COLLECTIONS: Readonly<Record<string, string>> = {
  aiConversations: 'ai_conversations',
  aiEmployees: 'ai_employees',
  aiMcpClients: 'ai_mcp_clients',
  aiMessages: 'ai_messages',
  aiSettings: 'ai_settings',
  aiToolMessages: 'ai_tool_messages',
  aiUsageEvents: 'ai_usage_events',
  lcCheckpoints: 'lc_checkpoints',
  lcCheckpointBlobs: 'lc_checkpoint_blobs',
  lcCheckpointWrites: 'lc_checkpoint_writes',
  usersAiEmployees: 'users_ai_employees',
};

interface SchemaClient {
  readonly schema: { hasTable(name: string): Promise<boolean> };
}

const migration: MigrationDefinition = defineMigration({
  name: '202610120002_drop_orphaned_ai_metadata',

  async up({ query, connection }) {
    const client = await connection.client<SchemaClient>();
    if (!(await client.schema.hasTable('__nocobase_collection_metadata')))
      return;
    for (const [name, table] of Object.entries(AI_COLLECTIONS))
      if (!(await client.schema.hasTable(table)))
        await query
          .deleteFrom('__nocobase_collection_metadata')
          .where('name', '=', name)
          .execute();
  },

  async down() {
    // Nothing to restore: see above.
  },
});

export default migration;
