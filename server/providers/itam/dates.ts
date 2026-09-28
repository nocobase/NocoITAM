/** Calendar arithmetic on ISO dates (YYYY-MM-DD), shared by the services. */

/**
 * `date` as a calendar date in the server's time zone. A calendar date is a
 * local fact — a receipt signed just after midnight in Shanghai happened
 * today, not on the UTC date still running eight hours behind — so every
 * `YYYY-MM-DD` this application stores or compares is formatted here rather
 * than through `toISOString()`, which would write yesterday until 08:00.
 */
export function isoDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Today's calendar date in the server's time zone. */
export function today(): string {
  return isoDate(new Date());
}

/** `date` plus `days` calendar days, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** `date` plus `months` calendar months, clamped by JavaScript's Date. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + months, day ?? 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * A datetime as the database stores it. Since template beta.43 the sqlite
 * driver keeps `datetime` columns as text (local time, no zone) instead of
 * epoch milliseconds, and a `Date` bound into a comparison no longer matches
 * anything — silently, with no error. Every comparison against a datetime
 * column goes through this so the bound value has the stored shape.
 */
export function dbDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 23);
}
