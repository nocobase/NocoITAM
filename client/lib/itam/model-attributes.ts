/**
 * Extended-field values as records keep them (`attributes`), and the two
 * layers a device or a stock item reads (2026-10-06): its own, then its
 * model's for a field the category keeps on the model.
 */
export function attributesOf(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    // Rows written before JSON fields were encoded by the query layer.
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/** No value: nothing stated, so a field kept on the model reads the model. */
export const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

/**
 * What a record shows for each field: its own value where it states one,
 * else its model's for the keys the category keeps on the model.
 */
export function effectiveAttributes(
  own: unknown,
  model: unknown,
  modelKeys: readonly string[],
): Record<string, unknown> {
  const result = attributesOf(own);
  const shared = attributesOf(model);
  for (const key of modelKeys)
    if (isBlank(result[key]) && !isBlank(shared[key]))
      result[key] = shared[key];
  return result;
}
