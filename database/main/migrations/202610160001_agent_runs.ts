import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The work agents' runs (2026-10-16, plan "Work agents", after NocoCRM's
 * background follow-ups): one row each time an agent works on a record
 * without being asked in a conversation — the first, 审批审阅, reviewing an
 * approval request for its approver.
 *
 * A run names what started it (`trigger`, and `startedById` when a person
 * asked; null when a switch an administrator turned on did), the record it
 * is about (`subjectType` / `subjectId`, with `refId` for the row it works
 * from — the approval), and who decides on it (`deciderId`). It is written
 * running, then waits (`pending`) with its structured result, or fails
 * with a reason code (`failure`) the decider sees in its place. A person
 * accepts or dismisses it; a newer run, or the record decided elsewhere,
 * supersedes it. A redo with the decider's own words names the run it
 * replaces (`revisesId`) and keeps the words (`instruction`).
 *
 * A table of its own rather than columns on `historyEvents`, so the agent
 * work page's counts and lists are plain queries and the history stays a
 * record of what happened.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610160001_agent_runs',

  async up({ builder }) {
    await builder.createCollection('itamAgentRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('agent', { length: 32 }).notNull();
      collection.string('trigger', { length: 32 }).notNull();
      collection.string('startedById', { length: 64 }).nullable();
      collection.string('subjectType', { length: 64 }).notNull();
      collection.string('subjectId', { length: 64 }).notNull();
      collection.string('refId', { length: 64 }).nullable();
      collection.string('deciderId', { length: 64 }).nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.json('result').nullable();
      collection.string('failure', { length: 64 }).nullable();
      collection.string('revisesId', { length: 64 }).nullable();
      collection.text('instruction').nullable();
      collection.string('decision', { length: 32 }).nullable();
      collection.text('comment').nullable();
      collection.string('decidedById', { length: 64 }).nullable();
      collection.datetime('decidedAt').nullable();
      collection.string('model', { length: 255 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.datetime('startedAt').nullable();
      collection.datetime('finishedAt').nullable();
      collection.primary('id', { name: 'pk_itam_agent_runs' });
      collection.index(['subjectType', 'subjectId'], {
        name: 'idx_itam_agent_runs_subject',
      });
      collection.index(['deciderId', 'status'], {
        name: 'idx_itam_agent_runs_decider',
      });
      collection.index(['agent', 'createdAt'], {
        name: 'idx_itam_agent_runs_agent',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('itamAgentRuns');
  },
});

export default migration;
