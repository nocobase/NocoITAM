import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * An entitlement is bought more than once — seats are added, subscriptions
 * renew — so, as for stock items, its purchase order and price move off
 * the record and into the purchase receipts each batch arrives through.
 * A contract already covers an entitlement through `contractCoverages`,
 * so the single `contractId` goes too; a link that only lived there is
 * copied into the coverage first. Rolling back restores the columns and
 * refills them from the first coverage and receipt.
 */
type Row = Record<string, unknown>;

const migration: MigrationDefinition = defineMigration({
  name: '202609200003_drop_entitlement_purchase_fields',

  async up({ builder, query }) {
    const linked = await query
      .selectFrom('entitlements')
      .select(['id', 'contractId', 'createdById', 'createdAt'])
      .where('contractId', 'is not', null)
      .execute<Row>();
    for (const row of linked) {
      const covered = await query
        .selectFrom('contractCoverages')
        .select('id')
        .where('contractId', '=', String(row.contractId))
        .where('targetType', '=', 'entitlement')
        .where('targetId', '=', String(row.id))
        .executeTakeFirst();
      if (covered) continue;
      await query
        .insertInto('contractCoverages')
        .values({
          id: crypto.randomUUID(),
          contractId: row.contractId,
          targetType: 'entitlement',
          targetId: row.id,
          createdById: row.createdById ?? null,
          createdAt: row.createdAt ?? new Date(),
        })
        .execute();
    }
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('purchaseOrderId');
      collection.dropField('purchasePrice');
      collection.dropField('contractId');
    });
  },

  async down({ builder, query }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('purchaseOrderId', { length: 64, nullable: true });
      collection.decimal('purchasePrice', {
        precision: 18,
        scale: 2,
        nullable: true,
      });
      collection.string('contractId', { length: 64, nullable: true });
    });
    const coverage = await query
      .selectFrom('contractCoverages')
      .select(['contractId', 'targetId'])
      .where('targetType', '=', 'entitlement')
      .orderBy('createdAt', 'asc')
      .execute<{ contractId: string; targetId: string }>();
    const firstContract = new Map<string, string>();
    for (const row of coverage)
      if (!firstContract.has(row.targetId))
        firstContract.set(row.targetId, row.contractId);
    for (const [id, contractId] of firstContract)
      await query
        .updateTable('entitlements')
        .set({ contractId })
        .where('id', '=', id)
        .execute();
    const receipts = await query
      .selectFrom('purchaseReceipts')
      .innerJoin(
        'purchaseOrderLines',
        'purchaseOrderLines.id',
        'purchaseReceipts.lineId',
      )
      .select([
        'purchaseReceipts.purchaseOrderId as purchaseOrderId',
        'purchaseReceipts.generatedId as entitlementId',
        'purchaseReceipts.quantity as quantity',
        'purchaseOrderLines.unitPrice as unitPrice',
      ])
      .where('purchaseReceipts.generatedType', '=', 'entitlement')
      .orderBy('purchaseReceipts.createdAt', 'asc')
      .execute<{
        purchaseOrderId: string;
        entitlementId: string;
        quantity: number;
        unitPrice: number | string | null;
      }>();
    const first = new Map<string, (typeof receipts)[number]>();
    for (const row of receipts)
      if (!first.has(row.entitlementId)) first.set(row.entitlementId, row);
    for (const [id, row] of first)
      await query
        .updateTable('entitlements')
        .set({
          purchaseOrderId: row.purchaseOrderId,
          purchasePrice:
            row.unitPrice === null
              ? null
              : Number(row.unitPrice) * Number(row.quantity),
        })
        .where('id', '=', id)
        .execute();
  },
});

export default migration;
