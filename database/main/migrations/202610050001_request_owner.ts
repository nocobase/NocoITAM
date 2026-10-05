import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A purchase order and a disposal name their 负责人 rather than a 申请人.
 *
 * Employees no longer sign in (2026-10-05): the application is IT's own
 * register, so a request is always filed and followed by somebody in IT, and
 * whoever it is for is written in its description. The field kept its
 * meaning — the person the request belongs to, who edits, submits and
 * withdraws it and may hand it over — and takes the name every other record
 * gives that person, the way a repair's `ownerId` does.
 *
 * The collection builder cannot rename a field, so the column is added,
 * copied and the old one dropped; the purchase order's index goes first,
 * since SQLite refuses to drop an indexed column. The field changes already
 * recorded on either document move to the new key, so the timeline keeps
 * labelling them. Rolling back reverses each step; it cannot tell those
 * from the changes to the `ownerId` both documents had before they dropped
 * it in September, so those move to `requesterId` with them.
 */
interface SchemaClient {
  raw(sql: string): Promise<unknown>;
  schema: {
    alterTable(
      table: string,
      callback: (table: {
        dropIndex(columns: string[], name: string): void;
        index(columns: string[], name: string): void;
      }) => void,
    ): Promise<unknown>;
  };
}

const TABLES = [
  { collection: 'purchaseOrders', table: 'purchase_orders' },
  { collection: 'disposals', table: 'disposals' },
] as const;

const migration: MigrationDefinition = defineMigration({
  name: '202610050001_request_owner',

  async up({ builder, query, connection }) {
    const client = await connection.client<SchemaClient>();
    for (const { collection, table } of TABLES) {
      await builder.alterCollection(collection, (fields) => {
        fields.string('ownerId', { length: 64 }).nullable();
      });
      // Column to column, which the query builder's typed `set` does not
      // express; both hold a user id as plain text.
      await client.raw(`update ${table} set owner_id = requester_id`);
    }
    await client.schema.alterTable('purchase_orders', (table) => {
      table.dropIndex(['requester_id'], 'idx_purchase_orders_requester');
      table.index(['owner_id'], 'idx_purchase_orders_owner');
    });
    for (const { collection } of TABLES)
      await builder.alterCollection(collection, (fields) => {
        fields.dropField('requesterId');
      });
    await query
      .updateTable('changeLogs')
      .set({ field: 'ownerId' })
      .where('subjectType', 'in', ['purchaseOrders', 'disposals'])
      .where('field', '=', 'requesterId')
      .execute();
  },

  async down({ builder, query, connection }) {
    const client = await connection.client<SchemaClient>();
    for (const { collection, table } of TABLES) {
      await builder.alterCollection(collection, (fields) => {
        fields.string('requesterId', { length: 64 }).nullable();
      });
      await client.raw(`update ${table} set requester_id = owner_id`);
    }
    await client.schema.alterTable('purchase_orders', (table) => {
      table.dropIndex(['owner_id'], 'idx_purchase_orders_owner');
      table.index(['requester_id'], 'idx_purchase_orders_requester');
    });
    for (const { collection } of TABLES)
      await builder.alterCollection(collection, (fields) => {
        fields.dropField('ownerId');
      });
    await query
      .updateTable('changeLogs')
      .set({ field: 'requesterId' })
      .where('subjectType', 'in', ['purchaseOrders', 'disposals'])
      .where('field', '=', 'ownerId')
      .execute();
  },
});

export default migration;
