/**
 * A category's rules and the defaults its new records start with, as the
 * form names them (the rules since 2026-10-20).
 */
export const CATEGORY_DEFAULT_KEYS = [
  'requiresSerial',
  'assignableToPerson',
  'depreciationMethod',
  'usefulLifeMonths',
  'residualRate',
  'warrantyMonths',
  'replacementMonths',
  'auditCycleDays',
] as const;
export type CategoryDefaultKey = (typeof CATEGORY_DEFAULT_KEYS)[number];
export type CategoryDefaults = Partial<
  Record<CategoryDefaultKey, string | number | boolean>
>;

/**
 * What 建议字段 answered for a category's defaults (2026-10-20), kept only
 * where it is a value the category form takes.
 */
export function categoryDefaultsOf(value: unknown): CategoryDefaults {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const key of CATEGORY_DEFAULT_KEYS) {
    const item = raw[key];
    if (key === 'requiresSerial' || key === 'assignableToPerson') {
      if (typeof item === 'boolean') out[key] = item;
      continue;
    }
    if (key === 'depreciationMethod') {
      if (item === 'none' || item === 'straightLine') out[key] = item;
      continue;
    }
    const number = typeof item === 'string' ? Number(item) : item;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0)
      continue;
    if (key === 'residualRate') {
      if (number <= 1) out[key] = number;
    } else out[key] = Math.round(number);
  }
  return out;
}
