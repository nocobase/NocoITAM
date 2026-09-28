import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Device discovery leaves the application (decided 2026-09-27). It only ever
 * reconciled a CSV someone exported from an MDM or a scanner by hand, so a
 * device's "last discovered" time said when that was last remembered, not
 * when the device was last seen, and the "in use but not discovered" reminder
 * fired on whatever nobody had exported. It goes whole: the imports and their
 * candidates, a device's `lastDiscoveredAt` and the miss count kept in its
 * attributes, the stored rules, the reminder and AI findings it raised, and
 * the "discovered" timeline lines, whose summary named a matching rule that
 * no longer exists. The hardware details a match copied into a device's
 * attributes stay: they are facts about the device, whoever typed them.
 * Rolling back restores the schema, not the rows.
 */
interface SettingsRow {
  readonly key: string;
  readonly value: unknown;
}

interface DeviceRow {
  readonly id: string;
  readonly attributes: unknown;
}

/** A JSON column arrives decoded, or as the text an older write left. */
const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609270004_drop_discovery',

  async up({ builder, query, connection }) {
    await query
      .deleteFrom('reminders')
      .where('kind', '=', 'notDiscovered')
      .execute();
    await query
      .deleteFrom('historyEvents')
      .where('type', '=', 'discovered')
      .execute();
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (await client.schema.hasTable('ai_findings'))
      await query
        .deleteFrom('aiFindings')
        .where('kind', '=', 'notDiscovered')
        .execute();

    await query
      .deleteFrom('itamSettings')
      .where('key', '=', 'discovery')
      .execute();
    const ai = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'ai')
      .executeTakeFirst<SettingsRow>();
    const aiValue = ai ? decode(ai.value) : null;
    const embedded = aiValue ? decode(aiValue.embedded) : null;
    if (aiValue && embedded && 'discoveryNormalization' in embedded) {
      delete embedded.discoveryNormalization;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value: { ...aiValue, embedded } })
        .where('key', '=', 'ai')
        .execute();
    }

    const devices = await query
      .selectFrom('devices')
      .select(['id', 'attributes'])
      .execute<DeviceRow>();
    for (const device of devices) {
      const attributes = decode(device.attributes);
      if (!attributes || !('discoveryMisses' in attributes)) continue;
      delete attributes.discoveryMisses;
      await query
        .updateTable('devices')
        .set({ attributes })
        .where('id', '=', device.id)
        .execute();
    }

    await builder.alterCollection('devices', (collection) => {
      collection.dropField('lastDiscoveredAt');
    });
    await builder.dropCollection('discoveryCandidates');
    await builder.dropCollection('discoveryImports');
  },

  async down({ builder }) {
    await builder.createCollection('discoveryImports', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('source', { length: 128 }).notNull();
      collection.string('importedById', { length: 64 }).nullable();
      collection.datetime('importedAt').notNull();
      collection.integer('matched').notNull().defaultTo(0);
      collection.integer('unmatched').notNull().defaultTo(0);
      collection.integer('notSeen').notNull().defaultTo(0);
      collection.integer('flagged').notNull().defaultTo(0);
      collection.primary('id', { name: 'pk_discovery_imports' });
      collection.index('importedAt', { name: 'idx_discovery_imports_at' });
    });
    await builder.createCollection('discoveryCandidates', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('importId', { length: 64 }).notNull();
      collection.string('serialNo', { length: 128 }).nullable();
      collection.string('mac', { length: 64 }).nullable();
      collection.string('hostname', { length: 255 }).nullable();
      collection.string('modelName', { length: 255 }).nullable();
      collection.string('manufacturerName', { length: 255 }).nullable();
      collection.json('data').notNull();
      collection.string('suggestedModelId', { length: 64 }).nullable();
      // pending | registered | unmanaged
      collection.string('status', { length: 16 }).notNull();
      collection.string('deviceId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_discovery_candidates' });
      collection.index(['status', 'createdAt'], {
        name: 'idx_discovery_candidates_status',
      });
    });
    await builder.alterCollection('devices', (collection) => {
      collection.datetime('lastDiscoveredAt').nullable();
    });
  },
});

export default migration;
