import type { ItamSettings } from './api.js';

/**
 * Field metadata that drives the generic list, form and detail components.
 * Labels and option labels are translation keys resolved by the component.
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'reference'
  | 'money'
  /** A standalone ISO currency code, chosen from `CURRENCIES`. */
  | 'currency'
  /** Stored as a fraction (0.05), shown and edited as a percentage (5). */
  | 'percent'
  /** A web address: shown as a link that breaks anywhere, edited as text. */
  | 'url';

export interface FieldOption {
  readonly value: string;
  /** Translation key. */
  readonly label: string;
}

export interface ReferenceTarget {
  /** Master-data collection the value points at. */
  readonly collection: string;
  readonly labelField?: string;
  /** Extra list filter applied when searching options. */
  readonly filter?: Readonly<Record<string, string>>;
  /** Translation key shown under the options when `filter` hides some. */
  readonly filterHint?: string;
  /**
   * Users only: show each as its sign-in — the username beside the name in
   * the picker, and on the page whether the account is enabled.
   */
  readonly account?: boolean;
}

/** The follow-up choice of a cascading field; see `dependent` below. */
export interface DependentField {
  readonly key: string;
  readonly label: string;
  readonly options: readonly { value: string; label: string }[];
  readonly required?: boolean;
  /** Which answers of the field above call for this one. */
  readonly when: (value: unknown) => boolean;
}

export interface FieldDefinition {
  readonly key: string;
  /** Translation key for the label. */
  readonly label: string;
  /**
   * A label that depends on the record (a subscription's price reads per
   * seat or per cycle); `undefined` keeps `label`. Lists and history keep
   * `label`, since they show many records at once.
   */
  readonly labelWhen?: (
    values: Readonly<Record<string, unknown>>,
  ) => string | undefined;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly requiredWhen?: (
    values: Readonly<Record<string, unknown>>,
  ) => boolean;
  readonly referenceFilter?: (
    values: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, string>>;
  /** Dependent choices become invalid when this field changes. */
  readonly clearOnChange?: readonly string[];
  /** False when a detail summary already displays this field. */
  readonly detail?: boolean;
  /**
   * The value is never read back, only replaced: a product key reads as a
   * mask, so the inline editor starts empty and an empty draft leaves the
   * stored value alone rather than writing the mask over it.
   */
  readonly writeOnly?: boolean;
  /** Ordering within its detail information group; default 0. */
  readonly detailOrder?: number;
  readonly options?: readonly FieldOption[];
  readonly reference?: ReferenceTarget;
  /** Shown as a list column. */
  readonly column?: boolean;
  /**
   * The list column this one follows, where the list's order differs from
   * the detail's (which follows the fields' order).
   */
  readonly columnAfter?: string;
  /** Editable in the create / edit form. Defaults to true. */
  readonly form?: boolean;
  /**
   * Offered as a list filter where the list derives its filters from its
   * fields (`filterableFields`). Defaults to true for a select or a
   * reference; false keeps one out.
   */
  readonly filterable?: boolean;
  /** Group heading (translation key) on the detail page. */
  readonly group?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /**
   * A money field edited together with its currency: the value is then
   * `{ amount, currency }` and `currencyField` names the record's currency
   * field the second half is saved to.
   */
  readonly currencyField?: string;
  /**
   * A reference that may be answered with free text instead: the value is
   * then `{ vendorId, name }` and `alternateField` names the record's text
   * field the second half is saved to. One answer of one kind — picking a
   * record clears the text and vice versa.
   */
  readonly alternateField?: string;
  /**
   * A second choice this answer calls for (数据清除 已清除 → 清除方式):
   * the two are one cascading control and one save, so an answer is never
   * left half given. The value is then `{ value, dependent }`, and
   * `when` says which answers ask for it.
   */
  readonly dependent?: DependentField;
  readonly placeholder?: string;
  /**
   * A setting the placeholder names (2026-10-23): passed to it as `value`,
   * so 留空 says what it falls back to rather than only where.
   */
  readonly placeholderSetting?: keyof ItamSettings['thresholds'];
  /** Booleans edit with a switch by default; `select` shows a yes / no list. */
  readonly control?: 'select';
  /** Value a create form starts with. */
  readonly defaultValue?: unknown;
  /** Shown only while the record's other values satisfy this. */
  readonly visibleWhen?: (values: Readonly<Record<string, unknown>>) => boolean;
  /** Shown but not editable for these values (a rule the record inherits). */
  readonly readonlyWhen?: (
    values: Readonly<Record<string, unknown>>,
  ) => boolean;
  /** Translation key explaining why the field is read-only when it is. */
  readonly readonlyHint?: string;
  /**
   * A note under the field in a form, as a translation key, while the
   * values call for one (2026-10-22): what the value entered will mean.
   */
  readonly noteWhen?: (
    values: Readonly<Record<string, unknown>>,
  ) => string | undefined;
  /**
   * Takes the whole row of a two-column form, as a long text does
   * (2026-10-20): a new repair's device, as wide as its fault.
   */
  readonly wide?: boolean;
  /**
   * A person's position: chosen from the positions of the department in
   * this field of the same record (2026-10-06); `department` is that
   * department, resolved against the values.
   */
  readonly positionOf?: string;
  readonly department?: string | null;
}

/** Resolve dependent form constraints against the current record. */
export function resolveFormField(
  field: FieldDefinition,
  values: Readonly<Record<string, unknown>>,
): FieldDefinition {
  return {
    ...field,
    label: field.labelWhen?.(values) ?? field.label,
    required: field.requiredWhen ? field.requiredWhen(values) : field.required,
    reference:
      field.reference && field.referenceFilter
        ? { ...field.reference, filter: field.referenceFilter(values) }
        : field.reference,
    ...(field.positionOf
      ? {
          department:
            typeof values[field.positionOf] === 'string'
              ? (values[field.positionOf] as string)
              : null,
        }
      : {}),
  };
}
export function changeFormField(
  field: FieldDefinition,
  value: unknown,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...values,
    ...Object.fromEntries(
      (field.clearOnChange ?? []).map((key) => [key, null]),
    ),
    [field.key]: value,
  };
}

/** Fields that only matter under straight-line depreciation. */
export const whenStraightLine = (
  values: Readonly<Record<string, unknown>>,
): boolean => values.depreciationMethod === 'straightLine';

/**
 * The login user responsible for the record. Every business record has one
 * (it defaults to the creator and drives "records I own" access). A detail
 * page shows it as the first row of 基本信息, whatever its group, and hands
 * it over there (2026-10-05); it is never asked for on creation.
 */
export const OWNER_FIELD: FieldDefinition = {
  key: 'ownerId',
  label: 'fields.owner',
  type: 'reference',
  required: true,
  reference: { collection: 'users' },
  group: 'groups.system',
  detailOrder: -1,
};

export const AUDIT_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'createdById',
    label: 'fields.createdBy',
    type: 'reference',
    reference: { collection: 'users' },
    form: false,
    group: 'groups.system',
  },
  {
    key: 'createdAt',
    label: 'fields.createdAt',
    type: 'date',
    form: false,
    group: 'groups.system',
    // Leaves a place between 创建人 and 创建时间 for a record's own
    // dates — a device's 最近盘点时间 sits there.
    detailOrder: 2,
  },
  {
    key: 'updatedAt',
    label: 'fields.updatedAt',
    type: 'date',
    form: false,
    column: true,
    group: 'groups.system',
    detailOrder: 3,
  },
];

/** The fields a list can filter by: enumerations and references. */
export function filterableFields(
  fields: readonly FieldDefinition[],
): readonly FieldDefinition[] {
  return fields.filter(
    (field) =>
      field.column &&
      field.form !== false &&
      field.filterable !== false &&
      (field.type === 'select' ||
        field.type === 'multiselect' ||
        (field.type === 'reference' && field.key !== 'parentId')),
  );
}

/** The perpetual / subscription choice, which reads as its own badge. */
export function isEntitlementKindField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.entitlementKind.'),
    ) ?? false
  );
}

/** A purchase order's status, which reads in its own tone per state. */
export function isPurchaseOrderStatusField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.poStatus.'),
    ) ?? false
  );
}

/** An entitlement's 合规状态 (2026-10-22), toned by `ComplianceStatusBadge`. */
export function isComplianceStatusField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.complianceStatus.'),
    ) ?? false
  );
}

/** A disposal's status, which reads in its own tone per state. */
/** A person's 在职状态 (2026-10-21), toned by `EmploymentStatusBadge`. */
export function isEmploymentStatusField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.employmentStatus.'),
    ) ?? false
  );
}

export function isRepairResultField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.repairResult.'),
    ) ?? false
  );
}

export function isDisposalStatusField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.disposalStatus.'),
    ) ?? false
  );
}

/** An audit task's status, which reads in its own tone per state. */
export function isAuditStatusField(field: FieldDefinition): boolean {
  return (
    field.options?.every((option) =>
      option.label.startsWith('enums.auditStatus.'),
    ) ?? false
  );
}

export function isAssetTypeField(field: FieldDefinition): boolean {
  return (
    field.options?.some((option) =>
      /^(enums\.(appliesTo|requestAssetType))\./.test(option.label),
    ) ?? false
  );
}
