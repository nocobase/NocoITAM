import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A repair's quote (2026-10-23): what the vendor asks to do the work, when,
 * and what the work is; whether Asset Steward advised repairing or
 * replacing the device at that price, and why; and what the person then
 * decided. The quote arrives while the device is away, before the repair
 * is completed, which is when 修还是换 is decided. Existing repairs have
 * none.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610270004_repair_quotes',

  async up({ builder }) {
    await builder.alterCollection('repairs', (table) => {
      table.decimal('quoteAmount', { precision: 18, scale: 2 }).nullable();
      table.text('quoteNotes').nullable();
      table.date('quotedAt').nullable();
      table.string('quoteRecommendation', { length: 16 }).nullable();
      table.text('quoteReasons').nullable();
      table.string('quoteDecision', { length: 16 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('repairs', (table) => {
      table.dropField('quoteDecision');
      table.dropField('quoteReasons');
      table.dropField('quoteRecommendation');
      table.dropField('quotedAt');
      table.dropField('quoteNotes');
      table.dropField('quoteAmount');
    });
  },
});

export default migration;
