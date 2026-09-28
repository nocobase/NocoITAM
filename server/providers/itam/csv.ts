/**
 * RFC 4180 CSV parsing and writing, small enough to own: quoted fields,
 * doubled quotes, embedded newlines, CRLF, an optional BOM.
 */
export interface CsvTable {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

export function parseCsv(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter(
    (row) => row.length > 1 || (row[0] ?? '').trim() !== '',
  );
  const columns = (header ?? []).map((column) => column.trim());
  return {
    columns,
    rows: body.map((row) =>
      Object.fromEntries(
        columns.map((column, i) => [column, (row[i] ?? '').trim()]),
      ),
    ),
  };
}

export function toCsv(
  columns: readonly string[],
  rows: readonly Readonly<Record<string, unknown>>[],
): string {
  const escape = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ''
        : typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map(escape).join(',')];
  for (const row of rows)
    lines.push(columns.map((column) => escape(row[column])).join(','));
  return `\uFEFF${lines.join('\n')}\n`;
}
