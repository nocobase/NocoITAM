import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The plan a work agent's suggestion became is no longer recorded
 * (2026-10-17). `planId` came with 离职回收 and 授权续费, whose accepted
 * suggestions turned into plans; both agents were removed the same day,
 * and 审批审阅 decides the request itself, with no plan.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610170002_drop_agent_run_plans',

  async up({ builder }) {
    await builder.alterCollection('itamAgentRuns', (collection) => {
      collection.dropField('planId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('itamAgentRuns', (collection) => {
      collection.string('planId', { length: 64 }).nullable();
    });
  },
});

export default migration;
