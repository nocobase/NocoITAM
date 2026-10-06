import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Extended fields on the model (2026-10-06).
 *
 * A category's template mixes two kinds of fact: what every device of a
 * model shares — a screen size, a resolution, the ports of a switch — and
 * what each one has of its own — a MAC address, an IMEI. Until now both were
 * typed on every device, so twenty monitors meant the same resolution twenty
 * times, or, as it went, none. A template field may now say it belongs to
 * the model (`scope: 'model'`); its value is kept here, and a device or a
 * stock item of the model reads it unless it states its own.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610060004_model_attributes',

  async up({ builder }) {
    await builder.alterCollection('models', (table) => {
      table.json('attributes').nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('models', (table) => {
      table.dropField('attributes');
    });
  },
});

export default migration;
