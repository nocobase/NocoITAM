import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * 入职配置: what a new joiner is given, by department and position
 * (2026-10-05).
 *
 * The standard kits used to be prose in the AI's business notes, which a
 * person or Ava could read but nothing could count against. A kit is now a
 * record: the department it is for, the position within it (empty for the
 * department's default), and its items — each a model, a category (any
 * model in it) or a software product, with a quantity — kept as one JSON
 * list on the kit, the way a category keeps its field template, because the
 * lines are only ever read and written with the kit.
 *
 * One kit per department and position; the department's default is the one
 * whose position is empty, and a person whose department has none takes
 * their parent department's.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610050005_onboarding_kits',

  async up({ builder }) {
    await builder.createCollection('onboardingKits', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('departmentId', { length: 64 }).notNull();
      collection.string('position', { length: 255 }).nullable();
      // [{ modelId | categoryId | softwareProductId, quantity }]
      collection.json('items').notNull();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_onboarding_kits' });
      collection.index('departmentId', {
        name: 'idx_onboarding_kits_department',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('onboardingKits');
  },
});

export default migration;
