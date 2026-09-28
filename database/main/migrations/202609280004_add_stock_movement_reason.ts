import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A quantity adjustment says why from a fixed list (decided 2026-09-28):
 * 盘盈 / 找回 when it goes up, 丢失 / 损坏 / 报损 / 盘亏 when it goes down,
 * 其他 with a note either way. The code sits on the movement beside its
 * free-text note; other movements leave it empty. Rolling back drops it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280004_add_stock_movement_reason',

  async up({ builder }) {
    await builder.alterCollection('stockMovements', (collection) => {
      collection.string('reason', { length: 32 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('stockMovements', (collection) => {
      collection.dropField('reason');
    });
  },
});

export default migration;
