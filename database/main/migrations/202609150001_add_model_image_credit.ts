import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Attribution for a model picture that is not the deployment's own work:
 * the seeded photos come from Wikimedia Commons under Creative Commons
 * licenses that require naming the author, and an administrator may credit
 * a photo taken from a manufacturer's press kit. Shown under the picture.
 * The picture itself is the file `imageFileId` points at.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609150001_add_model_image_credit',
  async up({ builder }) {
    await builder.alterCollection('models', (collection) => {
      collection.string('imageCredit', { length: 512, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('models', (collection) => {
      collection.dropField('imageCredit');
    });
  },
});

export default migration;
