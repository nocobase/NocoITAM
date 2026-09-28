import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170002_ticket_related_assets',
  async up({ builder, query }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.string('relatedAssetType', { length: 32, nullable: true });
      collection.string('stockItemId', { length: 64, nullable: true });
      collection.string('licenseId', { length: 64, nullable: true });
      collection.index('stockItemId');
      collection.index('licenseId');
    });
    await query
      .updateTable('tickets')
      .set({ relatedAssetType: 'device' })
      .where('type', 'in', [
        'faultReport',
        'returnRequest',
        'transferRequest',
        'disposalRequest',
      ])
      .execute();
  },
  async down({ builder }) {
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('relatedAssetType');
      collection.dropField('stockItemId');
      collection.dropField('licenseId');
    });
  },
});
export default migration;
