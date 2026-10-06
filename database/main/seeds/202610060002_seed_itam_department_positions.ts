import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Each department's positions include what the register already says
 * (2026-10-06): the positions its people hold and its 入职配置 name, added
 * to the list the departments seed starts it with. A person saved later
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
      const stored =
        typeof department.positions === 'string'
          ? (JSON.parse(department.positions) as unknown)
          : department.positions;
      const names: string[] = Array.isArray(stored) ? stored.map(String) : [];
      const before = names.length;
      for (const row of [...kits, ...people]) {
        const name = (row.position ?? '').trim();
        if (
          row.departmentId === department.id &&
          name &&
          !names.some((known) => known.toLowerCase() === name.toLowerCase())
        )
          names.push(name);
      }
      if (names.length === before && Array.isArray(stored)) continue;
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
