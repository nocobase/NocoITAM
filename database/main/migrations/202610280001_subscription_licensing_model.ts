import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * Subscriptions state a licensing model too (2026-10-28): it was a perpetual
 * entitlement's alone, so a subscription could not say its seats go to
 * devices. Every subscription without one is per user: people were the only
 * holders a subscription's seats could have, and whether a flat-priced one
 * without a cap is really a site licence is not something the data says.
 * Its seat count and price are untouched; per user with a flat price and no
 * cap still counts no seats. The column already exists
 * (`202609200002_merge_entitlements`); only the rows change.
 *
 * `down` empties the subscriptions' licensing model again, as it was.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610280001_subscription_licensing_model',
  async up({ query }: MigrationContext): Promise<void> {
    await query
      .updateTable('entitlements')
      .set({ licensingModel: 'perUser' })
      .where('kind', '=', 'subscription')
      .where('licensingModel', 'is', null)
      .execute();
  },
  async down({ query }: MigrationContext): Promise<void> {
    await query
      .updateTable('entitlements')
      .set({ licensingModel: null })
      .where('kind', '=', 'subscription')
      .execute();
  },
});

export default migration;
