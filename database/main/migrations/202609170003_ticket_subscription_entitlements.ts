import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170003_ticket_subscription_entitlements',
  async up({ builder, query }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.string('entitlementId', { length: 64, nullable: true });
      collection.string('entitlementKind', { length: 32, nullable: true });
      collection.index('entitlementId');
    });
    const rows = await query
      .selectFrom('tickets')
      .select(['id', 'licenseId'])
      .where('licenseId', 'is not', null)
      .execute<{ id: string; licenseId: string }>();
    for (const row of rows) {
      await query
        .updateTable('tickets')
        .set({ entitlementId: row.licenseId, entitlementKind: 'perpetual' })
        .where('id', '=', row.id)
        .execute();
    }
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('licenseId');
    });
  },
  async down({ builder, query }) {
    // Subscription links cannot be represented by the old license-only schema.
    const subscription = await query
      .selectFrom('tickets')
      .select('id')
      .where('entitlementKind', '=', 'subscription')
      .executeTakeFirst();
    if (subscription)
      throw new Error(
        'Subscription tickets must be removed before rolling back their schema',
      );
    await builder.alterCollection('tickets', (collection) => {
      collection.string('licenseId', { length: 64, nullable: true });
      collection.index('licenseId');
    });
    const rows = await query
      .selectFrom('tickets')
      .select(['id', 'entitlementId'])
      .where('entitlementId', 'is not', null)
      .execute<{ id: string; entitlementId: string }>();
    for (const row of rows)
      await query
        .updateTable('tickets')
        .set({ licenseId: row.entitlementId })
        .where('id', '=', row.id)
        .execute();
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('entitlementId');
      collection.dropField('entitlementKind');
    });
  },
});
export default migration;
