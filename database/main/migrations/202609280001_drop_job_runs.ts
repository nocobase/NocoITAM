import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The maintenance jobs run through the scheduler plugin (decided
 * 2026-09-28), which keeps each execution's status and result on its own
 * 定时任务 page, so the application's own run log goes. The history it held
 * is dropped with it; rolling back recreates the table empty.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280001_drop_job_runs',

  async up({ builder }) {
    await builder.dropCollection('jobRuns');
  },

  async down({ builder }) {
    await builder.createCollection('jobRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // daily | monthly | reminders
      collection.string('job', { length: 64 }).notNull();
      // running | completed | failed
      collection.string('status', { length: 16 }).notNull();
      // scheduler | user id
      collection.string('triggeredBy', { length: 64 }).notNull();
      collection.datetime('startedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.json('summary').nullable();
      collection.text('error').nullable();
      collection.primary('id', { name: 'pk_job_runs' });
      collection.index(['job', 'startedAt'], { name: 'idx_job_runs_job' });
    });
  },
});

export default migration;
