import type { FieldDefinition } from './fields.js';

/**
 * A form field as AI 整理 fills it (2026-10-29): the fields the form asks for
 * on creation, read from their definitions, so what the assistant fills is
 * the form itself rather than a list kept beside it. The shared method is
 * the `form-capture` skill; a field's own rule is its `aiHint`.
 */
export interface CaptureField {
  readonly key: string;
  /** The label as the person reads it, for the assistant's note. */
  readonly label: string;
  readonly type: string;
  readonly required?: boolean;
  /** A choice's values and how the person reads them. */
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  /** The register a reference names, which the check matches the name in. */
  readonly reference?: string;
  readonly hint?: string;
}

export function captureFields(
  fields: readonly FieldDefinition[],
  t: (key: string) => string,
): CaptureField[] {
  return fields
    .filter((field) => field.form !== false)
    .map((field) => ({
      key: field.key,
      label: t(field.label),
      type: field.type,
      ...(field.required ? { required: true } : {}),
      ...(field.options
        ? {
            options: field.options.map((option) => ({
              value: option.value,
              label: t(option.label),
            })),
          }
        : {}),
      ...(field.reference ? { reference: field.reference.collection } : {}),
      ...(field.aiHint ? { hint: field.aiHint } : {}),
    }));
}
