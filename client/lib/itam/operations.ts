import {
  AUDIT_FIELDS,
  OWNER_FIELD,
  type FieldDefinition,
  type FieldOption,
} from './fields.js';

const options = (group: string, values: readonly string[]): FieldOption[] =>
  values.map((value) => ({ value, label: `enums.${group}.${value}` }));

/** Repairs, audit tasks and disposals: paths, enums and fields. */
export const REPAIRS_PATH = 'itam/repairs';
export const AUDITS_PATH = 'itam/audits';
export const DISPOSALS_PATH = 'itam/disposals';

export const REPAIR_METHODS = [
  'vendorWarranty',
  'sendOut',
  'internal',
] as const;
export const REPAIR_RESULTS = [
  'inProgress',
  'repaired',
  'unrepairable',
  'replaced',
] as const;
/** Where the device goes when a repair ends. */
export const REPAIR_DISPOSITIONS = ['return', 'dispose'] as const;
/** The kinds of fault a repair is filed under (2026-10-17). */
export const REPAIR_FAULT_CATEGORIES = [
  'screen',
  'keyboard',
  'battery',
  'power',
  'storage',
  'network',
  'system',
  'peripheral',
  'physical',
  'other',
] as const;

/** 修还是换 on a quote: repair it, replace it, or look first. */
export const REPAIR_RECOMMENDATIONS = ['repair', 'replace', 'inspect'] as const;
/** What was decided on a quote. */
export const REPAIR_QUOTE_DECISIONS = ['repair', 'replace'] as const;

const hasQuote = (values: Readonly<Record<string, unknown>>): boolean =>
  values.quoteAmount !== null && values.quoteAmount !== undefined;

export const REPAIR_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'repairNo',
    label: 'fields.repairNo',
    type: 'text',
    form: false,
    column: true,
  },
  {
    key: 'deviceId',
    label: 'fields.device',
    type: 'reference',
    reference: { collection: 'devices' },
    required: true,
    column: true,
    // Chosen when the repair is created; it never moves to another device.
    readonlyWhen: (values) => Boolean(values.id),
  },
  // Before 维修方式 in the list (2026-10-23); on the detail page it still
  // follows the fault description it sorts.
  {
    key: 'faultCategory',
    label: 'fields.faultCategory',
    type: 'select',
    required: true,
    options: options('faultCategory', REPAIR_FAULT_CATEGORIES),
    column: true,
    detailOrder: 1,
  },
  {
    key: 'method',
    label: 'fields.repairMethod',
    type: 'select',
    required: true,
    options: options('repairMethod', REPAIR_METHODS),
    column: true,
  },
  {
    key: 'vendorId',
    label: 'fields.vendor',
    type: 'reference',
    reference: { collection: 'vendors' },
    // Every repair but an internal one goes to a vendor.
    requiredWhen: (values) =>
      Boolean(values.method) && values.method !== 'internal',
    column: true,
  },
  {
    key: 'faultDescription',
    label: 'fields.faultDescription',
    type: 'textarea',
    required: true,
  },
  // 时间 (2026-10-23): when it went, when it is due and when it came back,
  // a group of their own under 基本信息.
  {
    key: 'sentAt',
    label: 'fields.sentAt',
    type: 'date',
    column: true,
    group: 'groups.dates',
  },
  {
    key: 'expectedReturnAt',
    label: 'fields.expectedReturnAt',
    type: 'date',
    required: true,
    column: true,
    group: 'groups.dates',
  },
  {
    key: 'actualReturnAt',
    label: 'fields.actualReturnAt',
    type: 'date',
    // Set by completing; corrected afterwards.
    column: true,
    readonlyWhen: (values) => values.result === 'inProgress',
    group: 'groups.dates',
  },
  {
    key: 'result',
    label: 'fields.repairResult',
    type: 'select',
    options: options('repairResult', REPAIR_RESULTS),
    // Set by completing. The detail page shows it once, as a tag in the
    // summary, so the information card leaves it out.
    column: true,
    detail: false,
  },
  {
    key: 'cost',
    label: 'fields.cost',
    type: 'money',
    currencyField: 'currency',
    column: true,
    // Entered when completing; the detail page shows it in the summary.
    detail: false,
  },
  {
    key: 'currency',
    label: 'fields.currency',
    type: 'currency',
    detail: false,
  },
  {
    key: 'notes',
    label: 'repairs.resultNotes',
    type: 'textarea',
    readonlyWhen: (values) => values.result === 'inProgress',
    detailOrder: 2,
  },
  // 报价 (2026-10-23): what the vendor asks while the device is away,
  // recorded through 记录报价 with Asset Steward's 修还是换; shown once
  // there is one, never typed here.
  {
    key: 'quoteAmount',
    label: 'fields.quoteAmount',
    type: 'money',
    currencyField: 'currency',
    form: false,
    readonlyWhen: () => true,
    visibleWhen: hasQuote,
    group: 'groups.quote',
  },
  {
    key: 'quotedAt',
    label: 'fields.quotedAt',
    type: 'date',
    form: false,
    readonlyWhen: () => true,
    visibleWhen: hasQuote,
    group: 'groups.quote',
  },
  {
    key: 'quoteNotes',
    label: 'fields.quoteNotes',
    type: 'textarea',
    form: false,
    readonlyWhen: () => true,
    visibleWhen: hasQuote,
    group: 'groups.quote',
  },
  {
    // The advice, its reasons and what was decided, drawn as one block by
    // the repair page (`QuoteAdvice`).
    key: 'quoteRecommendation',
    label: 'fields.quoteRecommendation',
    type: 'select',
    options: options('repairRecommendation', REPAIR_RECOMMENDATIONS),
    form: false,
    readonlyWhen: () => true,
    visibleWhen: hasQuote,
    group: 'groups.quote',
  },
  // Shown inside 修还是换; named here so the change log reads them.
  {
    key: 'quoteReasons',
    label: 'fields.quoteReasons',
    type: 'textarea',
    form: false,
    detail: false,
  },
  {
    key: 'quoteDecision',
    label: 'fields.quoteDecision',
    type: 'select',
    options: options('repairQuoteDecision', REPAIR_QUOTE_DECISIONS),
    form: false,
    detail: false,
  },
  {
    // In 系统 above 创建人, where every other record's 负责人 sits — the two
    // read together: who filed it, and who it now belongs to. Its candidates
    // are its own, though: whoever may finish a repair, which is everybody
    // but an employee, read from the permission sets.
    key: 'ownerId',
    label: 'fields.owner',
    type: 'reference',
    reference: { collection: 'repairOwners' },
    required: true,
    column: true,
    // Fixed once the repair is finished: who saw it through is history. A
    // repair being created has no result yet and is not finished
    // (2026-10-16: the create form had it locked and empty).
    readonlyWhen: (record) =>
      record.id !== undefined && record.result !== 'inProgress',
    group: 'groups.system',
    detailOrder: -1,
  },
  // 系统: who raised it and when, as every other record shows.
  ...AUDIT_FIELDS,
];
/** Creating records the sending side; cost and notes come with completion. */
export const REPAIR_CREATE_FIELDS: readonly string[] = [
  // What is wrong first (2026-10-20): Asset Steward's 看看 reads it, sorts
  // it into a category and says whether to repair or replace — before how
  // and where it is repaired is chosen.
  'faultDescription',
  'faultCategory',
  'sentAt',
  'method',
  'vendorId',
  'expectedReturnAt',
  'ownerId',
];

export const AUDIT_STATUSES = [
  'notStarted',
  'inProgress',
  'pendingDifferences',
  'completed',
  'cancelled',
] as const;
// A device can be in the wrong place, with the wrong holder and in the
// wrong status at once, so a count records one difference and says in what.
export const AUDIT_RESULTS = [
  'notCounted',
  'matched',
  'mismatch',
  'notFound',
  'unregistered',
] as const;
export const AUDIT_DIFFERENCES: readonly string[] = [
  'mismatch',
  'notFound',
  'unregistered',
];
export const AUDIT_RESOLUTIONS = [
  'updateToActual',
  'markLost',
  'register',
  'markVerified',
  'unresolved',
] as const;

export const AUDIT_TASK_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'name',
    label: 'fields.name',
    type: 'text',
    required: true,
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'status',
    detail: false,
    label: 'fields.status',
    type: 'select',
    options: options('auditStatus', AUDIT_STATUSES),
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'plannedStart',
    label: 'fields.plannedStart',
    type: 'date',
    required: true,
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'plannedEnd',
    label: 'fields.plannedEnd',
    type: 'date',
    required: true,
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'expectedCount',
    detail: false,
    label: 'fields.expectedCount',
    type: 'number',
    form: false,
    column: true,
    group: 'groups.progress',
  },
  {
    key: 'countedCount',
    detail: false,
    label: 'fields.countedCount',
    type: 'number',
    form: false,
    column: true,
    group: 'groups.progress',
  },
  {
    key: 'differenceCount',
    detail: false,
    label: 'fields.differenceCount',
    type: 'number',
    form: false,
    column: true,
    group: 'groups.progress',
  },
  {
    key: 'startedAt',
    label: 'fields.startedAt',
    type: 'date',
    form: false,
    group: 'groups.progress',
  },
  {
    key: 'completedAt',
    label: 'fields.completedAt',
    type: 'date',
    form: false,
    group: 'groups.progress',
  },
  {
    key: 'notes',
    detailOrder: 10,
    label: 'fields.notes',
    type: 'textarea',
    group: 'groups.basic',
  },
  {
    key: 'cancelReason',
    visibleWhen: (record) =>
      record.status === 'cancelled' || Boolean(record.cancelReason),
    label: 'fields.cancelReason',
    type: 'textarea',
    form: false,
    group: 'groups.progress',
  },
  {
    key: 'executorIds',
    label: 'fields.executors',
    type: 'text',
    form: false,
    group: 'groups.basic',
    detailOrder: -9,
  },
  {
    key: 'scope',
    label: 'fields.scope',
    type: 'text',
    form: false,
    // The items are a snapshot of the scope taken when the task starts.
    readonlyWhen: (record) => record.status !== 'notStarted',
    readonlyHint: 'audits.scopeFixed',
    group: 'groups.basic',
    detailOrder: -8,
  },
  // Who answers for the task, beside the executors who count (2026-10-05):
  // first in 系统, above 创建人, where every record keeps its 负责人. The
  // create dialog asks for it, starting at the reader, and it is anybody's
  // to hand over while the task is open — the page's own rule is only that
  // it is not finished or called off. A column too, as a repair's is.
  { ...OWNER_FIELD, column: true },
  ...AUDIT_FIELDS,
];

export interface AuditScope {
  readonly locationIds?: readonly string[];
  readonly departmentIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly deviceIds?: readonly string[];
}

export const DISPOSAL_METHODS = [
  'scrap',
  'sale',
  'donation',
  'returnToLessor',
  'lossWriteOff',
  'other',
] as const;

/**
 * The methods a disposal may name no recipient for (2026-10-20): a lost
 * device goes to nobody, and 其他 may not either. The service's
 * `RECIPIENT_OPTIONAL` must agree.
 */
export const RECIPIENT_OPTIONAL: readonly string[] = ['lossWriteOff', 'other'];
export const DISPOSAL_REASONS = [
  'endOfLife',
  'damaged',
  'uneconomicalRepair',
  'insufficientPerformance',
  'lost',
  'leaseEnded',
  'other',
] as const;
/** An approved disposal states what was approved, so its request is fixed. */
const approvedDisposal = (values: Readonly<Record<string, unknown>>): boolean =>
  values.status === 'approved';

export const DISPOSAL_STATUSES = [
  'draft',
  'pendingApproval',
  'approved',
  'rejected',
  'executed',
] as const;
/**
 * A disposal's status, toned like a purchase order's: grey while it is only
 * written (or taken back), amber while it waits, blue once approved, red
 * when refused, solid when done.
 */
/**
 * An audit task's status, toned like the other requests: ready is the calm
 * tint, counting is informational, open differences want attention, done is
 * solid and a cancelled one fades, as a cancelled purchase order does.
 */
export const AUDIT_STATUS_TONE: Readonly<Record<string, string>> = {
  notStarted: 'bg-primary/10 text-primary',
  inProgress: 'bg-info text-info-foreground',
  pendingDifferences: 'bg-warning text-warning-foreground',
  completed: 'bg-primary text-primary-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};
/** `AUDIT_STATUS_TONE` as a board column's dot; keep the two in step. */
export const AUDIT_STATUS_DOT: Readonly<Record<string, string>> = {
  notStarted: 'bg-primary/40',
  inProgress: 'bg-info-foreground',
  pendingDifferences: 'bg-warning-foreground',
  completed: 'bg-primary',
  cancelled: 'bg-muted-foreground/50',
};
/**
 * A repair's result (2026-10-23): still in progress reads as attention, like
 * the device's 维修中; repaired or replaced is done, solid like 已完成 and
 * 已执行; beyond repair reads as a loss.
 */
export const REPAIR_RESULT_TONE: Readonly<Record<string, string>> = {
  inProgress: 'bg-warning text-warning-foreground',
  repaired: 'bg-primary text-primary-foreground',
  replaced: 'bg-primary text-primary-foreground',
  unrepairable: 'bg-destructive/10 text-destructive',
};
export const DISPOSAL_STATUS_TONE: Readonly<Record<string, string>> = {
  draft: 'bg-muted text-muted-foreground',
  pendingApproval: 'bg-warning text-warning-foreground',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
  executed: 'bg-primary text-primary-foreground',
};
/** `DISPOSAL_STATUS_TONE` as a board column's dot; keep the two in step. */
export const DISPOSAL_STATUS_DOT: Readonly<Record<string, string>> = {
  draft: 'bg-muted-foreground',
  pendingApproval: 'bg-warning-foreground',
  approved: 'bg-primary/40',
  rejected: 'bg-destructive',
  executed: 'bg-primary',
};
export const DATA_WIPE_OPTIONS = ['wiped', 'notWiped', 'notRequired'] as const;
export const WIPE_METHODS = ['format', 'erase', 'physicalDestruction'] as const;

export const DISPOSAL_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'disposalNo',
    label: 'fields.disposalNo',
    type: 'text',
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'method',
    detailOrder: -10,
    label: 'fields.disposalMethod',
    type: 'select',
    required: true,
    options: options('disposalMethod', DISPOSAL_METHODS),
    column: true,
    readonlyWhen: approvedDisposal,
    group: 'groups.basic',
  },
  {
    key: 'reason',
    detailOrder: -9,
    label: 'fields.disposalReason',
    type: 'select',
    required: true,
    options: options('disposalReason', DISPOSAL_REASONS),
    column: true,
    readonlyWhen: approvedDisposal,
    group: 'groups.basic',
  },
  {
    key: 'status',
    detail: false,
    label: 'fields.status',
    type: 'select',
    options: options('disposalStatus', DISPOSAL_STATUSES),
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'description',
    detailOrder: 10,
    // 报废说明 (2026-10-20): why these devices go.
    label: 'disposals.descriptionLabel',
    type: 'textarea',
    // Why it goes, in words (2026-10-20): the record of the decision, and
    // what 报废诊断 and the approval read.
    required: true,
    readonlyWhen: approvedDisposal,
    group: 'groups.basic',
  },
  {
    key: 'deviceCount',
    detail: false,
    label: 'fields.deviceCount',
    type: 'number',
    form: false,
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'bookValueTotal',
    detail: false,
    label: 'fields.bookValueTotal',
    type: 'money',
    form: false,
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'ownerId',
    detailOrder: -10,
    label: 'fields.owner',
    type: 'reference',
    reference: { collection: 'users' },
    // A disposal is always somebody in IT's to follow through; the create
    // dialog starts it at whoever is filing it and will not let it be
    // emptied. Anybody may hand it over while it is open, waiting for a
    // decision included (`handover` on the domain). The detail page puts it
    // first in 基本信息.
    required: true,
    group: 'groups.basic',
  },
  {
    key: 'requestedAt',
    required: true,
    // After 报废方式, 报废原因 and 说明 (2026-10-05): the 申请信息 group went
    // once 负责人 moved to the top of 基本信息, as on a purchase order.
    detailOrder: 20,
    label: 'fields.requestedAt',
    type: 'date',
    readonlyWhen: approvedDisposal,
    group: 'groups.basic',
  },
  {
    key: 'currency',
    // Not a row of its own: every amount on the page reads with it, and
    // the execution asks for it beside the cost.
    detail: false,
    label: 'fields.currency',
    type: 'currency',
    group: 'groups.basic',
  },
  // The execution, in the order it happens: who did it, where the devices
  // went, when, what it brought in or cost, and what became of the data.
  // The recipient and the data-wipe plan are stated with the request and
  // confirmed by the execution; the rest only the execution can know, so
  // they read once it has happened.
  {
    key: 'executedById',
    visibleWhen: (record) => record.status === 'executed',
    label: 'fields.executedBy',
    type: 'reference',
    reference: { collection: 'users' },
    form: false,
    group: 'groups.execution',
  },
  // One recipient, named one way: a vendor on the books, or a name typed in
  // for anyone who is not. Answering one hides the other rather than leaving
  // a record that says two different things.
  {
    key: 'recipientVendorId',
    label: 'fields.recipient',
    type: 'reference',
    reference: { collection: 'vendors' },
    // Or a name typed in for anyone who is not a vendor on the books: one
    // row, one answer, editable either way.
    alternateField: 'recipientName',
    // Stated with the request (2026-10-16): a vendor or a typed name —
    // except where nobody receives them (2026-10-20): a lost device has no
    // recipient, and 其他 may have none.
    requiredWhen: (values) =>
      !(
        typeof values.method === 'string' &&
        RECIPIENT_OPTIONAL.includes(values.method)
      ),
    visibleWhen: (values) => values.method !== 'lossWriteOff',
    // The choice and its select want a row of their own (2026-10-20).
    wide: true,
    group: 'groups.execution',
  },
  {
    key: 'recipientName',
    // The other half of the row above; never a row or an editor of its own.
    detail: false,
    form: false,
    label: 'fields.recipientName',
    type: 'text',
    group: 'groups.execution',
  },
  {
    key: 'disposedAt',
    visibleWhen: (record) => record.status === 'executed',
    label: 'fields.disposedAt',
    type: 'date',
    form: false,
    column: true,
    group: 'groups.execution',
  },
  {
    key: 'proceeds',
    // Any disposal may bring something in — scrap metal has a price too.
    visibleWhen: (record) => record.status === 'executed',
    label: 'fields.proceeds',
    type: 'money',
    currencyField: 'currency',
    form: false,
    group: 'groups.execution',
  },
  {
    key: 'expenses',
    visibleWhen: (record) => record.status === 'executed',
    label: 'fields.expenses',
    type: 'money',
    currencyField: 'currency',
    form: false,
    group: 'groups.execution',
  },
  {
    key: 'dataWipe',
    label: 'fields.dataWipe',
    type: 'select',
    options: options('dataWipe', DATA_WIPE_OPTIONS),
    // Every disposal answers this one way or another — 已清除 / 未清除 /
    // 无需清除 — so the select offers no empty choice.
    required: true,
    // Something wiped has to say how, so the two are one cascading answer
    // and one save: 已清除 can never be stored without its method.
    dependent: {
      key: 'wipeMethod',
      label: 'fields.wipeMethod',
      options: options('wipeMethod', WIPE_METHODS),
      required: true,
      when: (value) => value === 'wiped',
    },
    group: 'groups.execution',
  },
  {
    key: 'wipeMethod',
    // The other half of the answer above; it reads on its own row and is
    // edited with the answer that calls for it.
    visibleWhen: (record) => record.dataWipe === 'wiped',
    form: false,
    label: 'fields.wipeMethod',
    type: 'select',
    options: options('wipeMethod', WIPE_METHODS),
    group: 'groups.execution',
  },
  ...AUDIT_FIELDS,
];
export const DISPOSAL_CREATE_FIELDS: readonly string[] = [
  // What and why first (2026-10-20): the devices lead the create dialog,
  // and the description reads right under them, then how and the reason.
  'description',
  'method',
  'reason',
  // Who follows it through; left empty, the service files it under
  // whoever is signed in.
  'ownerId',
  'requestedAt',
  // How it will be carried out: where the devices go and what happens to
  // the data on them. The execution confirms these rather than asking again
  // from nothing; who carried it out is the execution's own answer.
  'recipientVendorId',
  'recipientName',
  'dataWipe',
];
