import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Stock items never got a picture: like devices, their files live in the
 * attachments, and no page or service ever read or wrote `imageFileId`
 * (models keep theirs). The column goes; rolling back restores it empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200009_drop_stock_item_image',

  async up({ builder }) {
    await builder.alterCollection('stockItems', (collection) => {
      collection.dropField('imageFileId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('stockItems', (collection) => {
      collection.string('imageFileId', { length: 64, nullable: true });
    });
  },
});

export default migration;
