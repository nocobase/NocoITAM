import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * The parameters an administrator sets on a record lifecycle of
 * `@nocobase/lifecycle` (2026-10-18), the disposals' approver range first
 * (server/lifecycles/disposals.ts): the tables the library's
 * StoredLifecycleParameters reads and writes, under its default names, which
 * every lifecycle of the application shares — a group's current version
 * (heads), every version saved (versions, with a reviewer rule's selections
 * one row each), the request ids a save was made under (requests), and what
 * a transition ran under (snapshots, usages). Each row is keyed by a hash of
 * what identifies it. Spelled out here, as NocoCRM's are, rather than taken
 * from the library, since a migration stays what it was when it was
 * released.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610180002_lifecycle_parameters',
  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('lifecycleParameterHeads', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('scope').notNull();
      c.string('groupKey').notNull();
      c.string('status').notNull();
      // The current version; a save moves it on only from the one it read.
      c.integer('revision').notNull();
      c.unique(['scope', 'groupKey'], {
        name: 'lifecycle_parameter_heads_group',
      });
    });
    await builder.createCollection('lifecycleParameterVersions', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.json('payload').notNull();
      // How many selections each reviewer rule of the version has.
      c.json('selectionCounts').notNull();
    });
    await builder.createCollection('lifecycleParameterSelections', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('versionId', { length: 64 }).notNull();
      c.string('ruleKey').notNull();
      c.integer('group').notNull();
      c.string('type').notNull();
      c.string('referenceId').notNull();
      c.index(['versionId'], { name: 'lifecycle_parameter_selections_version' });
    });
    await builder.createCollection('lifecycleParameterRequests', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('actorId').notNull();
      c.text('fingerprint').notNull();
      c.integer('revision').notNull();
    });
    await builder.createCollection('lifecycleParameterSnapshots', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.json('payload').notNull();
    });
    await builder.createCollection('lifecycleParameterUsages', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.json('payload').notNull();
      // The scope, lifecycle and record the usage belongs to, hashed.
      c.string('recordKey', { length: 64 }).notNull();
      c.datetimeTz('at').notNull();
      c.index(['recordKey', 'at', 'id'], {
        name: 'lifecycle_parameter_usages_record',
      });
    });
  },
  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('lifecycleParameterUsages');
    await builder.dropCollection('lifecycleParameterSnapshots');
    await builder.dropCollection('lifecycleParameterRequests');
    await builder.dropCollection('lifecycleParameterSelections');
    await builder.dropCollection('lifecycleParameterVersions');
    await builder.dropCollection('lifecycleParameterHeads');
  },
});

export default migration;
