import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Puts every withdrawn disposal back to draft.
 *
 * Taking a request back used to leave the disposal in a status of its own,
 * `withdrawn`, while a purchase order simply returned to `draft`. Two
 * spellings of "nobody is being asked any more" is one too many: the
 * request is a draft again, editable and submittable, and the timeline
 * already says it was withdrawn (2026-09-27). Nothing can produce that
 * status now, and a row left in it would offer neither the draft's actions
 * nor any of its own.
 *
 * `down` puts nothing back: which drafts had been withdrawn is not
 * recoverable from the rows, and the history event that says so stays
 * either way.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609270001_drop_disposal_withdrawn',

  async up({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(table: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('disposals'))) return;
    await query
      .updateTable('disposals')
      .set({ status: 'draft' })
      .where('status', '=', 'withdrawn')
      .execute();
  },

  async down() {
    // Deliberately empty; see the note above.
  },
});

export default migration;
