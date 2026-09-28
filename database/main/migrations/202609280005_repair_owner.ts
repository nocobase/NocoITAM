import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A repair order names who is responsible for it.
 *
 * It was the one process record with nobody accountable: a purchase order
 * names a requester and an approver, a disposal a requester and an executor,
 * an audit task its executors — a repair named only its creator. Since the
 * creator is stamped once and never changes, and IT support could finish
 * only the repairs it had raised, a repair could not be handed over: when
 * the person who filed it was away, nobody at their level could close it.
 *
 * `ownerId` is that person, starting at whoever files the repair and
 * editable afterwards, and finishing the repair belongs to them. Existing
 * rows take their creator, which is who could finish them until now.
 */
interface KnexClient {
  raw(sql: string): Promise<unknown>;
}

const migration: MigrationDefinition = defineMigration({
  name: '202609280005_repair_owner',

  async up({ builder, connection }) {
    await builder.alterCollection('repairs', (table) => {
      table.string('ownerId', { length: 64 }).nullable();
    });
    // Column to column, which the query builder's typed `set` does not
    // express; both hold a user id as plain text.
    const client = await connection.client<KnexClient>();
    await client.raw('update repairs set owner_id = created_by_id');
  },

  async down({ builder }) {
    await builder.alterCollection('repairs', (table) => {
      table.dropField('ownerId');
    });
  },
});

export default migration;
