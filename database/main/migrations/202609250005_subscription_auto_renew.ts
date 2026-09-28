import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A subscription's renewal is one date and one switch.
 *
 * `renewalDecision` held six process labels (notDue, underReview, renew,
 * reduceSeats, cancel, renewed) that no page read and no rule acted on
 * beyond flipping notDue to underReview, which the expiry reminder already
 * says. The one value that mattered — do not renew — becomes the meaning of
 * `autoRenew`, which until now was stored and never read: on, the renewal
 * date rolls forward a cycle once it passes; off, that date is when the
 * subscription ends. Existing rows keep renewing unless their decision was
 * `cancel`: the old switch had no effect, so it carries no intent to keep.
 *
 * The column goes with its index; SQLite refuses to drop an indexed column.
 * Rolling back restores the column as `notDue` for subscriptions.
 */
interface SchemaClient {
  schema: {
    alterTable(
      table: string,
      callback: (table: {
        dropIndex(columns: string[], name: string): void;
        index(columns: string[], name: string): void;
      }) => void,
    ): Promise<unknown>;
  };
}

const migration: MigrationDefinition = defineMigration({
  name: '202609250005_subscription_auto_renew',

  async up({ builder, query, connection }) {
    await query
      .updateTable('entitlements')
      .set({ autoRenew: true })
      .where('kind', '=', 'subscription')
      .where((eb) =>
        eb.or([
          eb('renewalDecision', 'is', null),
          eb('renewalDecision', '!=', 'cancel'),
        ]),
      )
      .execute();
    await query
      .updateTable('entitlements')
      .set({ autoRenew: false })
      .where('kind', '=', 'subscription')
      .where('renewalDecision', '=', 'cancel')
      .execute();
    const client = await connection.client<SchemaClient>();
    await client.schema.alterTable('entitlements', (table) => {
      table.dropIndex(['renewal_decision'], 'idx_entitlements_decision');
    });
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('renewalDecision');
    });
  },

  async down({ builder, query, connection }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('renewalDecision', { length: 16 }).nullable();
    });
    const client = await connection.client<SchemaClient>();
    await client.schema.alterTable('entitlements', (table) => {
      table.index(['renewal_decision'], 'idx_entitlements_decision');
    });
    await query
      .updateTable('entitlements')
      .set({ renewalDecision: 'notDue' })
      .where('kind', '=', 'subscription')
      .execute();
  },
});

export default migration;
