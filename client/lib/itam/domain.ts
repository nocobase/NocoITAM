import type { ComponentType, ReactNode } from 'react';

import type { ItamRecord } from './api.js';
import type { FieldDefinition } from './fields.js';

export interface DomainTab {
  readonly key: string;
  /** Translation key. */
  readonly label: string;
  /**
   * Hidden for records it does not apply to (a tab one kind of record has).
   * `related` is the domain's `relatedRecord` once loaded — a model's tabs
   * follow its category's kind. A default tab with a condition makes the
   * page wait for the answer before landing, so it never opens a tab the
   * record does not have.
   */
  readonly visible?: (
    record: ItamRecord,
    related: ItamRecord | undefined,
  ) => boolean;
  /** The related list whose row count the tab shows. */
  readonly count?: (record: ItamRecord) => {
    readonly path: string;
    readonly filter: Readonly<Record<string, string>>;
  };
  /**
   * Count from an endpoint that returns rows rather than a paged list, as
   * the purchase orders of a record do: the query key is shared with the
   * tab so the badge and the tab read one request; `distinct` counts the
   * different values of that field instead of the rows. Several requests
   * add up, for a tab that lists more than one kind of record.
   */
  readonly countBy?: (
    record: ItamRecord,
  ) => RowCountRequest | readonly RowCountRequest[];
  /**
   * Count read from the domain's `tabCounts` answer (a master-data record's
   * `/stats`), one request for every tab; undefined leaves the tab bare.
   */
  readonly countOf?: (answer: unknown) => number | undefined;
}

/** A list column that is not a field: a count, a derived badge. */
export interface DomainListColumn {
  readonly key: string;
  /** Translation key. */
  readonly label: string;
  readonly width?: string;
  readonly className?: string;
  /** Placed right after this column, or right before `before`; else last. */
  readonly after?: string;
  readonly before?: string;
  /**
   * The cell. A component rather than a function, so it can read its own
   * query — every row asks the same key, which the query cache answers once.
   */
  readonly Cell: ComponentType<{ readonly row: ItamRecord }>;
}

/** What a domain's tree view is given in place of the table. */
export interface DomainTreeProps {
  readonly expandAll: boolean;
  readonly search: string;
  readonly filter: Readonly<Record<string, string | undefined>>;
  readonly rowActions?: (row: ItamRecord) => ReactNode;
  /**
   * Asks to delete a node, through the list's own confirmation; given only
   * where the reader may delete it. A tree that edits its nodes beside it
   * (the categories page) offers this alone instead of the row menu.
   */
  readonly onDelete?: (row: ItamRecord) => void;
}

/** One list a tab counts; a tab counting several sums them. */
export interface RowCountRequest {
  readonly path: string;
  readonly queryKey: readonly unknown[];
  readonly distinct?: string;
}

export interface DomainConfig {
  readonly name: string;
  /** API path under /api, e.g. `itam/entitlements`. */
  readonly path: string;
  /** Route segment, e.g. `entitlements`. */
  readonly route: string;
  /** Translation key prefix: `${i18n}.title`, `.object`, `.new`, `.edit`, `.empty`. */
  readonly i18n: string;
  readonly fields: readonly FieldDefinition[];
  /** Read-only derived values that need their own rendering or query. */
  readonly fieldDisplay?: (
    field: FieldDefinition,
    record: ItamRecord,
  ) => ReactNode | undefined;
  /**
   * An inline editor for a field the generic input cannot edit (`form:
   * false` because the create dialog renders it itself). A field that gets
   * one is editable on the detail page like any other; `readonlyWhen` and
   * `editable` still apply.
   */
  readonly fieldEditor?: (
    field: FieldDefinition,
    record: ItamRecord,
  ) =>
    | ((value: unknown, onChange: (next: unknown) => void) => ReactNode)
    | undefined;
  /** Keys of the fields the create dialog shows, in order. */
  readonly createFields?: readonly string[];
  /**
   * Keys of reference / select fields offered as dropdowns beside the
   * search box; their values live in the URL like the free text. A field
   * definition stands for a filter the list endpoint answers that is not a
   * field of the record (a model's device type, read from its category).
   */
  readonly filterFields?: readonly (string | FieldDefinition)[];
  /**
   * Values the create dialog fills in after a field changes, e.g. the name
   * and category that follow a chosen model; `record` is the chosen
   * reference record.
   */
  readonly derive?: (
    change: { key: string; value: unknown; record?: ItamRecord },
    values: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown> | undefined;
  /** Fixed values every created record carries (e.g. the stock kind). */
  readonly createDefaults?: Readonly<Record<string, unknown>>;
  /** Fixed list filter (e.g. the stock kind). */
  readonly listFilter?: Readonly<Record<string, string>>;
  readonly nameField: string;
  /**
   * A reference whose name precedes the record's as "Reference / Name" — in
   * the list's name column (which then carries the reference instead of a
   * column of its own) and before the detail title.
   */
  readonly titlePrefixField?: string;
  /** Sort key of the name column when it is not the name (prefix, then name). */
  readonly nameSort?: string;
  /**
   * Records carry a picture (`imageFileId`, `imageCredit`): a thumbnail
   * beside the name in the list, the picture at the head of the detail
   * information card.
   */
  readonly image?: boolean;
  /** Columns beyond the fields' own (counts, derived badges). */
  readonly listColumns?: readonly DomainListColumn[];
  /**
   * List cells read as the detail page does: enumerations as text rather
   * than badges, tree references with their ancestors.
   */
  readonly plainCells?: boolean;
  /**
   * Records that form a tree are shown as one instead of the table, with
   * expand / collapse all in the header; search and filters narrow it.
   */
  readonly Tree?: ComponentType<DomainTreeProps>;
  /**
   * The tree page takes the window's height and its panes scroll on their
   * own, as a board's columns do (the categories page's two panes).
   */
  readonly treeFills?: boolean;
  /**
   * Which columns the export carries: the list's (the default), or every
   * field the reader may read — reference data exported to be imported
   * again, where the list shows only a few.
   */
  readonly exportColumns?: 'list' | 'readable';
  /**
   * The create dialog starts the owner (`ownerId`) at the signed-in user.
   * Default true; false for a collection whose owner is a named
   * responsibility rather than whoever typed the record in.
   */
  readonly ownerFromCreator?: boolean;
  /** Extended fields from the record's category template (default true). */
  readonly extendedFields?: boolean;
  /**
   * The detail group the extended fields follow; default the first. A
   * model's come after its lifecycle, its own facts first (2026-10-20).
   */
  readonly extendedFieldsAfter?: string;
  /**
   * A record this one's tabs depend on, loaded beside it (a model's
   * category decides whether it has devices or stock).
   */
  readonly relatedRecord?: {
    readonly path: string;
    readonly id: (record: ItamRecord) => string | undefined;
  };
  /**
   * One request whose answer counts the tabs (`DomainTab.countOf`). Its
   * query key is the page's to share: anything else reading the same answer
   * (a breadcrumb's ancestors) asks the same key and reuses it.
   */
  readonly tabCounts?: (id: string) => {
    readonly path: string;
    readonly queryKey: readonly unknown[];
  };
  /** Rendered after the list link in the detail breadcrumb (a node's ancestors). */
  readonly BreadcrumbTrail?: ComponentType<{ readonly record: ItamRecord }>;
  readonly subtitle?: (
    record: ItamRecord,
    names: (collection: string, id: unknown) => string | undefined,
    t: (key: string, options?: Record<string, unknown>) => string,
  ) => string;
  readonly defaultSort?: string;
  /** The tabs after the history timeline, which comes first. */
  readonly tabs?: readonly DomainTab[];
  /** The tab a record opens on; history unless one is named. */
  readonly defaultTab?: string;
  /**
   * A row of named views above the table (待我审批), for a question the
   * filters cannot ask because its answer depends on who is reading.
   */
  readonly Views?: ComponentType<{
    readonly filter: Readonly<Record<string, string | undefined>>;
    readonly onFilter: (
      filter: Readonly<Record<string, string | undefined>>,
    ) => void;
  }>;
  /** Renders the stat cards; receives the current filter to mark the active one. */
  readonly Stats?: ComponentType<{
    readonly filter: Readonly<Record<string, string | undefined>>;
    readonly onFilter: (
      filter: Readonly<Record<string, string | undefined>>,
    ) => void;
  }>;
  /** Replaces the generic create dialog when the form needs custom inputs. */
  readonly Create?: ComponentType<{
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onCreated: (record: ItamRecord) => void;
  }>;
  /** Optional board layout (e.g. a kanban by status); the list gets a layout toggle. */
  readonly Board?: ComponentType<{
    readonly filter: Readonly<Record<string, string | undefined>>;
    readonly q: string;
  }>;
  /**
   * Whether inline edits are allowed in the current lifecycle state, and —
   * where the record belongs to the person who raised it — for this reader.
   */
  readonly editable?: (
    record: ItamRecord,
    currentUserId: string | undefined,
  ) => boolean;
  /**
   * The field naming who answers for the record, which anyone who may update
   * it may change while it is open — even where `editable` says the record
   * is not theirs to edit, and whatever `readonlyWhen` the field has
   * (2026-10-05). Handing a request over is not editing what it asks for,
   * and the service takes a write of this one field on its own terms
   * (`onlyHandsOver` in `procurement.ts` / `disposals.ts`).
   */
  readonly handover?: {
    readonly field: string;
    readonly open: (record: ItamRecord) => boolean;
  };
  /**
   * Whether a record may be deleted in its current state and — where the
   * record belongs to one person, as a repair belongs to its 负责人 — by
   * this reader. The grant still decides.
   */
  readonly deletable?: (
    record: ItamRecord,
    currentUserId: string | undefined,
  ) => boolean;
  /**
   * Put deletion in the detail page's "more" menu rather than beside the
   * page's own actions, the way the device page does. For a page whose own
   * actions are what the reader came for, so the destructive one stays out of
   * reach without disappearing.
   */
  readonly deleteInMenu?: boolean;
  /** Rendered above the detail header (an inspection notice, AI quick entries). */
  readonly Notice?: ComponentType<{ readonly record: ItamRecord }>;
  /**
   * 等你决定 (2026-10-16): what waits on the
   * reader's decision, under the title and before the body — the approval
   * review on a purchase order or a disposal.
   */
  readonly Decisions?: ComponentType<{ readonly record: ItamRecord }>;
  /** The create dialog offers attachments, linked once the record exists. */
  readonly createAttachments?: boolean;
  /** Renders the detail header actions (dialogs included). */
  readonly Actions?: ComponentType<{ readonly record: ItamRecord }>;
  /** Rendered above the tabs (a record's description card). */
  readonly Aside?: ComponentType<{ readonly record: ItamRecord }>;
  /** A section that opens the information card (a leading section). */
  readonly InfoLead?: ComponentType<{ readonly record: ItamRecord }>;
  /** Rows that open 基本信息, above 负责人 (a stock item's quantities). */
  readonly BasicLead?: ComponentType<{ readonly record: ItamRecord }>;
  /** Detail column layout; `reversed` puts the aside and tabs on the left. */
  readonly detailLayout?: 'narrow' | 'reversed';
  /** Hide automatic timestamps when the system card already presents them. */
  readonly summaryTimestamps?: boolean;
  /** Extra summary items shown in the strip. */
  readonly summary?: (
    record: ItamRecord,
    t: (key: string, options?: Record<string, unknown>) => string,
  ) => readonly { key: string; label: ReactNode; value: ReactNode }[];
  /** Renders the first list column's cell, e.g. name with a status badge. */
  readonly permissionActions?: readonly string[];
}
