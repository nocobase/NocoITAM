import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Each department's positions, from what the register already says
 * (2026-10-06): the positions its people hold and its 入职配置 name. A
 * department whose list was already written is left alone, and a fresh
 * register has neither people nor positions to list — a person saved later
 * adds theirs (`master-data.ts`).
 */
const seed: SeedDefinition = defineSeed({
  name: '202610060002_seed_itam_department_positions',

  async run({ query }) {
    const departments = await query
      .selectFrom('departments')
      .select(['id', 'positions'])
      .execute<{ id: string; positions: unknown }>();
    const people = await query
      .selectFrom('people')
      .select(['departmentId', 'position'])
      .where('position', 'is not', null)
      .execute<{ departmentId: string | null; position: string | null }>();
    const kits = await query
      .selectFrom('onboardingKits')
      .select(['departmentId', 'position'])
      .where('position', 'is not', null)
      .execute<{ departmentId: string | null; position: string | null }>();
    for (const department of departments) {
      if (department.positions !== null && department.positions !== undefined)
        continue;
      const names: string[] = [];
      for (const row of [...kits, ...people]) {
        const name = (row.position ?? '').trim();
        if (
          row.departmentId === department.id &&
          name &&
          !names.some((known) => known.toLowerCase() === name.toLowerCase())
        )
          names.push(name);
      }
      await query
        .updateTable('departments')
        // The query layer encodes a JSON field itself.
        .set({ positions: names })
        .where('id', '=', department.id)
        .execute();
    }
  },
});

export default seed;
