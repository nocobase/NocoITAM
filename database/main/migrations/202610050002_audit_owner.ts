import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A stocktake names who is responsible for it, again.
 *
 * It had a 负责人 from the start and lost it on 2026-09-27
 * (`202609270002_drop_audit_owner`), on the reasoning that it was nearly
 * always the creator and nothing on a stocktake is ever handed over. The
 * second half stopped being true with offboarding: a leaver's records are
 * handed over by the field that names them, and a count organised by
 * somebody who has gone needs somebody else to answer for it. The executors
 * are not that person — they come and go while a count runs — and the
 * creator is stamped once and never changes, so a task could not be handed
 * over at all. Every other record names that person as its `ownerId`.
 *
 * It starts at whoever creates the task and is editable while the task is
 * open. Existing rows take their creator, who is what read as the owner in
 * between. A migration is history, so this adds the column back rather than
 * undoing the one that dropped it.
 */
interface KnexClient {
  raw(sql: string): Promise<unknown>;
}

const migration: MigrationDefinition = defineMigration({
  name: '202610050002_audit_owner',

  async up({ builder, connection }) {
    await builder.alterCollection('auditTasks', (table) => {
      table.string('ownerId', { length: 64 }).nullable();
    });
    // Column to column, which the query builder's typed `set` does not
    // express; both hold a user id as plain text.
    const client = await connection.client<KnexClient>();
    await client.raw('update audit_tasks set owner_id = created_by_id');
  },

  async down({ builder }) {
    await builder.alterCollection('auditTasks', (table) => {
      table.dropField('ownerId');
    });
  },
});

export default migration;
