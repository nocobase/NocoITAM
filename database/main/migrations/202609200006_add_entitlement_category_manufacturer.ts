import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Like a device or stock item follows its model, an entitlement follows
 * its software product: the product's category and manufacturer are
 * copied onto the record so lists filter and count by them without a
 * join. Existing rows are backfilled from their product.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200006_add_entitlement_category_manufacturer',

  async up({ builder, query }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.string('categoryId', { length: 64, nullable: true });
      collection.string('manufacturerId', { length: 64, nullable: true });
      collection.index('categoryId', { name: 'idx_entitlements_category' });
      collection.index('manufacturerId', {
        name: 'idx_entitlements_manufacturer',
      });
    });
    const products = await query
      .selectFrom('softwareProducts')
      .select(['id', 'categoryId', 'manufacturerId'])
      .execute<{
        id: string;
        categoryId: string | null;
        manufacturerId: string | null;
      }>();
    for (const product of products)
      await query
        .updateTable('entitlements')
        .set({
          categoryId: product.categoryId,
          manufacturerId: product.manufacturerId,
        })
        .where('softwareProductId', '=', product.id)
        .execute();
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('categoryId');
      collection.dropField('manufacturerId');
    });
  },
});

export default migration;
