// The three areas a set's Permissions drawer shows as tabs, the catalog's
// sections by name (permissions.tsx, area.tsx).
export const AREAS = ['pages', 'business', 'administration'] as const;
export type Area = (typeof AREAS)[number];

export function isArea(value: string | undefined): value is Area {
  return (AREAS as readonly string[]).includes(value ?? '');
}
