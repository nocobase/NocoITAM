import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Takes the starter vendors off (2026-10-21): the vendor seed wrote one per
 * role — an equipment and a software reseller, a repair provider and a
 * recycler — as placeholders, and a fresh install should hold none but the
 * vendors its IT team deals with. A starter vendor somebody has used (a
 * purchase order, a repair or a device names it) stays, as one somebody may
 * have renamed to a real one; the rest go, with their creation lines.
 */
const STARTER_VENDORS = [
  'vendor-equipment',
  'vendor-software',
  'vendor-repair',
  'vendor-recycler',
];

/** The tables whose records name a vendor. */
const REFERENCES = ['purchaseOrders', 'repairs', 'devices'] as const;

const seed: SeedDefinition = defineSeed({
  name: '202610210003_remove_starter_vendors',

  async run({ query }) {
    for (const id of STARTER_VENDORS) {
      let used = false;
      for (const table of REFERENCES)
        if (
          await query
            .selectFrom(table)
            .select('id')
            .where('vendorId', '=', id)
            .executeTakeFirst()
        ) {
          used = true;
          break;
        }
      if (used) continue;
      await query
        .deleteFrom('changeLogs')
        .where('subjectType', '=', 'vendors')
        .where('subjectId', '=', id)
        .execute();
      await query.deleteFrom('vendors').where('id', '=', id).execute();
    }
  },
});

export default seed;
