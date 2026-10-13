import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Plans: the changes the assistant proposes, which the person it works for
 * carries out or declines on a card in the conversation (the Agents plugin,
 * template 1.0.0-beta.64, after NocoCRM's). An agent's run changes nothing
 * itself; it writes one plan of steps, each one of the operations the pages
 * perform, and the person confirms it.
 *
 * A plan names who it was proposed to (`proposerUserId`, the person the run
 * worked for, who alone decides it), the agent and run that proposed it and
 * the conversation its outcome goes back to. Each step keeps its operation
 * and parameters, what the rehearsal found it would do (`check`), and once
 * carried out its result or why it failed.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610120001_itam_plans',

  async up({ builder }) {
    await builder.createCollection('itamPlans', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('summary').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.integer('revision').notNull();
      collection.string('proposerUserId', { length: 64 }).notNull();
      collection.string('agentId', { length: 64 }).nullable();
      collection.string('agentName', { length: 255 }).nullable();
      collection.string('runId', { length: 64 }).nullable();
      collection.string('conversationId', { length: 64 }).nullable();
      collection.string('deciderUserId', { length: 64 }).nullable();
      collection.datetime('decidedAt').nullable();
      collection.json('failure').nullable();
      collection.datetime('expiresAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_itam_plans' });
      collection.index('proposerUserId', { name: 'idx_itam_plans_proposer' });
      collection.index('conversationId', {
        name: 'idx_itam_plans_conversation',
      });
    });
    await builder.createCollection('itamPlanSteps', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('planId', { length: 64 }).notNull();
      collection.integer('position').notNull();
      collection.string('op', { length: 64 }).notNull();
      collection.string('ref', { length: 64 }).nullable();
      collection.json('params').notNull();
      collection.json('check').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.json('result').nullable();
      collection.primary('id', { name: 'pk_itam_plan_steps' });
      collection.index('planId', { name: 'idx_itam_plan_steps_plan' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itamPlanSteps');
    await builder.dropCollection('itamPlans');
  },
});

export default migration;
