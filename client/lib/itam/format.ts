/** Formatters shared by lists and detail pages so values look the same everywhere. */

/** Renders an unknown value as text without ever producing "[object Object]". */
export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/** Accepts Date, ISO strings and epoch milliseconds (what SQLite hands back). */
export function toDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value)
        : /^\d{11,}(?:\.\d+)?$/.test(text(value))
          ? new Date(Number(value))
          : new Date(text(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDate(value: unknown, withTime = false): string {
  if (!value) return '';
  // A plain calendar date (YYYY-MM-DD) carries no time, whatever the field is called.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const date = toDate(value);
  if (!date) return text(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * How long ago `value` was, as a timeline reads it (NocoCRM's 动态): "just
 * now" under a minute, then minutes, hours and days, and the date itself
 * after a week. The full time goes on hover, through `formatDate`.
 */
export function relativeTime(
  value: unknown,
  language: string,
  justNow: string,
  now: number = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return text(value);
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 60) return justNow;
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 7) return format.format(-days, 'day');
  return formatDate(date);
}

export function formatMoney(value: unknown, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return text(value);
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : text(error);
}

/** How a device is named wherever it is referenced: `编号 / 名称`. */
export function deviceLabel(row: Readonly<Record<string, unknown>>): string {
  const no = text(row.deviceNo);
  const name = text(row.name);
  return no && name ? `${no} / ${name}` : no || name;
}

/** Today's date as `YYYY-MM-DD` in the browser's time zone. */
export function todayIso(): string {
  return localIso(new Date());
}

/** The default return date of a loan: two weeks from today. */
export function defaultLoanReturnDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return localIso(date);
}

/** `date` (YYYY-MM-DD) plus a number of days, as YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return localIso(new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
}

/** `date` (YYYY-MM-DD) plus a number of months, as YYYY-MM-DD. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return localIso(new Date(year ?? 1970, (month ?? 1) - 1 + months, day ?? 1));
}

function localIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `date` (YYYY-MM-DD) to today; negative when ahead. */
export function daysOverdue(date: unknown): number {
  const due = text(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  const [y1, m1, d1] = due.split('-').map(Number);
  const [y2, m2, d2] = todayIso().split('-').map(Number);
  const from = Date.UTC(y1 ?? 1970, (m1 ?? 1) - 1, d1 ?? 1);
  const to = Date.UTC(y2 ?? 1970, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((to - from) / 86_400_000);
}
