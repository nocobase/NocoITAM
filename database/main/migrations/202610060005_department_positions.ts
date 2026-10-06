import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A department's positions (2026-10-06): the list a person's 职位 is chosen
 * from, and what a position's own 入职配置 is attached to. A position typed
 * by hand matched a kit only when it was spelled exactly as the kit spelled
 * it — 设计师 against UI 设计师 fell back to the department's default
 * without a word. The seed `202610060002_seed_itam_department_positions`
 * fills the list from the people and kits already there.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060005_department_positions',

  async up({ builder }) {
    await builder.alterCollection('departments', (collection) => {
      collection.json('positions').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('departments', (collection) => {
      collection.dropField('positions');
    });
  },
});

export default migration;
