/** One extended field of a category, as stored in `categories.fieldTemplate`. */
export interface TemplateField {
  readonly key: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  readonly required?: boolean;
  readonly options?: readonly string[];
  /** Kept in the template (its values survive) but not shown on device pages. */
  readonly hidden?: boolean;
  /**
   * `model`: every device of a model shares the value, so it is filled on
   * the model and its devices (and stock items) read it, each free to state
   * its own (2026-10-06). Absent: each record's own.
   */
  readonly scope?: 'model' | 'device';
}

export const TEMPLATE_TYPES: readonly TemplateField['type'][] = [
  'text',
  'number',
  'date',
  'select',
  'boolean',
];

export function parseTemplate(value: unknown): TemplateField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const field = entry as Partial<TemplateField>;
    if (typeof field.key !== 'string' || typeof field.label !== 'string')
      return [];
    return [
      {
        key: field.key,
        label: field.label,
        type: TEMPLATE_TYPES.includes(field.type as TemplateField['type'])
          ? (field.type as TemplateField['type'])
          : 'text',
        required: Boolean(field.required),
        options: Array.isArray(field.options)
          ? field.options.map(String)
          : undefined,
        ...(field.hidden ? { hidden: true } : {}),
        ...(field.scope === 'model' ? { scope: 'model' as const } : {}),
      },
    ];
  });
}

/** The template a record reads, parsed; anything malformed is left out. */
export const templateOf = (value: unknown): TemplateField[] =>
  parseTemplate(value);

/** The fields a category keeps on the model, which its devices read. */
export const modelFieldsOf = (value: unknown): TemplateField[] =>
  parseTemplate(value).filter((field) => field.scope === 'model');
