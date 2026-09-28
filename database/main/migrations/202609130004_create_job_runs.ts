import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// One row per scheduled or manual maintenance run, so the workbench can show
// when the rule layer last computed and replicas can see a run in flight.
const migration: MigrationDefinition = defineMigration({
  name: '202609130004_create_job_runs',

  async up({ builder }) {
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

  async down({ builder }) {
    await builder.dropCollection('jobRuns');
  },
});

export default migration;
