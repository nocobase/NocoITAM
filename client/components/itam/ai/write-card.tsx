import { useTranslation } from '@nocobase/i18n/client';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  LoaderCircle,
  Pencil,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { InlineField } from '@/components/itam/inline-field';
import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { RecordLink } from '@/components/itam/record-link';
import { Button } from '@/components/ui/button';
import type { AIToolRendererProps } from '@/extensions/nocobase-ai';
import { masterDataPath, useApi } from '@/lib/itam/api';
import { AI_PATH } from '@/lib/itam/ai';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { DEVICE_CREATE_FIELDS, DEVICE_FIELDS } from '@/lib/itam/devices';
import {
  ENTITLEMENT_CREATE_FIELDS,
  ENTITLEMENT_FIELDS,
  ENTITLEMENTS_PATH,
} from '@/lib/itam/entitlements';
import type { FieldDefinition, FieldOption } from '@/lib/itam/fields';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { templateOf, type TemplateField } from '@/lib/itam/field-template';
import { MASTER_DATA } from '@/lib/itam/master-data';
import {
  AUDIT_TASK_FIELDS,
  DISPOSAL_FIELDS,
  REPAIR_CREATE_FIELDS,
  REPAIR_FIELDS,
} from '@/lib/itam/operations';
import { PO_FIELDS, PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import {
  STOCK_CREATE_FIELDS,
  STOCK_KINDS,
  stockFields,
  type StockKind,
} from '@/lib/itam/stock';
import { referenceRoute, useReferenceNames } from '@/lib/itam/references';
import { translateServerMessage } from '@/lib/itam/server-errors';

/**
 * The card an ITAM write tool shows in the conversation. The AI employee
 * plugin holds the call (ASK) until the user decides; the card renders the
 * proposal the way the page would — records by name, codes by their label —
 * because what the user confirms is what the card says, and asks the server
 * beforehand whether this user could do it at all. It handles the approval
 * itself (standalone, handlesApproval) so the values and the buttons sit
 * together.
 */
type Data = Readonly<Record<string, unknown>>;

const object = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Data)
    : {};
const list = (value: unknown): readonly Data[] =>
  Array.isArray(value) ? value.map(object) : [];

/** A shown value: a reference by collection, an enum by group, or a date. */
interface Shown {
  readonly key: string;
  readonly label: string;
  readonly ref?: string | ((args: Data) => string);
  readonly enumGroup?: string;
  /** Option labels (translation keys) from the page's field definition. */
  readonly options?: readonly FieldOption[];
  readonly date?: boolean;
  readonly money?: boolean;
  readonly percent?: boolean;
  /** The page's own definition, when the row comes from one. */
  readonly field?: FieldDefinition;
  /**
   * Shown even when empty, as —: an absence the user must see before
   * confirming (a seat with nobody as its holder).
   */
  readonly always?: boolean;
  /** The label is the text itself (a category field's), not a key. */
  readonly literal?: boolean;
}

const TARGET_COLLECTIONS: Readonly<Record<string, string>> = {
  person: 'people',
  location: 'locations',
  device: 'devices',
};
const target = (args: Data): string =>
  TARGET_COLLECTIONS[text(args.targetType) || 'person'] ?? 'people';

const SHOWN: Readonly<Record<string, readonly Shown[]>> = {
  itam_assign_device: [
    { key: 'deviceId', label: 'fields.device', ref: 'devices' },
    { key: 'targetId', label: 'fields.assignee', ref: target },
  ],
  itam_loan_device: [
    { key: 'deviceId', label: 'fields.device', ref: 'devices' },
    { key: 'targetId', label: 'fields.assignee', ref: target },
    {
      key: 'expectedReturnDate',
      label: 'fields.expectedReturnDate',
      date: true,
    },
  ],
  itam_reserve_device: [
    { key: 'deviceId', label: 'fields.device', ref: 'devices' },
    {
      key: 'reservedForId',
      label: 'devices.reservedFor',
      ref: (args: Data) =>
        TARGET_COLLECTIONS[text(args.reservedForType) || 'person'] ?? 'people',
    },
    { key: 'reservedUntil', label: 'fields.reservedUntil', date: true },
  ],
  itam_transfer_device: [
    { key: 'deviceId', label: 'fields.device', ref: 'devices' },
    { key: 'targetId', label: 'fields.assignee', ref: target },
  ],
  itam_correct_device_status: [
    { key: 'deviceId', label: 'fields.device', ref: 'devices' },
    { key: 'status', label: 'fields.status', enumGroup: 'deviceStatus' },
    { key: 'reason', label: 'fields.reason' },
  ],
  itam_assign_seat: [
    {
      key: 'entitlementId',
      label: 'ai.write.entitlement',
      ref: 'entitlements',
    },
    {
      key: 'holderId',
      label: 'ai.write.holder',
      ref: (args) => (args.holderType === 'device' ? 'devices' : 'people'),
      // A subscription seat may be held by an account alone; when it is
      // meant for somebody, an empty holder is the mistake to catch here.
      always: true,
    },
    { key: 'account', label: 'fields.account' },
  ],
  itam_create_purchase_order: [
    { key: 'reason', label: 'fields.poReason', enumGroup: 'poReason' },
    { key: 'vendorId', label: 'fields.vendor', ref: 'vendors' },
    { key: 'departmentId', label: 'fields.department', ref: 'departments' },
    { key: 'neededBy', label: 'fields.neededBy', date: true },
    { key: 'currency', label: 'fields.currency' },
    { key: 'description', label: 'fields.description' },
  ],
  itam_create_disposal: [
    {
      key: 'method',
      label: 'fields.disposalMethod',
      enumGroup: 'disposalMethod',
    },
    {
      key: 'reason',
      label: 'fields.disposalReason',
      enumGroup: 'disposalReason',
    },
    { key: 'dataWipe', label: 'fields.dataWipe', enumGroup: 'dataWipe' },
    { key: 'wipeMethod', label: 'fields.wipeMethod', enumGroup: 'wipeMethod' },
    {
      key: 'recipientVendorId',
      label: 'ai.write.recipientVendor',
      ref: 'vendors',
    },
    { key: 'recipientName', label: 'fields.recipientName' },
    { key: 'description', label: 'fields.description' },
  ],
};

const HOLDER_COLLECTIONS: Readonly<Record<string, string>> = {
  person: 'people',
  location: 'locations',
  device: 'devices',
};
const holder = (args: Data): string =>
  HOLDER_COLLECTIONS[text(args.holderType)] ?? 'people';

const STOCK_FIELDS: readonly Shown[] = [
  { key: 'stockItemId', label: 'ai.write.stockItem', ref: 'stockItems' },
  { key: 'holderId', label: 'ai.write.holder', ref: holder },
  { key: 'quantity', label: 'fields.quantity' },
  { key: 'notes', label: 'fields.notes' },
];

/** The stock and receiving tools' fields, beside the write tools' above. */
const MORE_SHOWN: Readonly<Record<string, readonly Shown[]>> = {
  itam_stock_in: STOCK_FIELDS.filter((shown) => shown.key !== 'holderId'),
  itam_issue_stock: STOCK_FIELDS,
  itam_take_back_stock: STOCK_FIELDS,
  itam_receive_purchase_line: [
    { key: 'orderId', label: 'ai.write.order', ref: 'purchaseOrders' },
    // Filled from the order's lines (`useCardFacts`): which line arrives.
    { key: 'lineLabel', label: 'ai.write.line' },
    { key: 'quantity', label: 'fields.quantity' },
    { key: 'serialNos', label: 'fields.serialNo' },
    { key: 'locationId', label: 'fields.location', ref: 'locations' },
    { key: 'stockItemId', label: 'ai.write.joinStock', ref: 'stockItems' },
    {
      key: 'entitlementId',
      label: 'ai.write.joinEntitlement',
      ref: 'entitlements',
    },
    { key: 'notes', label: 'fields.notes' },
  ],
};

/**
 * A created record's fields, labelled the way its own page labels them: the
 * create tool takes any collection, so the card looks the collection's field
 * definitions up and names each field it was given in the page's order —
 * records by name, codes by their option label.
 */
function definitionsOf(
  collection: string,
  input: Data,
): readonly FieldDefinition[] {
  switch (collection) {
    case 'devices':
      return DEVICE_FIELDS;
    case 'stockItems':
      return stockFields(
        (STOCK_KINDS as readonly string[]).includes(text(input.kind))
          ? (input.kind as StockKind)
          : 'accessory',
      );
    case 'entitlements':
      return ENTITLEMENT_FIELDS;
    case 'repairs':
      return REPAIR_FIELDS;
    case 'auditTasks':
      return AUDIT_TASK_FIELDS;
    default:
      return (
        MASTER_DATA.find((entry) => entry.name === collection)?.fields ?? []
      );
  }
}

/** Fields the pages hold elsewhere than their definitions. */
const EXTRA_FIELDS: readonly Shown[] = [
  // An audit task's scope, flattened by `createSource`.
  { key: 'locationIds', label: 'fields.locations', ref: 'locations' },
  { key: 'departmentIds', label: 'fields.departments', ref: 'departments' },
  { key: 'categoryIds', label: 'fields.categories', ref: 'categories' },
  { key: 'deviceIds', label: 'fields.devices', ref: 'devices' },
  { key: 'executorIds', label: 'fields.executors', ref: 'users' },
  { key: 'kind', label: 'fields.appliesTo', enumGroup: 'appliesTo' },
  { key: 'managerId', label: 'fields.manager', ref: 'people' },
];

/** A create proposal's values, with an audit scope read as its parts. */
function createSource(args: Data): Data {
  const { scope, ...input } = object(args.input);
  return { ...input, ...object(scope) };
}

/** A card row for a field the page defines. */
const shownOf = (field: FieldDefinition, values: Data): Shown => ({
  field,
  key: field.key,
  label: field.labelWhen?.(values) ?? field.label,
  ref: field.reference?.collection,
  options: field.options,
  date: field.type === 'date',
  money: field.type === 'money',
  percent: field.type === 'percent',
});

/** The receipt dialog's own answers (`extra`), labelled as the pages do. */
const RECEIPT_FIELDS: readonly FieldDefinition[] = [
  ...DEVICE_FIELDS,
  ...stockFields('accessory'),
  ...ENTITLEMENT_FIELDS,
];
function receiptExtras(args: Data): Shown[] {
  const extra = object(args.extra);
  const shown: Shown[] = [];
  for (const key of Object.keys(extra)) {
    const field = RECEIPT_FIELDS.find((entry) => entry.key === key);
    shown.push(field ? shownOf(field, extra) : { key, label: `fields.${key}` });
  }
  return shown;
}

function createdFields(args: Data): Shown[] {
  const collection = text(args.collection);
  const source = createSource(args);
  const given = new Set(Object.keys(source));
  const shown: Shown[] = [];
  for (const field of definitionsOf(collection, source)) {
    if (!given.has(field.key) || field.key === 'executorIds') continue;
    given.delete(field.key);
    shown.push(shownOf(field, source));
  }
  for (const extra of EXTRA_FIELDS)
    if (given.delete(extra.key)) shown.push(extra);
  // Anything else the schema accepted still shows, under its own name.
  for (const key of given) shown.push({ key, label: `fields.${key}` });
  return shown;
}

/**
 * An update of a model or software product (AI 联网补充): the fields it
 * changes, labelled as the record's page labels them, its extended fields
 * by their template's labels.
 */
function updatedFields(args: Data, facts?: CardFacts): Shown[] {
  const collection = text(args.collection);
  const fields =
    MASTER_DATA.find((entry) => entry.name === collection)?.fields ?? [];
  const shown: Shown[] = [];
  for (const field of fields)
    if (field.key in args && field.key !== 'attributes')
      shown.push(shownOf(field, args));
  for (const key of Object.keys(object(args.attributes))) {
    const entry = facts?.template?.find((item) => item.key === key);
    shown.push({
      key: `attributes.${key}`,
      label: entry?.label ?? key,
      literal: true,
    });
  }
  return shown;
}

const fieldsOf = (
  tool: string,
  args: Data,
  facts?: CardFacts,
): readonly Shown[] =>
  tool === 'itam_create_record'
    ? createdFields(args)
    : tool === 'itam_update_master_record'
      ? updatedFields(args, facts)
      : tool === 'itam_receive_purchase_line'
        ? [...MORE_SHOWN[tool], ...receiptExtras(args)]
        : (SHOWN[tool] ?? MORE_SHOWN[tool] ?? []);

/** A record's extended fields flattened to `attributes.<key>`. */
const flatAttributes = (attributes: unknown): Data =>
  Object.fromEntries(
    Object.entries(object(attributes)).map(([key, value]) => [
      `attributes.${key}`,
      value,
    ]),
  );

/** The values a card shows, beside its arguments. */
const sourceOf = (tool: string, args: Data, facts: CardFacts): Data =>
  tool === 'itam_create_record'
    ? createSource(args)
    : tool === 'itam_update_master_record'
      ? { ...args, ...flatAttributes(args.attributes) }
      : tool === 'itam_receive_purchase_line'
        ? { ...args, ...object(args.extra), lineLabel: facts.lineLabel }
        : args;

interface CardFacts {
  /** The record an update changes, as it stands (`attributes.<key>` flat). */
  readonly current?: Data;
  /** Its category's extended fields, for their labels. */
  readonly template?: readonly TemplateField[];
  /** The received line, as "model × quantity". */
  readonly lineLabel?: string;
  readonly lineRef?: { collection: string; id: string };
  /** Seats being reclaimed, by id, with their holders. */
  readonly seats: ReadonlyMap<string, Data>;
}

/**
 * What a card reads before it can name what it confirms: the proposal says
 * which line of an order arrives and which seats are taken back, by id;
 * the card shows the line's item and each seat's holder.
 */
function useCardFacts(tool: string, args: Data): CardFacts {
  const api = useApi();
  const orderId =
    tool === 'itam_receive_purchase_line' ? text(args.orderId) : '';
  const lines = useQuery({
    queryKey: ['itam', PURCHASE_ORDERS_PATH, orderId, 'lines'],
    queryFn: async () =>
      (
        await api.request<{ data: Data[] }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/lines`,
        })
      ).data,
    enabled: orderId !== '',
    staleTime: 30_000,
  });
  const entitlementIds =
    tool === 'itam_reclaim_seats'
      ? [
          ...new Set(
            list(args.items)
              .map((item) => text(item.entitlementId))
              .filter(Boolean),
          ),
        ]
      : [];
  const seatLists = useQueries({
    queries: entitlementIds.map((id) => ({
      queryKey: ['itam', ENTITLEMENTS_PATH, id, 'seats'],
      queryFn: async () =>
        (
          await api.request<{ data: { seats: Data[] } }>({
            path: `${ENTITLEMENTS_PATH}/${id}/seats`,
          })
        ).data.seats,
      staleTime: 30_000,
    })),
  });
  const seats = new Map<string, Data>();
  for (const query of seatLists)
    for (const seat of query.data ?? []) seats.set(text(seat.id), seat);
  const updating = tool === 'itam_update_master_record';
  const currentPath = updating
    ? `${masterDataPath(text(args.collection))}/${text(args.id)}`
    : '';
  const current = useQuery({
    // Keys of its own: the page's record queries cache another shape.
    queryKey: ['itam', currentPath, 'write-card'],
    queryFn: async () =>
      (await api.request<{ data: Data }>({ path: currentPath })).data,
    enabled: updating && text(args.id) !== '',
    staleTime: 30_000,
  });
  const categoryId = text(current.data?.categoryId);
  const category = useQuery({
    queryKey: ['itam', masterDataPath('categories'), categoryId, 'write-card'],
    queryFn: async () =>
      (
        await api.request<{ data: Data }>({
          path: `${masterDataPath('categories')}/${categoryId}`,
        })
      ).data,
    enabled: updating && categoryId !== '',
    staleTime: 60_000,
  });
  const line = lines.data?.find(
    (entry) => text(entry.id) === text(args.lineId),
  );
  const lineRef = line
    ? line.modelId
      ? { collection: 'models', id: text(line.modelId) }
      : { collection: 'softwareProducts', id: text(line.softwareProductId) }
    : undefined;
  return {
    lineRef,
    lineLabel: line ? `× ${text(line.quantity)}` : undefined,
    seats,
    current: current.data
      ? { ...current.data, ...flatAttributes(current.data.attributes) }
      : undefined,
    template: updating ? templateOf(category.data?.fieldTemplate) : undefined,
  };
}

/** Every field the pages define, to find a code's options by its group. */
const ALL_FIELDS: readonly FieldDefinition[] = [
  ...DEVICE_FIELDS,
  ...stockFields('accessory'),
  ...ENTITLEMENT_FIELDS,
  ...REPAIR_FIELDS,
  ...AUDIT_TASK_FIELDS,
  ...PO_FIELDS,
  ...DISPOSAL_FIELDS,
  ...MASTER_DATA.flatMap((entry) => entry.fields),
];

/** The options of an enum group (`enums.<group>.<value>`), from the pages. */
function optionsOf(group: string): readonly FieldOption[] | undefined {
  const prefix = `enums.${group}.`;
  for (const field of ALL_FIELDS) {
    if (field.options?.[0]?.label.startsWith(prefix)) return field.options;
    if (field.dependent?.options[0]?.label.startsWith(prefix))
      return field.dependent.options;
  }
  return undefined;
}

/** Values the card shows but does not edit: they identify what is acted on. */
const FIXED_KEYS = new Set(['orderId', 'lineLabel', 'serialNos', 'title']);
const TEXTAREA_KEYS = new Set([
  'notes',
  'description',
  'reason',
  'condition',
  'faultDescription',
]);

/**
 * How a row is edited in place, or nothing when it is not: a list, a
 * nested value, or the record the proposal acts on. A row from a page's
 * own definition keeps it — without the paired halves (an amount's
 * currency, a reference's free-text twin), since a card edits one value.
 */
function editorOf(shown: Shown, source: Data): FieldDefinition | undefined {
  if (FIXED_KEYS.has(shown.key)) return undefined;
  const value = source[shown.key];
  if (Array.isArray(value) || (value !== null && typeof value === 'object'))
    return undefined;
  if (shown.field)
    return {
      ...shown.field,
      currencyField: undefined,
      alternateField: undefined,
      dependent: undefined,
      readonlyWhen: undefined,
      visibleWhen: undefined,
      form: true,
    };
  const base = { key: shown.key, label: shown.label };
  const reference = refOf(shown, source);
  if (reference)
    return { ...base, type: 'reference', reference: { collection: reference } };
  const options =
    shown.options ?? (shown.enumGroup ? optionsOf(shown.enumGroup) : undefined);
  if (options) return { ...base, type: 'select', options };
  if (shown.date) return { ...base, type: 'date' };
  if (shown.percent) return { ...base, type: 'percent' };
  if (typeof value === 'boolean') return { ...base, type: 'boolean' };
  if (typeof value === 'number' || shown.money)
    return { ...base, type: 'number' };
  return {
    ...base,
    type: TEXTAREA_KEYS.has(shown.key) ? 'textarea' : 'text',
  };
}

/** Where an edited value goes in the proposal's arguments. */
function pathOf(tool: string, key: string, args: Data): string[] {
  if (tool === 'itam_create_record') {
    const input = object(args.input);
    return key in object(input.scope)
      ? ['input', 'scope', key]
      : ['input', key];
  }
  if (tool === 'itam_receive_purchase_line' && key in object(args.extra))
    return ['extra', key];
  if (tool === 'itam_update_master_record' && key.startsWith('attributes.'))
    return ['attributes', key.slice('attributes.'.length)];
  return [key];
}

const FOLLOWS = new Set(['categoryId', 'manufacturerId']);

/**
 * The create form a proposal is edited in whole (编辑), as its own page
 * would show it: every field at once, including the ones the assistant left
 * empty. Only for what creates a record from plain fields.
 */
function formFieldsOf(tool: string, args: Data): readonly FieldDefinition[] {
  const pick = (all: readonly FieldDefinition[], keys: readonly string[]) =>
    keys.flatMap((key) => {
      const field = all.find((entry) => entry.key === key);
      return field ? [{ ...field, form: true }] : [];
    });
  if (tool === 'itam_create_purchase_order')
    return pick(PO_FIELDS, [
      'reason',
      'description',
      'departmentId',
      'neededBy',
      'vendorId',
      'currency',
    ]);
  if (tool !== 'itam_create_record') return [];
  const collection = text(args.collection);
  const input = object(args.input);
  switch (collection) {
    // Category and manufacturer follow the model (a device) or the software
    // product (an entitlement): the page fills them from that choice and the
    // service derives them on create, so the form does not ask.
    case 'devices':
      return pick(DEVICE_FIELDS, DEVICE_CREATE_FIELDS).filter(
        (field) => !FOLLOWS.has(field.key),
      );
    case 'stockItems':
      return pick(definitionsOf(collection, input), STOCK_CREATE_FIELDS);
    case 'entitlements':
      return pick(ENTITLEMENT_FIELDS, ENTITLEMENT_CREATE_FIELDS).filter(
        (field) => !FOLLOWS.has(field.key),
      );
    case 'repairs':
      return pick(REPAIR_FIELDS, ['deviceId', ...REPAIR_CREATE_FIELDS]);
    default:
      return definitionsOf(collection, input)
        .filter((field) => field.form !== false)
        .map((field) => ({ ...field, form: true }));
  }
}

/** Where a written record opens, for the tools that create one. */
const CREATED_ROUTES: Readonly<Record<string, readonly [string, string]>> = {
  itam_create_purchase_order: ['procurement', 'orderNo'],
  itam_create_disposal: ['disposals', 'disposalNo'],
};

const refOf = (shown: Shown, args: Data): string | undefined =>
  typeof shown.ref === 'function' ? shown.ref(args) : shown.ref;

/** Every record id the card names, grouped by collection, for one lookup. */
function wantedNames(
  tool: string,
  args: Data,
  source: Data,
  facts: CardFacts,
): { collection: string; ids: string[] }[] {
  const wanted = new Map<string, string[]>();
  const add = (collection: string | undefined, id: unknown) => {
    if (!collection || !text(id)) return;
    wanted.set(collection, [...(wanted.get(collection) ?? []), text(id)]);
  };
  for (const shown of fieldsOf(tool, args, facts))
    for (const value of Array.isArray(source[shown.key])
      ? (source[shown.key] as unknown[])
      : [source[shown.key]])
      add(refOf(shown, source), value);
  for (const item of list(args.items)) {
    add('devices', item.deviceId);
    add('entitlements', item.entitlementId);
    add('locations', item.locationId);
    const seat = facts.seats.get(text(item.seatId));
    if (seat) add(HOLDER_COLLECTIONS[text(seat.holderType)], seat.holderId);
  }
  if (facts.lineRef) add(facts.lineRef.collection, facts.lineRef.id);
  for (const id of Array.isArray(args.deviceIds) ? args.deviceIds : [])
    add('devices', id);
  for (const line of list(args.lines)) {
    add('models', line.modelId);
    add('softwareProducts', line.softwareProductId);
  }
  return [...wanted].map(([collection, ids]) => ({ collection, ids }));
}

/**
 * A finished call's result. The plugin hands the renderer the tool's
 * `content` itself (the record the service returned), stored as JSON text
 * in some histories; a `{ status, content }` envelope is unwrapped too.
 */
function resultOf(value: unknown): Data {
  let parsed = value;
  if (typeof value === 'string')
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  const data = object(parsed);
  return 'status' in data && 'content' in data ? object(data.content) : data;
}

/** A failed call's error text is the body `ai-writes.ts` threw. */
function parseFailure(errorText: unknown): { code: string; message: string } {
  const raw = text(errorText);
  try {
    const parsed = object(JSON.parse(raw));
    if (parsed.message)
      return { code: text(parsed.code), message: text(parsed.message) };
  } catch {
    // Not our body: show the text as it is.
  }
  return { code: 'SERVER_ERROR', message: raw };
}

function toolName(part: AIToolRendererProps['part']): string {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
}

// Calls this page saw before they finished. A call that later succeeds
// changed ITAM data, so the pages beside the conversation reload theirs; a
// card read back from history never enters the set and refreshes nothing.
// Outside the component so a card that remounts while streaming still counts.
const unfinishedCalls = new Set<string>();

function useRefreshAfterWrite(
  toolCallId: string,
  state: string,
  written: boolean,
): void {
  const queryClient = useQueryClient();
  if (state !== 'output-available' && state !== 'output-error')
    unfinishedCalls.add(toolCallId);
  useEffect(() => {
    if (state === 'output-error') {
      unfinishedCalls.delete(toolCallId);
      return;
    }
    if (!written || !unfinishedCalls.has(toolCallId)) return;
    unfinishedCalls.delete(toolCallId);
    void queryClient.invalidateQueries({ queryKey: ['itam'] });
  }, [written, state, toolCallId, queryClient]);
}

export function ItamWriteCard({
  part,
  disabled,
  onApprove,
  onEdit,
  onReject,
}: AIToolRendererProps): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const tool = toolName(part);
  const proposed = object(part.input);
  // The user's corrections, kept here until they confirm; confirming an
  // edited proposal hands the plugin the edited values (`onEdit`). The draft
  // remembers which call it corrects, so a new proposal drops it.
  const [edited, setEdited] = useState<{ of: string; value: Data }>();
  const draft =
    edited && edited.of === part.toolCallId ? edited.value : undefined;
  const [editing, setEditing] = useState(false);
  const output =
    part.state === 'output-available'
      ? resultOf((part as { output?: unknown }).output)
      : undefined;
  // Once run, the tool reports the values it ran with (the user may have
  // corrected the proposal), and that is what a settled card shows.
  const written = object(output?.values);
  const args: Data =
    Object.keys(written).length > 0 ? written : (draft ?? proposed);
  // Changed by the user: being edited now, or run with other values than
  // the ones proposed (what a settled card reads back after a reload).
  const changed =
    draft !== undefined ||
    (Object.keys(written).length > 0 &&
      JSON.stringify(written) !== JSON.stringify(proposed));
  const edit = (path: readonly string[], value: unknown): void => {
    const next: Record<string, unknown> = { ...args };
    let cursor = next;
    for (const key of path.slice(0, -1)) {
      const child: Record<string, unknown> = { ...object(cursor[key]) };
      cursor[key] = child;
      cursor = child;
    }
    const last = path.at(-1) ?? '';
    if (value === null || value === undefined || value === '')
      delete cursor[last];
    else cursor[last] = value;
    setEdited({ of: part.toolCallId, value: next });
  };
  const metadata =
    'callProviderMetadata' in part
      ? object(object(part.callProviderMetadata).nocobase)
      : {};
  const [action, setAction] = useState<'approve' | 'reject'>();
  const [decided, setDecided] = useState(false);
  // The plugin holds the call while the user decides; once allowed it runs
  // and the part carries the tool's own result.
  const awaiting =
    metadata.requiresApproval === true &&
    part.state === 'input-available' &&
    (metadata.invokeStatus === undefined ||
      metadata.invokeStatus === 'interrupted') &&
    !decided;
  const screen = useQuery({
    // The values as they stand are what is checked, so an edit asks again.
    queryKey: [
      'itam',
      AI_PATH,
      'screen',
      part.toolCallId,
      JSON.stringify(args),
    ],
    queryFn: async () =>
      (
        await api.request<{
          data: { ok: boolean; code?: string; message?: string };
        }>({
          path: `${AI_PATH}/screen`,
          method: 'POST',
          json: { tool, args },
        })
      ).data,
    enabled: awaiting,
    staleTime: 10_000,
  });
  const blocked = awaiting && screen.data && !screen.data.ok;
  const succeeded = output !== undefined && Object.keys(output).length > 0;
  const confirmed =
    part.state === 'output-available' &&
    !succeeded &&
    metadata.invokeStatus === 'confirmed';
  const failure =
    part.state === 'output-error'
      ? parseFailure((part as { errorText?: unknown }).errorText)
      : undefined;
  useRefreshAfterWrite(part.toolCallId, part.state, succeeded || confirmed);
  const found = useCardFacts(tool, args);
  const batchRows = list(object(output).rows);
  // A reclaimed seat is gone from the list; its row in the result says who
  // held it.
  const seats = new Map(found.seats);
  for (const row of batchRows)
    if (row.seatId && row.holderId && !seats.has(text(row.seatId)))
      seats.set(text(row.seatId), row);
  const facts: CardFacts = { ...found, seats };
  const shownSource = sourceOf(tool, args, facts);
  const names = useReferenceNames(wantedNames(tool, args, shownSource, facts));
  const nameOf = (collection: string | undefined, id: unknown): string =>
    (collection && names[collection]?.get(text(id))) || text(id);
  const holderName = (seat: Data | undefined): string =>
    seat?.holderId
      ? nameOf(HOLDER_COLLECTIONS[text(seat.holderType)], seat.holderId)
      : '';

  const decide = async (
    next: 'approve' | 'reject',
    run: () => void | Promise<void>,
  ): Promise<void> => {
    setAction(next);
    try {
      await run();
      setDecided(true);
    } finally {
      setAction(undefined);
    }
  };

  let status: ReactNode;
  if (part.state === 'input-streaming')
    status = (
      <>
        <LoaderCircle className='size-3.5 animate-spin' />
        {t('ai.write.preparing')}
      </>
    );
  else if (awaiting)
    status = (
      <>
        <Sparkles className='size-3.5 text-success-foreground' />
        {t('ai.write.awaiting')}
      </>
    );
  else if (succeeded || confirmed)
    status = (
      <>
        <Check className='size-3.5 text-success-foreground' />
        {t('ai.write.done')}
      </>
    );
  else if (failure)
    status = (
      <>
        <CircleAlert className='size-3.5 text-destructive' />
        {t('ai.write.failed')}
      </>
    );
  else if (decided && action === undefined)
    status = (
      <>
        <LoaderCircle className='size-3.5 animate-spin' />
        {t('ai.write.running')}
      </>
    );
  else
    status = (
      <>
        <CircleAlert className='size-3.5' />
        {t('ai.write.denied')}
      </>
    );

  // A create card reads its fields from the proposal's input, a receipt
  // from its answers and the line it names.
  const source: Data = facts.lineRef
    ? {
        ...shownSource,
        lineLabel: `${nameOf(facts.lineRef.collection, facts.lineRef.id)} ${facts.lineLabel ?? ''}`,
      }
    : shownSource;
  const valueIn = (shown: Shown, data: Data): string => {
    const value = data[shown.key];
    if (shown.always && (value === null || value === undefined || value === ''))
      return '—';
    if (Array.isArray(value))
      return value
        .map((entry) =>
          shown.ref ? nameOf(refOf(shown, source), entry) : text(entry),
        )
        .join('、');
    if (typeof value === 'boolean')
      return t(value ? 'common.yes' : 'common.no');
    const option = shown.options?.find((entry) => entry.value === text(value));
    if (option) return t(option.label);
    if (shown.money) return formatMoney(value, text(source.currency) || null);
    if (shown.percent) return `${Math.round(Number(value) * 10000) / 100}%`;
    if (shown.enumGroup)
      return t(`enums.${shown.enumGroup}.${text(value)}`, {
        defaultValue: text(value),
      });
    if (shown.date) return formatDate(value);
    if (value !== null && typeof value === 'object')
      return JSON.stringify(value);
    return shown.ref ? nameOf(refOf(shown, source), value) : text(value);
  };
  // An update reads as what it was and what it becomes.
  const valueOf = (shown: Shown): string => {
    const next = valueIn(shown, source);
    const before = facts.current?.[shown.key];
    if (
      tool !== 'itam_update_master_record' ||
      before === undefined ||
      before === null ||
      before === '' ||
      text(before) === text(source[shown.key])
    )
      return next;
    return `${valueIn(shown, facts.current ?? {})} → ${next}`;
  };
  const rows = fieldsOf(tool, args, facts).filter((shown) => {
    const value = source[shown.key];
    if (shown.always) return true;
    return Array.isArray(value)
      ? value.length > 0
      : typeof value === 'boolean' || text(value) !== '';
  });
  const batch = batchRows;
  const created = CREATED_ROUTES[tool];
  const editable = awaiting && !disabled && action === undefined;
  const formFields = formFieldsOf(tool, args);
  // The form edits the create input for a record, the order's own fields
  // for a purchase order; what it does not show is kept.
  const formTarget: Data =
    tool === 'itam_create_record' ? object(args.input) : args;
  // As on the page's create dialog, the owner starts at whoever is filing
  // it — the service does the same when the proposal names none.
  const currentUserId = useCurrentUserId();
  const formInitial: Data =
    currentUserId &&
    formFields.some((field) => field.key === 'ownerId') &&
    !formTarget.ownerId
      ? { ...formTarget, ownerId: currentUserId }
      : formTarget;

  return (
    // The assistant's cards are green like its shortcuts: what it proposes
    // reads apart from the conversation around it.
    <div className='rounded-lg border border-success-foreground/25 bg-success p-3 text-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='font-medium'>
            {/* The title is Noco's sentence about the proposal; once the
                user has changed it, the sentence may no longer be true. */}
            {(!changed && text(args.title)) || t(`ai.write.tools.${tool}`)}
          </p>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {tool === 'itam_create_record'
              ? t('ai.write.createOf', {
                  what: t(`ai.write.objects.${text(args.collection)}`, {
                    defaultValue: text(args.collection),
                  }),
                })
              : t(`ai.write.tools.${tool}`, { defaultValue: tool })}
          </p>
        </div>
        <span className='flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground'>
          {status}
        </span>
      </div>

      {rows.length > 0 ? (
        <dl className='mt-3 space-y-1.5'>
          {rows.map((shown) => (
            <div key={shown.key} className='flex items-start gap-3'>
              <dt className='w-24 shrink-0 text-muted-foreground'>
                {shown.literal
                  ? shown.label
                  : t(shown.label, { defaultValue: shown.key })}
              </dt>
              <dd className='min-w-0 flex-1 break-words'>
                {editable && editorOf(shown, source) ? (
                  <div className='-mx-2 -my-1'>
                    <InlineField
                      field={editorOf(shown, source)!}
                      value={source[shown.key]}
                      display={valueOf(shown)}
                      onSave={async (value) =>
                        edit(pathOf(tool, shown.key, args), value)
                      }
                    />
                  </div>
                ) : (
                  valueOf(shown)
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {Array.isArray(args.deviceIds) ? (
        <ItemList
          title={t('ai.write.devices', { count: args.deviceIds.length })}
          items={args.deviceIds.map((id) => nameOf('devices', id))}
        />
      ) : null}
      {Array.isArray(args.lines) ? (
        <ItemList
          title={t('ai.write.lines', { count: args.lines.length })}
          items={list(args.lines).map(
            (line) =>
              `${nameOf(line.modelId ? 'models' : 'softwareProducts', line.modelId ?? line.softwareProductId)} × ${text(line.quantity)}${line.unitPrice !== undefined ? ` · ${formatMoney(line.unitPrice, text(args.currency) || null)}` : ''}`,
          )}
        />
      ) : null}
      {Array.isArray(args.items) ? (
        <ItemList
          title={t('ai.write.items', { count: args.items.length })}
          items={list(args.items).map((item, index) => {
            const label = item.deviceId
              ? [
                  nameOf('devices', item.deviceId),
                  item.nextStatus
                    ? t(`enums.deviceStatus.${text(item.nextStatus)}`)
                    : '',
                  item.locationId ? nameOf('locations', item.locationId) : '',
                  text(item.condition),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : [
                  nameOf('entitlements', item.entitlementId),
                  holderName(facts.seats.get(text(item.seatId))),
                  text(facts.seats.get(text(item.seatId))?.account),
                ]
                  .filter(Boolean)
                  .join(' · ');
            // After the call, each row says how it went.
            const result = batch[index];
            if (!result) return label;
            return result.ok
              ? `${label} — ${t('ai.write.done')}`
              : `${label} — ${translateServerMessage(text(object(result.error).message))}`;
          })}
        />
      ) : null}

      {failure ? (
        <p className='mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive'>
          {translateServerMessage(failure.message)}
        </p>
      ) : null}
      {succeeded && tool === 'itam_create_record' && output?.id ? (
        <p className='mt-3 text-xs'>
          <RecordLink
            to={`/${referenceRoute(text(output.collection))}/${text(output.id)}`}
            className='text-link underline-offset-4 hover:underline'
          >
            {t('ai.write.openCreated', {
              no: text(output.deviceNo) || text(output.name),
            })}
          </RecordLink>
        </p>
      ) : null}
      {succeeded && created && output?.id ? (
        <p className='mt-3 text-xs'>
          <RecordLink
            to={`/${created[0]}/${text(output.id)}`}
            className='text-link underline-offset-4 hover:underline'
          >
            {t('ai.write.openCreated', { no: text(output[created[1]]) })}
          </RecordLink>
        </p>
      ) : null}
      {blocked ? (
        <p className='mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive'>
          {translateServerMessage(text(screen.data?.message))}
          <span className='mt-1 block text-muted-foreground'>
            {t('ai.write.blocked')}
          </span>
        </p>
      ) : null}

      {awaiting ? (
        <div className='mt-3 flex items-center justify-between gap-3 border-t border-border pt-3'>
          <p className='text-xs text-muted-foreground'>
            {draft ? t('ai.write.editedHint') : t('ai.write.confirmHint')}
          </p>
          <div className='flex shrink-0 gap-2'>
            {formFields.length > 0 ? (
              <Button
                variant='outline'
                size='sm'
                disabled={disabled || action !== undefined}
                onClick={() => setEditing(true)}
              >
                <Pencil data-icon='inline-start' />
                {t('ai.write.edit')}
              </Button>
            ) : null}
            <Button
              variant='ghost'
              size='sm'
              disabled={disabled || action !== undefined}
              onClick={() =>
                void decide('reject', () =>
                  onReject(
                    'The user denied this change. Do not call this tool again with the same values; ask what to change instead.',
                  ),
                )
              }
            >
              {action === 'reject' ? '…' : t('ai.write.deny')}
            </Button>
            <Button
              size='sm'
              disabled={
                disabled ||
                action !== undefined ||
                screen.isPending ||
                Boolean(blocked)
              }
              onClick={() =>
                void decide('approve', () =>
                  draft ? onEdit(draft) : onApprove(),
                )
              }
            >
              {action === 'approve' ? '…' : t('ai.write.confirm')}
            </Button>
          </div>
        </div>
      ) : null}
      {editing && formFields.length > 0 ? (
        <RecordFormDialog
          open
          onOpenChange={(open) => setEditing(open)}
          title={t('ai.write.editTitle')}
          fields={formFields}
          initial={formInitial}
          onSubmit={(values) => {
            // The form sends what is filled in; a field it shows and the
            // user emptied is removed, and anything it does not show stays.
            const next: Record<string, unknown> = { ...formTarget };
            for (const field of formFields)
              if (field.key in values) next[field.key] = values[field.key];
              else delete next[field.key];
            if (tool === 'itam_create_record') edit(['input'], next);
            else setEdited({ of: part.toolCallId, value: next });
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}): ReactElement {
  return (
    <div className='mt-3'>
      <p className='mb-1 text-xs text-muted-foreground'>{title}</p>
      <ul className='divide-y divide-border rounded-md border border-border text-xs'>
        {/* A proposal may name the same record twice; the position is
            what tells two such rows apart. */}
        {items.map((item, index) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
          <li key={index} className='px-2 py-1 break-words'>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
