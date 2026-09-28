import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One price per subscription.
 *
 * A subscription carried a unit price and a cycle cost, and the cycle cost,
 * when filled, silently overrode unit price × seats — so a per-seat
 * subscription could keep charging for seats it no longer had. The price is
 * now one field whose meaning follows the billing model: per seat per cycle
 * (`perSeat`) or the whole cycle (`flat`). The `usage` model goes too: with
 * no usage data behind it, its only number was an estimate of the cycle,
 * which is what `flat` holds.
 *
 * Data: a subscription that had a cycle cost becomes `flat` with that cost
 * as its price (a per-seat one keeps its seat count as the cap), `usage`
 * becomes `flat`, and the annual cost is recomputed from the one price. The
 * rules are spelled out here, not imported, so this migration keeps meaning
 * what it meant. Rolling back restores the column empty; the model and
 * price changes stay.
 */
interface Row {
  readonly id: string;
  readonly billingModel: string | null;
  readonly billingCycle: string | null;
  readonly unitPrice: number | string | null;
  readonly cycleCost: number | string | null;
  readonly seatCount: number | string | null;
}

const CYCLES_PER_YEAR: Readonly<Record<string, number>> = {
  month: 12,
  quarter: 4,
  year: 1,
};

const present = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== '';

const migration: MigrationDefinition = defineMigration({
  name: '202609250004_single_subscription_price',

  async up({ builder, query }) {
    const rows = await query
      .selectFrom('entitlements')
      .select([
        'id',
        'billingModel',
        'billingCycle',
        'unitPrice',
        'cycleCost',
        'seatCount',
      ])
      .where('kind', '=', 'subscription')
      .execute<Row>();
    for (const row of rows) {
      const flat = present(row.cycleCost) || row.billingModel !== 'perSeat';
      const unitPrice = present(row.cycleCost)
        ? Number(row.cycleCost)
        : present(row.unitPrice)
          ? Number(row.unitPrice)
          : null;
      const perYear = CYCLES_PER_YEAR[String(row.billingCycle)] ?? 1;
      const units = flat ? 1 : Number(row.seatCount ?? 0);
      const annualCost =
        unitPrice === null
          ? null
          : Math.round(unitPrice * units * perYear * 100) / 100;
      await query
        .updateTable('entitlements')
        .set({
          billingModel: flat ? 'flat' : 'perSeat',
          unitPrice,
          annualCost,
        })
        .where('id', '=', row.id)
        .execute();
    }
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('cycleCost');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.decimal('cycleCost', { precision: 18, scale: 2 }).nullable();
    });
  },
});

export default migration;
