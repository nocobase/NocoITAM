import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the purchase order line's free-text description.
 *
 * It had two jobs: the name of a service line, and a note under the item.
 * The service line type went earlier today, and nothing in the interface
 * could write the note — only a CSV import, the assistant's document
 * parser and the demo generator, while a reader could neither add nor
 * correct one. A line is what it buys: its model or its software product
 * (decided 2026-09-26).
 *
 * `down` restores an empty column; what it held is not recoverable.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609260004_drop_line_description',

  async up({ builder, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('purchase_order_lines'))) return;
    await builder.alterCollection('purchaseOrderLines', (collection) => {
      collection.dropField('description');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('purchaseOrderLines', (collection) => {
      collection.string('description', { length: 255 }).nullable();
    });
  },
});

export default migration;
