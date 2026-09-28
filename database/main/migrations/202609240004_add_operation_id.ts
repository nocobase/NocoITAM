import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Ties a record's history events to the field changes of the same operation.
 *
 * Assigning a device writes one event ("assigned to 李娜") and three change
 * rows (assignee, date, status). Nothing connected them, so the timeline and
 * the change log told the same moment twice with no way to fold one into the
 * other. Every writer in one request now stamps the same `operationId`, and
 * the timeline groups by it.
 *
 * Nullable on purpose: rows written before this, and writers that carry no
 * operation context, keep standing on their own.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240004_add_operation_id',
  async up({ builder }) {
    await builder.alterCollection('historyEvents', (collection) => {
      collection.string('operationId', { length: 64, nullable: true });
    });
    await builder.alterCollection('changeLogs', (collection) => {
      collection.string('operationId', { length: 64, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('historyEvents', (collection) => {
      collection.dropField('operationId');
    });
    await builder.alterCollection('changeLogs', (collection) => {
      collection.dropField('operationId');
    });
  },
});

export default migration;
