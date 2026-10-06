/**
 * A department's positions (2026-10-06): a JSON list of names, each once
 * whatever its case. Mirrors `master-data.ts` on the server.
 */
export function positionsOf(value: unknown): string[] {
  const list =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;
  return Array.isArray(list) ? list.map(String) : [];
}

export function samePosition(a: unknown, b: unknown): boolean {
  const name = (value: unknown) =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';
  return name(a) === name(b);
}
