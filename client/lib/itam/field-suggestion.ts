import { TEMPLATE_TYPES, type TemplateField } from './field-template.js';

/** A change 完善 proposes to a field the category has, and why. */
export interface FieldChange {
  readonly key: string;
  readonly label?: string;
  readonly type?: string;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly reason?: string;
}

/** The fields after a suggestion, and which were added or changed. */
export interface SuggestedFields {
  readonly fields: TemplateField[];
  readonly added: Set<string>;
  /** By key: what the field was, and why it changed. */
  readonly changed: Map<string, string>;
}

/**
 * 完善's fields (2026-10-20): each change applied to the field of its key, in
 * place (the key never changes), then the new fields whose keys the
 * category does not have yet. `note` words what a changed field was.
 */
export function applyFieldSuggestion(
  current: readonly TemplateField[],
  fields: readonly TemplateField[],
  changes: readonly FieldChange[],
  note: (before: TemplateField, reason: string) => string,
): SuggestedFields {
  const byKey = new Map(changes.map((change) => [change.key, change]));
  const changed = new Map<string, string>();
  const kept = current.map((field) => {
    const change = byKey.get(field.key);
    if (!change) return field;
    const type = TEMPLATE_TYPES.find((value) => value === change.type);
    const next: TemplateField = {
      ...field,
      ...(change.label ? { label: change.label } : {}),
      ...(type ? { type } : {}),
      ...(change.required === undefined ? {} : { required: change.required }),
      ...(change.options?.length ? { options: [...change.options] } : {}),
    };
    if (JSON.stringify(next) === JSON.stringify(field)) return field;
    changed.set(field.key, note(field, change.reason ?? ''));
    return next;
  });
  const taken = new Set(current.map((field) => field.key));
  const fresh = fields
    .filter((field) => !taken.has(field.key))
    .map((field) => ({ ...field, required: false }));
  return {
    fields: [...kept, ...fresh],
    added: new Set(fresh.map((field) => field.key)),
    changed,
  };
}
