import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * One kind of difference, and a counted holder that may be anywhere.
 *
 * A device can be in the wrong place, with the wrong holder and in the
 * wrong status at the same time, but a count could only name one of the
 * three (`locationMismatch` / `assigneeMismatch` / `statusMismatch`) and
 * resolving it corrected that one alone, leaving the rest wrong on a closed
 * audit. The three become one `mismatch`, and the item's own actual
 * location, holder and status say what differs; the three matching
 * resolutions become `updateToActual`, which writes back everything the
 * count recorded (2026-09-27).
 *
 * The counted holder also gains its kind, the way the booked one has always
 * had it: a device found in a storeroom or installed in another device is
 * as ordinary as one found with a person, and `actual_assignee_id` alone
 * could only mean a person.
 *
 * `down` puts nothing back: which of the three a count had named is not
 * recoverable once they read as one difference.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609270004_merge_audit_differences',

  async up({ query, builder, connection }) {
    const client = await connection.client<{
      schema: {
        hasTable(table: string): Promise<boolean>;
        hasColumn(table: string, column: string): Promise<boolean>;
      };
    }>();
    if (!(await client.schema.hasTable('audit_items'))) return;
    if (!(await client.schema.hasColumn('audit_items', 'actual_assignee_type')))
      await builder.alterCollection('auditItems', (collection) => {
        collection.string('actualAssigneeType', { length: 16, nullable: true });
      });
    // A counted holder written before this migration is a person.
    await query
      .updateTable('auditItems')
      .set({ actualAssigneeType: 'person' })
      .where('actualAssigneeId', 'is not', null)
      .execute();
    await query
      .updateTable('auditItems')
      .set({ result: 'mismatch' })
      .where('result', 'in', [
        'locationMismatch',
        'assigneeMismatch',
        'statusMismatch',
      ])
      .execute();
    await query
      .updateTable('auditItems')
      .set({ resolution: 'updateToActual' })
      .where('resolution', 'in', [
        'updateLocation',
        'updateAssignee',
        'updateStatus',
      ])
      .execute();
  },

  async down({ builder, connection }) {
    const client = await connection.client<{
      schema: { hasColumn(table: string, column: string): Promise<boolean> };
    }>();
    if (await client.schema.hasColumn('audit_items', 'actual_assignee_type'))
      await builder.alterCollection('auditItems', (collection) => {
        collection.dropField('actualAssigneeType');
      });
    // The merged results and resolutions stay; see the note above.
  },
});

export default migration;
