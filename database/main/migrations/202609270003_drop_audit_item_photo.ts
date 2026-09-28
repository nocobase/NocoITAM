import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Audit items lose their photo (decided 2026-09-27). The count endpoint
 * accepted a file id, but no page ever uploaded a picture or showed one, so
 * the column only ever held null. Should counting on site need evidence
 * later, it belongs in the task's attachments or a real upload on the item,
 * decided anew. Rolling back restores an empty column.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609270003_drop_audit_item_photo',

  async up({ builder }) {
    await builder.alterCollection('auditItems', (collection) => {
      collection.dropField('photoFileId');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('auditItems', (collection) => {
      collection.string('photoFileId', { length: 64 }).nullable();
    });
  },
});

export default migration;
