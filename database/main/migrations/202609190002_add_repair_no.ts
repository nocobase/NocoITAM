import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A repair is a numbered document (RP-000001) with a list page of its own,
 * like a purchase order or a disposal. Existing rows are numbered in the
 * order they were created and the sequence continues after them.
 */
const PREFIX = 'RP-';
const WIDTH = 6;

const migration: MigrationDefinition = defineMigration({
  name: '202609190002_add_repair_no',
  async up({ builder, query }) {
    await builder.alterCollection('repairs', (collection) => {
      collection.string('repairNo', { length: 64 }).nullable();
      collection.unique('repairNo', { name: 'uq_repairs_no' });
    });
    const rows = await query
      .selectFrom('repairs')
      .select('id')
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute<{ id: string }>();
    let value = 1;
    for (const row of rows) {
      await query
        .updateTable('repairs')
        .set({ repairNo: `${PREFIX}${String(value).padStart(WIDTH, '0')}` })
        .where('id', '=', row.id)
        .execute();
      value += 1;
    }
    if (rows.length > 0)
      await query
        .insertInto('numberSequences')
        .values({ key: 'repair', nextValue: value, updatedAt: new Date() })
        .execute();
  },
  async down({ builder, query }) {
    await query
      .deleteFrom('numberSequences')
      .where('key', '=', 'repair')
      .execute();
    // Dropping the column takes its unique index with it.
    await builder.alterCollection('repairs', (collection) => {
      collection.dropField('repairNo');
    });
  },
});

export default migration;
