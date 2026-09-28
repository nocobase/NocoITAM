import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170001_unify_asset_request_tickets',
  async up({ builder, query }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.string('requestAssetType', { length: 32, nullable: true });
      collection.integer('quantity', { nullable: true });
    });
    await query
      .updateTable('tickets')
      .set({ requestAssetType: 'device', quantity: 1 })
      .where('type', '=', 'assetRequest')
      .execute();
    await query
      .updateTable('tickets')
      .set({
        type: 'assetRequest',
        requestAssetType: 'entitlement',
        quantity: 1,
        categoryId: null,
        modelId: null,
      })
      .where('type', '=', 'softwareRequest')
      .execute();
  },
  async down({ builder, query }) {
    await query
      .updateTable('tickets')
      .set({ type: 'softwareRequest' })
      .where('type', '=', 'assetRequest')
      .where('requestAssetType', '=', 'entitlement')
      .execute();
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('requestAssetType');
      collection.dropField('quantity');
    });
  },
});
export default migration;
