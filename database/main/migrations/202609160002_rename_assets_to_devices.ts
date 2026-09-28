import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * "Asset" became the umbrella for the five asset types, and the table of
 * individually tracked items is the device register, so its identifiers
 * now say so: the `assets` table and everything that names it — foreign
 * keys, the type discriminators that used to say `asset`, index names,
 * history and reminder subjects, permission grants, numbering, settings.
 *
 * The collection builder cannot rename a field, so the column renames go
 * through the connection's knex client (`ALTER TABLE … RENAME COLUMN`,
 * which SQLite, PostgreSQL and MySQL 8 all support) and the collection
 * metadata documents are patched to match. That client is not bound to a
 * migration transaction, so this migration runs without one.
 */
interface SchemaClient {
  schema: {
    hasTable(name: string): Promise<boolean>;
    renameTable(from: string, to: string): Promise<unknown>;
    alterTable(
      table: string,
      callback: (table: {
        renameColumn(from: string, to: string): void;
        dropIndex(columns: string[], name: string): void;
        index(columns: string[], name: string): void;
        dropUnique(columns: string[], name: string): void;
        unique(columns: string[], options: { indexName: string }): void;
      }) => void,
    ): Promise<unknown>;
  };
}

/** Physical (snake_case) names, as the driver sees them. */
const TABLES: readonly { from: string; to: string }[] = [
  { from: 'assets', to: 'devices' },
  { from: 'asset_tags', to: 'device_tags' },
  { from: 'disposal_assets', to: 'disposal_devices' },
];

/** Columns to rename, keyed by the table's name after the table renames. */
const COLUMNS: readonly { table: string; from: string; to: string }[] = [
  { table: 'devices', from: 'asset_no', to: 'device_no' },
  { table: 'device_tags', from: 'asset_id', to: 'device_id' },
  { table: 'software_installs', from: 'asset_id', to: 'device_id' },
  { table: 'discovery_candidates', from: 'asset_id', to: 'device_id' },
  { table: 'tickets', from: 'asset_id', to: 'device_id' },
  { table: 'repairs', from: 'asset_id', to: 'device_id' },
  { table: 'repairs', from: 'loaner_asset_id', to: 'loaner_device_id' },
  { table: 'audit_items', from: 'asset_id', to: 'device_id' },
  { table: 'disposals', from: 'asset_count', to: 'device_count' },
  { table: 'disposal_devices', from: 'asset_id', to: 'device_id' },
];

/** Indexes whose names said asset; recreated under the new name. */
const INDEXES: readonly {
  table: string;
  columns: string[];
  from: string;
  to: string;
  unique?: boolean;
}[] = [
  {
    table: 'devices',
    columns: ['device_no'],
    from: 'uq_assets_asset_no',
    to: 'uq_devices_device_no',
    unique: true,
  },
  {
    table: 'devices',
    columns: ['serial_no'],
    from: 'idx_assets_serial_no',
    to: 'idx_devices_serial_no',
  },
  {
    table: 'devices',
    columns: ['status'],
    from: 'idx_assets_status',
    to: 'idx_devices_status',
  },
  {
    table: 'devices',
    columns: ['model_id'],
    from: 'idx_assets_model',
    to: 'idx_devices_model',
  },
  {
    table: 'devices',
    columns: ['category_id'],
    from: 'idx_assets_category',
    to: 'idx_devices_category',
  },
  {
    table: 'devices',
    columns: ['location_id'],
    from: 'idx_assets_location',
    to: 'idx_devices_location',
  },
  {
    table: 'devices',
    columns: ['department_id'],
    from: 'idx_assets_department',
    to: 'idx_devices_department',
  },
  {
    table: 'devices',
    columns: ['assignee_type', 'assignee_id'],
    from: 'idx_assets_assignee',
    to: 'idx_devices_assignee',
  },
  {
    table: 'devices',
    columns: ['purchase_order_id'],
    from: 'idx_assets_purchase_order',
    to: 'idx_devices_purchase_order',
  },
  {
    table: 'devices',
    columns: ['warranty_end_date'],
    from: 'idx_assets_warranty_end',
    to: 'idx_devices_warranty_end',
  },
  {
    table: 'devices',
    columns: ['owner_id'],
    from: 'idx_assets_owner',
    to: 'idx_devices_owner',
  },
  {
    table: 'device_tags',
    columns: ['tag_id'],
    from: 'idx_asset_tags_tag',
    to: 'idx_device_tags_tag',
  },
  {
    table: 'software_installs',
    columns: ['device_id'],
    from: 'idx_software_installs_asset',
    to: 'idx_software_installs_device',
  },
  {
    table: 'tickets',
    columns: ['device_id'],
    from: 'idx_tickets_asset',
    to: 'idx_tickets_device',
  },
  {
    table: 'repairs',
    columns: ['device_id'],
    from: 'idx_repairs_asset',
    to: 'idx_repairs_device',
  },
  {
    table: 'audit_items',
    columns: ['device_id'],
    from: 'idx_audit_items_asset',
    to: 'idx_audit_items_device',
  },
  {
    table: 'disposal_devices',
    columns: ['disposal_id', 'device_id'],
    from: 'uq_disposal_assets',
    to: 'uq_disposal_devices',
    unique: true,
  },
  {
    table: 'disposal_devices',
    columns: ['device_id'],
    from: 'idx_disposal_assets_asset',
    to: 'idx_disposal_devices_device',
  },
];

/** Discriminator columns whose value `asset` meant a device. */
const TYPE_VALUES: readonly { table: string; column: string }[] = [
  { table: 'devices', column: 'assigneeType' },
  { table: 'devices', column: 'reservedForType' },
  { table: 'stockHoldings', column: 'holderType' },
  { table: 'stockMovements', column: 'holderType' },
  { table: 'licenseSeats', column: 'holderType' },
  { table: 'allocations', column: 'subjectType' },
  { table: 'allocations', column: 'targetType' },
  { table: 'allocations', column: 'previousTargetType' },
  { table: 'contractCoverages', column: 'targetType' },
  { table: 'purchaseOrderLines', column: 'itemType' },
  { table: 'categories', column: 'appliesTo' },
  { table: 'numberSequences', column: 'key' },
];

/** Columns naming the collection (`assets`) rather than the kind. */
const COLLECTION_VALUES: readonly { table: string; column: string }[] = [
  { table: 'historyEvents', column: 'subjectType' },
  { table: 'changeLogs', column: 'subjectType' },
  { table: 'reminders', column: 'subjectType' },
  { table: 'attachmentLinks', column: 'ownerType' },
  { table: 'demoRecords', column: 'collection' },
];

/** Plugin-owned tables, absent when the plugin is not installed (tests). */
const PLUGIN_TABLES: Readonly<Record<string, string>> = {
  authorizationPermissionSets: 'authorization_permission_sets',
  aiActions: 'ai_actions',
  aiFindings: 'ai_findings',
};

const oldTable = (table: string): string =>
  TABLES.find((entry) => entry.to === table)?.from ?? table;
const oldColumn = (table: string, column: string): string =>
  COLUMNS.find((entry) => entry.table === table && entry.to === column)?.from ??
  column;

async function renameSchemaForward(client: SchemaClient): Promise<void> {
  for (const table of TABLES)
    await client.schema.renameTable(table.from, table.to);
  for (const column of COLUMNS)
    await client.schema.alterTable(column.table, (t) =>
      t.renameColumn(column.from, column.to),
    );
  // The database keeps an index's definition through a column rename; only
  // its name is stale, so each is recreated under the new one.
  for (const index of INDEXES)
    await client.schema.alterTable(index.table, (t) => {
      if (index.unique) {
        t.dropUnique(index.columns, index.from);
        t.unique(index.columns, { indexName: index.to });
      } else {
        t.dropIndex(index.columns, index.from);
        t.index(index.columns, index.to);
      }
    });
}

async function renameSchemaBack(client: SchemaClient): Promise<void> {
  for (const index of INDEXES)
    await client.schema.alterTable(index.table, (t) => {
      if (index.unique) t.dropUnique(index.columns, index.to);
      else t.dropIndex(index.columns, index.to);
    });
  for (const column of [...COLUMNS].reverse())
    await client.schema.alterTable(column.table, (t) =>
      t.renameColumn(column.to, column.from),
    );
  for (const table of [...TABLES].reverse())
    await client.schema.renameTable(table.to, table.from);
  for (const index of INDEXES) {
    const columns = index.columns.map((column) =>
      oldColumn(index.table, column),
    );
    await client.schema.alterTable(oldTable(index.table), (t) => {
      if (index.unique) t.unique(columns, { indexName: index.from });
      else t.index(columns, index.from);
    });
  }
}

const migration: MigrationDefinition = defineMigration({
  name: '202609160002_rename_assets_to_devices',
  transaction: false,
  async up({ query, connection }) {
    const client = await connection.client<SchemaClient>();
    await renameSchemaForward(client);

    for (const target of TYPE_VALUES)
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'device' })
        .where(target.column, '=', 'asset')
        .execute();
    for (const target of COLLECTION_VALUES) {
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'devices' })
        .where(target.column, '=', 'assets')
        .execute();
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'disposalDevices' })
        .where(target.column, '=', 'disposalAssets')
        .execute();
    }
    await query
      .updateTable('historyEvents')
      .set({ type: 'devicesChanged' })
      .where('type', '=', 'assetsChanged')
      .execute();
    await query
      .updateTable('reminders')
      .set({ kind: 'idleDevice' })
      .where('kind', '=', 'idleAsset')
      .execute();
    await rewriteJson(query, client, true);
    if (await client.schema.hasTable(PLUGIN_TABLES.aiFindings))
      await query
        .updateTable('aiFindings')
        .set({ subjectType: 'devices' })
        .where('subjectType', '=', 'assets')
        .execute();
  },
  async down({ query, connection }) {
    const client = await connection.client<SchemaClient>();
    if (await client.schema.hasTable(PLUGIN_TABLES.aiFindings))
      await query
        .updateTable('aiFindings')
        .set({ subjectType: 'assets' })
        .where('subjectType', '=', 'devices')
        .execute();
    await rewriteJson(query, client, false);
    await query
      .updateTable('reminders')
      .set({ kind: 'idleAsset' })
      .where('kind', '=', 'idleDevice')
      .execute();
    await query
      .updateTable('historyEvents')
      .set({ type: 'assetsChanged' })
      .where('type', '=', 'devicesChanged')
      .execute();
    for (const target of COLLECTION_VALUES) {
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'disposalAssets' })
        .where(target.column, '=', 'disposalDevices')
        .execute();
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'assets' })
        .where(target.column, '=', 'devices')
        .execute();
    }
    for (const target of TYPE_VALUES)
      await query
        .updateTable(target.table)
        .set({ [target.column]: 'asset' })
        .where(target.column, '=', 'device')
        .execute();
    await renameSchemaBack(client);
  },
});

/**
 * JSON that names the old identifiers: the numbering rule keyed `asset`,
 * permission grants on the `assets` collection, audit scopes and pending
 * AI proposals carrying `assetId(s)`, and the collection metadata documents
 * of the renamed tables and columns.
 */
async function rewriteJson(
  query: MigrationContext['query'],
  client: SchemaClient,
  forward: boolean,
): Promise<void> {
  const pairs: readonly [string, string][] = forward
    ? [
        ['"asset":', '"device":'],
        ['"id":"main.assets"', '"id":"main.devices"'],
        ['"id":"assets"', '"id":"devices"'],
        ['"assetIds"', '"deviceIds"'],
        ['"assetId"', '"deviceId"'],
        ['"assetNo"', '"deviceNo"'],
        ['"assetCount"', '"deviceCount"'],
        ['"loanerAssetId"', '"loanerDeviceId"'],
      ]
    : [
        ['"device":', '"asset":'],
        ['"id":"main.devices"', '"id":"main.assets"'],
        ['"id":"devices"', '"id":"assets"'],
        ['"deviceIds"', '"assetIds"'],
        ['"deviceId"', '"assetId"'],
        ['"deviceNo"', '"assetNo"'],
        ['"deviceCount"', '"assetCount"'],
        ['"loanerDeviceId"', '"loanerAssetId"'],
      ];
  const swapText = (text: string) =>
    pairs.reduce((acc, [from, to]) => acc.split(from).join(to), text);
  const rewriteColumn = async (
    table: string,
    id: string,
    column: string,
    where?: { column: string; value: string },
  ) => {
    let select = query
      .selectFrom(table)
      .select([id, column])
      .where(column, 'is not', null);
    if (where) select = select.where(where.column, '=', where.value);
    const rows = await select.execute<Record<string, unknown>>();
    for (const row of rows) {
      const text = row[column];
      if (typeof text !== 'string') continue;
      const next = swapText(text);
      if (next === text) continue;
      await query
        .updateTable(table)
        .set({ [column]: next })
        .where(id, '=', row[id])
        .execute();
    }
  };
  await rewriteColumn('itamSettings', 'key', 'value', {
    column: 'key',
    value: 'numbering',
  });
  await rewriteColumn('auditTasks', 'id', 'scope');
  for (const [table, columns] of [
    ['authorizationPermissionSets', ['grants']],
    ['aiActions', ['payload', 'rows']],
    ['aiFindings', ['subjectIds']],
  ] as const) {
    if (!(await client.schema.hasTable(PLUGIN_TABLES[table]))) continue;
    for (const column of columns) await rewriteColumn(table, 'id', column);
  }

  // Collection metadata: the documents of renamed collections move to the
  // new name and their field keys follow the columns.
  const renamed: readonly [string, string][] = [
    ['assets', 'devices'],
    ['assetTags', 'deviceTags'],
    ['disposalAssets', 'disposalDevices'],
  ];
  const fieldPairs: readonly [string, string][] = [
    ['"assetNo"', '"deviceNo"'],
    ['"assetId"', '"deviceId"'],
    ['"loanerAssetId"', '"loanerDeviceId"'],
    ['"assetCount"', '"deviceCount"'],
  ];
  const docs = await query
    .selectFrom('__nocobase_collection_metadata')
    .select(['name', 'document'])
    .execute<{ name: string; document: string }>();
  for (const doc of docs) {
    const pair = renamed.find(([from, to]) =>
      forward ? doc.name === from : doc.name === to,
    );
    const nextName = pair ? (forward ? pair[1] : pair[0]) : doc.name;
    let next = doc.document;
    for (const [from, to] of fieldPairs)
      next = forward ? next.split(from).join(to) : next.split(to).join(from);
    if (pair)
      next = next.split(`"name":"${doc.name}"`).join(`"name":"${nextName}"`);
    if (next === doc.document && nextName === doc.name) continue;
    await query
      .updateTable('__nocobase_collection_metadata')
      .set({ name: nextName, document: next })
      .where('name', '=', doc.name)
      .execute();
  }
}

export default migration;
