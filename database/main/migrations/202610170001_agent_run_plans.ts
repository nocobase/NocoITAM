import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The plan a work agent's suggestion became (2026-10-17, plan "Work
 * agents", step 2). 离职回收 and 授权续费 only suggest: accepting a card
 * turns the changes the person kept into an ordinary plan (`itamPlans`),
 * proposed and carried out as that person, and the run names it here, so the
 * card can show what was done and what was refused. A run that changes
 * nothing itself (审批审阅's) has none.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610170001_agent_run_plans',

  async up({ builder }) {
    await builder.alterCollection('itamAgentRuns', (collection) => {
      collection.string('planId', { length: 64 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('itamAgentRuns', (collection) => {
      collection.dropField('planId');
    });
  },
});

export default migration;
