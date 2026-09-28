import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Contracts leave the application (decided 2026-09-25): signed terms live in
 * the legal or contract system, and what the register needs from them is
 * already on its own records — a device's warranty end, a subscription's
 * renewal date and price. Purchase orders stay, and lose the contract they
 * could name. The history, change log, reminders, AI findings, attachment
 * links and demo bookkeeping that pointed at contracts go with the tables,
 * and so do the stored contract numbering rule and its sequence. Rolling back
 * restores the schema, not the rows.
 */
interface Row {
  readonly key: string;
  readonly value: unknown;
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
  name: '202609250006_drop_contracts',

  async up({ builder, query, connection }) {
    for (const table of ['historyEvents', 'changeLogs', 'reminders'] as const)
      await query
        .deleteFrom(table)
        .where('subjectType', '=', 'contracts')
        .execute();
    await query
      .deleteFrom('attachmentLinks')
      .where('ownerType', '=', 'contracts')
      .execute();
    await query
      .deleteFrom('demoRecords')
      .where('collection', 'in', ['contracts', 'contractCoverages'])
      .execute();
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (await client.schema.hasTable('ai_findings'))
      await query
        .deleteFrom('aiFindings')
        .where('subjectType', '=', 'contracts')
        .execute();
    await query
      .deleteFrom('numberSequences')
      .where('key', '=', 'contract')
      .execute();
    const numbering = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'numbering')
      .executeTakeFirst<Row>();
    const rules = numbering ? decode(numbering.value) : null;
    if (rules && 'contract' in rules) {
      delete rules.contract;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value: rules })
        .where('key', '=', 'numbering')
        .execute();
    }
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.dropField('contractId');
    });
    await builder.dropCollection('contractCoverages');
    await builder.dropCollection('contracts');
  },

  async down({ builder }) {
    await builder.createCollection('contracts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('contractNo', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // purchase | maintenance | lease | service | softwareSubscription | other
      collection.string('type', { length: 32 }).notNull();
      collection.string('vendorId', { length: 64 }).notNull();
      collection.date('startDate').notNull();
      collection.date('endDate').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('paymentTerms', { length: 255 }).nullable();
      collection.boolean('autoRenew').notNull().defaultTo(false);
      collection.integer('noticeDays').nullable();
      // notStarted | active | expiring | expired | terminated
      collection.string('status', { length: 16 }).notNull();
      // notDue | underReview | renew | cancel | renewed
      collection.string('renewalDecision', { length: 16 }).notNull();
      collection.text('terminationReason').nullable();
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_contracts' });
      collection.unique('contractNo', { name: 'uq_contracts_no' });
      collection.index('vendorId', { name: 'idx_contracts_vendor' });
      collection.index('status', { name: 'idx_contracts_status' });
      collection.index('endDate', { name: 'idx_contracts_end' });
    });
    await builder.createCollection('contractCoverages', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('contractId', { length: 64 }).notNull();
      // device | entitlement
      collection.string('targetType', { length: 16 }).notNull();
      collection.string('targetId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_contract_coverages' });
      collection.unique(['contractId', 'targetType', 'targetId'], {
        name: 'uq_contract_coverages_target',
      });
      collection.index(['targetType', 'targetId'], {
        name: 'idx_contract_coverages_target',
      });
    });
    await builder.alterCollection('purchaseOrders', (collection) => {
      collection.string('contractId', { length: 64 }).nullable();
    });
  },
});

export default migration;
