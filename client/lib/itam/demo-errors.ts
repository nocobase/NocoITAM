import { ApiClientError } from '@nocobase/app-client';

/** Demo Mode owns the refusal toast; editors only discard their unsaved draft. */
export function isDemoReadOnlyError(error: unknown): boolean {
  // Record pages wrap API errors with a translated message and preserve cause.
  const seen = new Set<unknown>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    if (error instanceof ApiClientError) {
      const payload = error.payload;
      const body =
        payload && typeof payload === 'object' && 'error' in payload
          ? payload.error
          : payload;
      if (
        body &&
        typeof body === 'object' &&
        'reason' in body &&
        body.reason === 'DEMO_READ_ONLY'
      )
        return true;
    }
    error = error.cause;
  }
  return false;
}
