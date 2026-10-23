import { AUDIT_FIELDS, OWNER_FIELD, type FieldDefinition } from './fields.js';

export const STOCK_KINDS = ['accessory', 'consumable', 'component'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

export const STOCK_PATH = 'itam/stock';

export const STOCK_ROUTES: Readonly<Record<StockKind, string>> = {
  accessory: 'accessories',
  consumable: 'consumables',
  component: 'components',
};

export const STOCK_I18N: Readonly<Record<StockKind, string>> = {
  accessory: 'accessories',
  consumable: 'consumables',
  component: 'components',
};

export function stockFields(kind: StockKind): readonly FieldDefinition[] {
  return [
    {
      key: 'name',
      label: 'fields.name',
      type: 'text',
      required: true,
      column: true,
      group: 'groups.basic',
    },
    {
      // The detail reads 型号、分类、制造商, as on devices: with a model
      // chosen, category and manufacturer follow it.
      key: 'modelId',
      detailOrder: -1,
      label: 'fields.model',
      type: 'reference',
      reference: { collection: 'models', filter: { appliesTo: kind } },
      required: true,
      column: true,
      group: 'groups.basic',
    },
    {
      key: 'categoryId',
      label: 'fields.category',
      type: 'reference',
      required: true,
      reference: {
        collection: 'categories',
        filter: { appliesTo: kind },
        filterHint: `categories.hintOnly.${kind}`,
      },
      column: true,
      // The model is required and brings both: shown, never typed.
      readonlyWhen: () => true,
      readonlyHint: 'devices.followsModel',
      group: 'groups.basic',
    },
    {
      key: 'manufacturerId',
      label: 'fields.manufacturer',
      type: 'reference',
      required: true,
      reference: { collection: 'manufacturers' },
      readonlyWhen: () => true,
      readonlyHint: 'devices.followsModel',
      group: 'groups.basic',
    },
    {
      // Derived on the server: stocked total minus what is out or used up.
      key: 'availableQuantity',
      label: 'fields.inStock',
      type: 'number',
      column: true,
      form: false,
      // In 数量 with the rest (2026-10-22; leading 基本信息 from
      // 2026-10-16), first.
      group: 'groups.quantity',
    },
    {
      // Issued (installed) and not yet back; a consumable never comes
      // back, so for it the same number is what was used up.
      key: 'usedQuantity',
      label:
        kind === 'consumable'
          ? 'fields.consumedTotal'
          : 'fields.outstandingQuantity',
      type: 'number',
      form: false,
      group: 'groups.quantity',
    },
    {
      // Everything ever stocked in; it only grows. Quantities come in
      // through stock-ins (manual or an order's receipt), never on creation.
      key: 'totalQuantity',
      label: 'fields.stockedTotal',
      type: 'number',
      min: 0,
      column: true,
      form: false,
      group: 'groups.quantity',
    },
    {
      key: 'minimumQuantity',
      label: 'fields.minimumQuantity',
      type: 'number',
      min: 0,
      placeholder: 'stock.minimumFromSettings',
      column: true,
      group: 'groups.quantity',
    },
    {
      // In 归属与位置, under 数量 (2026-10-22), as a device's place is.
      key: 'locationId',
      label: 'fields.location',
      type: 'reference',
      required: true,
      reference: { collection: 'locations' },
      column: true,
      group: 'groups.ownership',
    },
    {
      key: 'notes',
      label: 'fields.notes',
      type: 'textarea',
      group: 'groups.basic',
    },
    OWNER_FIELD,
    ...AUDIT_FIELDS,
  ];
}

/** In the device dialog's order: model first, then what follows from it. */
export const STOCK_CREATE_FIELDS: readonly string[] = [
  // The model and what it brings read together, then the name it gives.
  'modelId',
  'categoryId',
  'manufacturerId',
  'name',
  'locationId',
  'minimumQuantity',
  'notes',
  'ownerId',
];

export interface StockStats {
  readonly total: number;
  readonly belowMinimum: number;
  readonly outOfStock: number;
  readonly issuedThisMonth: number;
}
