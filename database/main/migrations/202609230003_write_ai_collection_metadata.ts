import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Writes the collection metadata of the AI plugin's tables.
 *
 * The metadata store arrived with template beta.43. A table created by a
 * migration that ran before it has no metadata document, and the Repository
 * then infers every column as text — which makes `updatedAt` unsortable and
 * answered each `/api/ai/aiConversations:list` with a 500, so the assistant
 * panel could not open. Only the AI plugin's tables are affected; every other
 * collection in this database already carries its document.
 *
 * Re-running the plugin's own migrations is not possible (their tables exist
 * and their history is recorded), so the documents are written here. They are
 * the ones a fresh install of the same plugin version produces, and each was
 * checked against this database's physical schema before being copied in.
 *
 * `ai_settings.default_llmservice` is renamed to `default_llm_service` in the
 * same step: the column was created under an older name conversion, and the
 * document — like the plugin's runtime — names the field `defaultLlmService`.
 * The table holds no rows in an installation upgraded to this point.
 */
const DOCUMENTS: Readonly<Record<string, unknown>> = {
  aiConversations: {
    version: 1,
    name: 'aiConversations',
    fields: {
      sessionId: {
        type: 'uuid',
      },
      thread: {
        type: 'integer',
      },
      topicId: {
        type: 'string',
      },
      from: {
        type: 'string',
      },
      scope: {
        type: 'string',
      },
      userId: {
        type: 'string',
      },
      aiEmployeeUsername: {
        type: 'string',
      },
      title: {
        type: 'string',
      },
      options: {
        type: 'json',
      },
      llmActiveState: {
        type: 'string',
      },
      category: {
        type: 'string',
      },
      read: {
        type: 'boolean',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiEmployees: {
    version: 1,
    name: 'aiEmployees',
    fields: {
      username: {
        type: 'string',
      },
      nickname: {
        type: 'string',
      },
      position: {
        type: 'string',
      },
      avatar: {
        type: 'string',
      },
      bio: {
        type: 'text',
      },
      about: {
        type: 'text',
      },
      description: {
        type: 'text',
      },
      defaultPrompt: {
        type: 'text',
      },
      greeting: {
        type: 'text',
      },
      chatSettings: {
        type: 'json',
      },
      skillSettings: {
        type: 'json',
      },
      modelSettings: {
        type: 'json',
      },
      dataSourceSettings: {
        type: 'json',
      },
      enableKnowledgeBase: {
        type: 'boolean',
      },
      knowledgeBasePrompt: {
        type: 'text',
      },
      knowledgeBase: {
        type: 'json',
      },
      enabled: {
        type: 'boolean',
      },
      builtIn: {
        type: 'boolean',
      },
      category: {
        type: 'string',
      },
      deprecated: {
        type: 'boolean',
      },
      sort: {
        type: 'integer',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiMcpClients: {
    version: 1,
    name: 'aiMcpClients',
    fields: {
      name: {
        type: 'string',
      },
      title: {
        type: 'string',
      },
      description: {
        type: 'string',
      },
      enabled: {
        type: 'boolean',
      },
      transport: {
        type: 'string',
      },
      command: {
        type: 'string',
      },
      args: {
        type: 'json',
      },
      env: {
        type: 'json',
      },
      url: {
        type: 'string',
      },
      headers: {
        type: 'json',
      },
      restart: {
        type: 'json',
      },
      sort: {
        type: 'integer',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiMessages: {
    version: 1,
    name: 'aiMessages',
    fields: {
      messageId: {
        type: 'bigInt',
      },
      sessionId: {
        type: 'string',
      },
      role: {
        type: 'string',
      },
      content: {
        type: 'json',
      },
      toolCalls: {
        type: 'json',
      },
      attachments: {
        type: 'json',
      },
      workContext: {
        type: 'json',
      },
      metadata: {
        type: 'json',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiSettings: {
    version: 1,
    name: 'aiSettings',
    fields: {
      options: {
        type: 'json',
      },
      defaultLlmService: {
        type: 'string',
      },
      defaultModel: {
        type: 'string',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiToolMessages: {
    version: 1,
    name: 'aiToolMessages',
    fields: {
      id: {
        type: 'bigInt',
      },
      sessionId: {
        type: 'uuid',
      },
      messageId: {
        type: 'bigInt',
      },
      toolCallId: {
        type: 'string',
      },
      toolName: {
        type: 'string',
      },
      status: {
        type: 'string',
      },
      content: {
        type: 'json',
      },
      invokeStatus: {
        type: 'string',
      },
      invokeStartTime: {
        type: 'bigInt',
      },
      invokeEndTime: {
        type: 'bigInt',
      },
      auto: {
        type: 'boolean',
      },
      execution: {
        type: 'string',
      },
      interruptActionOrder: {
        type: 'integer',
      },
      interruptAction: {
        type: 'json',
      },
      userDecision: {
        type: 'json',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
  aiUsageEvents: {
    version: 1,
    name: 'aiUsageEvents',
    fields: {
      id: {
        type: 'bigInt',
      },
      occurredAt: {
        type: 'bigInt',
      },
      sessionId: {
        type: 'uuid',
      },
      messageId: {
        type: 'bigInt',
      },
      userId: {
        type: 'string',
      },
      aiEmployeeUsername: {
        type: 'string',
      },
      from: {
        type: 'string',
      },
      category: {
        type: 'string',
      },
      eventType: {
        type: 'string',
      },
      role: {
        type: 'string',
      },
      provider: {
        type: 'string',
      },
      llmService: {
        type: 'string',
      },
      model: {
        type: 'string',
      },
      inputTokens: {
        type: 'bigInt',
      },
      outputTokens: {
        type: 'bigInt',
      },
      totalTokens: {
        type: 'bigInt',
      },
      cachedTokens: {
        type: 'bigInt',
      },
      reasoningTokens: {
        type: 'bigInt',
      },
      toolCallCount: {
        type: 'integer',
      },
      autoToolCallCount: {
        type: 'integer',
      },
      status: {
        type: 'string',
      },
      rawUsageMetadata: {
        type: 'json',
      },
      rawResponseMetadata: {
        type: 'json',
      },
    },
  },
  lcCheckpoints: {
    version: 1,
    name: 'lcCheckpoints',
    fields: {
      threadId: {
        type: 'string',
      },
      checkpointNs: {
        type: 'string',
      },
      checkpointId: {
        type: 'string',
      },
      parentCheckpointId: {
        type: 'string',
      },
      type: {
        type: 'string',
      },
      checkpoint: {
        type: 'json',
      },
      metadata: {
        type: 'json',
      },
    },
  },
  lcCheckpointBlobs: {
    version: 1,
    name: 'lcCheckpointBlobs',
    fields: {
      threadId: {
        type: 'string',
      },
      checkpointNs: {
        type: 'string',
      },
      channel: {
        type: 'string',
      },
      version: {
        type: 'string',
      },
      type: {
        type: 'string',
      },
      blob: {
        type: 'blob',
      },
    },
  },
  lcCheckpointWrites: {
    version: 1,
    name: 'lcCheckpointWrites',
    fields: {
      threadId: {
        type: 'string',
      },
      checkpointNs: {
        type: 'string',
      },
      checkpointId: {
        type: 'string',
      },
      taskId: {
        type: 'string',
      },
      idx: {
        type: 'integer',
      },
      channel: {
        type: 'string',
      },
      type: {
        type: 'string',
      },
      blob: {
        type: 'blob',
      },
    },
  },
  usersAiEmployees: {
    version: 1,
    name: 'usersAiEmployees',
    fields: {
      userId: {
        type: 'string',
      },
      aiEmployee: {
        type: 'string',
      },
      sort: {
        type: 'integer',
      },
      prompt: {
        type: 'text',
      },
      createdAt: {
        type: 'datetime',
      },
      updatedAt: {
        type: 'datetime',
      },
    },
  },
};

/** The migration connection's client is a knex instance. */
interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
    alterTable(
      table: string,
      build: (builder: {
        renameColumn(from: string, to: string): unknown;
      }) => void,
    ): Promise<unknown>;
  };
}

const hasColumn = async (
  client: SchemaClient,
  table: string,
  column: string,
): Promise<boolean> =>
  (await client.schema.hasTable(table)) &&
  (await client.schema.hasColumn(table, column));

const renameColumn = async (
  client: SchemaClient,
  table: string,
  from: string,
  to: string,
): Promise<void> => {
  if (!(await hasColumn(client, table, from))) return;
  await client.schema.alterTable(table, (builder) =>
    builder.renameColumn(from, to),
  );
};

const migration: MigrationDefinition = defineMigration({
  name: '202609230003_write_ai_collection_metadata',
  async up({ query, connection }) {
    const client = await connection.client<SchemaClient>();
    if (!(await client.schema.hasTable('__nocobase_collection_metadata')))
      return;
    await renameColumn(
      client,
      'ai_settings',
      'default_llmservice',
      'default_llm_service',
    );
    const existing = new Set(
      (
        await query
          .selectFrom('__nocobase_collection_metadata')
          .select(['name'])
          .execute<{ name: string }>()
      ).map((row) => row.name),
    );
    const now = new Date();
    for (const [name, document] of Object.entries(DOCUMENTS)) {
      if (existing.has(name)) continue;
      await query
        .insertInto('__nocobase_collection_metadata')
        .values({
          name,
          document: JSON.stringify(document),
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
  async down({ query, connection }) {
    const client = await connection.client<SchemaClient>();
    if (await client.schema.hasTable('__nocobase_collection_metadata'))
      for (const name of Object.keys(DOCUMENTS))
        await query
          .deleteFrom('__nocobase_collection_metadata')
          .where('name', '=', name)
          .execute();
    await renameColumn(
      client,
      'ai_settings',
      'default_llm_service',
      'default_llmservice',
    );
  },
});

export default migration;
