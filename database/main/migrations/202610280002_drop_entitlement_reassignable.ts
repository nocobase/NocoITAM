import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops an entitlement's 可重新分配 (2026-10-28).
 *
 * Nothing read it: a seat was reclaimed, reassigned and proposed to a
 * joiner whatever it said, and only a perpetual licence offered it. A
 * licence that stays with one computer is per device; a vendor's limit on
 * how often a seat may move is a note.
 *
 * `down` restores the column as it was created, every row reassignable;
 * what it held is not recoverable.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610280002_drop_entitlement_reassignable',

  async up({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.dropField('reassignable');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('entitlements', (collection) => {
      collection.boolean('reassignable').notNull().defaultTo(true);
    });
  },
});

export default migration;
