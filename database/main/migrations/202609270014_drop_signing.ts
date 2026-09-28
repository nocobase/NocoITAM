import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Signing for an assignment is taken out for now (decided 2026-09-27).
 * Nothing on the employee side asked anyone to sign any more, so the
 * switch only produced "not signed in time" reminders nobody could clear.
 * Gone: `allocations.requiresSignature` / `signedAt`, the `signPending`
 * reminders, the `assignment` settings row (its only key was
 * `requireSignature`) and `thresholds.signTimeoutDays`. History events of
 * type `signed` stay: they record what happened. Rolling back restores the
 * columns (nothing required, nothing signed) and the settings at their
 * seeded values.
 */
interface SettingsRow {
  readonly key: string;
  readonly value: unknown;
}

/** A JSON column arrives decoded, or as the text an older write left. */
const decode = (value: unknown): Record<string, unknown> | null => {
  let parsed = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : null;
};

const migration: MigrationDefinition = defineMigration({
  name: '202609270014_drop_signing',

  async up({ builder, query }) {
    await query
      .deleteFrom('reminders')
      .where('kind', '=', 'signPending')
      .execute();
    await query
      .deleteFrom('itamSettings')
      .where('key', '=', 'assignment')
      .execute();
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<SettingsRow>();
    const thresholds = row ? decode(row.value) : null;
    if (thresholds && 'signTimeoutDays' in thresholds) {
      delete thresholds.signTimeoutDays;
      // Written as an object: the query layer encodes a JSON field itself.
      await query
        .updateTable('itamSettings')
        .set({ value: thresholds })
        .where('key', '=', 'thresholds')
        .execute();
    }
    await builder.alterCollection('allocations', (collection) => {
      collection.dropField('requiresSignature');
      collection.dropField('signedAt');
    });
  },

  async down({ builder, query }) {
    await builder.alterCollection('allocations', (collection) => {
      collection.boolean('requiresSignature').notNull().defaultTo(false);
      collection.datetime('signedAt').nullable();
    });
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<SettingsRow>();
    const thresholds = row ? decode(row.value) : null;
    if (thresholds)
      await query
        .updateTable('itamSettings')
        .set({ value: { ...thresholds, signTimeoutDays: 3 } })
        .where('key', '=', 'thresholds')
        .execute();
    const assignment = await query
      .selectFrom('itamSettings')
      .select('key')
      .where('key', '=', 'assignment')
      .executeTakeFirst();
    if (!assignment)
      await query
        .insertInto('itamSettings')
        .values({
          key: 'assignment',
          value: { requireSignature: true },
          updatedById: null,
          updatedAt: new Date(),
        })
        .execute();
  },
});

export default migration;
