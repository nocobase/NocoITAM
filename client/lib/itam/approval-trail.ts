import type { ItamRecord } from './api.js';

/**
 * Who a request was last asked of, from its approval trail (newest first):
 * asking again starts from them (2026-10-28).
 */
export function lastApproverOf(
  trail: readonly ItamRecord[] | undefined,
): string | null {
  const ids = trail?.[0]?.approverIds;
  return Array.isArray(ids) && typeof ids[0] === 'string' ? ids[0] : null;
}
