import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Tags never got a feature: no service, route or page reads `tags` or
 * `deviceTags`, and the specification does not mention them. Both tables
 * go; rolling back recreates them empty in their final (renamed) shape.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200007_drop_tags',

  async up({ builder }) {
    await builder.dropCollection('deviceTags');
    await builder.dropCollection('tags');
  },

  async down({ builder }) {
    await builder.createCollection('tags', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 128 }).notNull();
      collection.string('color', { length: 32 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_tags' });
      collection.unique('name', { name: 'uq_tags_name' });
    });
    await builder.createCollection('deviceTags', (collection) => {
      collection.string('deviceId', { length: 64 }).notNull();
      collection.string('tagId', { length: 64 }).notNull();
      collection.primary(['deviceId', 'tagId'], { name: 'pk_device_tags' });
      collection.index('tagId', { name: 'idx_device_tags_tag' });
    });
  },
});

export default migration;
