import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Removes the orphan `imageUrl` field from the `models` collection metadata.
 *
 * The column was never created by any migration in this history — the
 * metadata document kept the field after an early edit replaced it with
 * `imageFileId`. Since beta.43 the authorizer resolves a collection through
 * its metadata before deciding, and a field with no physical column makes
 * that resolution throw, so every `main.models` decision came back
 * `AUTHORIZATION_HANDLER_FAILED` and each master-data read answered 403.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609230002_drop_stale_model_image_url_metadata',
  async up({ query }) {
    const rows = await query
      .selectFrom('__nocobase_collection_metadata')
      .select(['name', 'document'])
      .where('name', '=', 'models')
      .execute<{ name: string; document: string }>();
    for (const row of rows) {
      const document = JSON.parse(row.document) as {
        fields?: Record<string, unknown>;
      };
      if (!document.fields || !('imageUrl' in document.fields)) continue;
      delete document.fields.imageUrl;
      await query
        .updateTable('__nocobase_collection_metadata')
        .set({ document: JSON.stringify(document) })
        .where('name', '=', 'models')
        .execute();
    }
  },
  async down() {
    // Deliberately empty: the reverse would put back a metadata field that
    // describes no column, which is the defect itself. Nothing reads the
    // entry, so leaving it out keeps a rolled-back database working.
  },
});

export default migration;
