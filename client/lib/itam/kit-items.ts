import { masterDataPath, useItamList } from './api.js';
import { text } from './format.js';
import { useReferenceNames } from './references.js';

/**
 * A kit's items (入职配置) as rows and back: each a model, a category (any
 * model in it) or a software product, with how many. Stored on the kit as
 * one `items` list of { modelId | categoryId | softwareProductId, quantity }.
 */
export type KitItemType = 'model' | 'category' | 'softwareProduct';

export interface KitItem {
  readonly type: KitItemType;
  readonly id: string | null;
  readonly quantity: number;
  /**
   * The asset type a row being edited was given (设备 … 授权), which narrows
   * its picker; not stored, since the model, category or product says it.
   */
  readonly kind?: string;
}

/** The stored list as rows; anything unrecognised is dropped. */
export function parseKitItems(value: unknown): KitItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): KitItem[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const item = entry as Record<string, unknown>;
    const quantity = Math.max(1, Number(item.quantity) || 1);
    if (typeof item.modelId === 'string')
      return [{ type: 'model', id: item.modelId, quantity }];
    if (typeof item.categoryId === 'string')
      return [{ type: 'category', id: item.categoryId, quantity }];
    if (typeof item.softwareProductId === 'string')
      return [
        { type: 'softwareProduct', id: item.softwareProductId, quantity },
      ];
    return [];
  });
}

/** Rows back to the stored shape. */
export function serializeKitItems(
  items: readonly KitItem[],
): Record<string, unknown>[] {
  return items.flatMap((item) =>
    item.id
      ? [
          {
            [`${item.type}Id`]: item.id,
            quantity: item.quantity,
          },
        ]
      : [],
  );
}

/**
 * What kind of asset each item is — 设备, 配件, 耗材, 组件 or 授权 — the way
 * every list of this application tags it: a model's comes from its
 * category, a category's is its own, and a software product is always an
 * entitlement. And what the row says beside its name (2026-10-28): the
 * category and maker of a model or software product, as their own lists
 * show them. Reads only the records the kit names.
 */
/** A record the row names beside an item, opening in the drawer. */
export interface ItemOwner {
  readonly route: 'categories' | 'manufacturers';
  readonly id: string;
  readonly name: string;
}

export function useItemFacts(items: readonly KitItem[]): {
  readonly kindOf: (item: KitItem) => string | undefined;
  readonly detailOf: (item: KitItem) => readonly ItemOwner[];
} {
  const idsOf = (type: KitItemType) => [
    ...new Set(
      items
        .filter((item) => item.type === type && item.id)
        .map((item) => String(item.id)),
    ),
  ];
  const modelIds = idsOf('model');
  const models = useItamList(
    masterDataPath('models'),
    { ids: modelIds, pageSize: 200 },
    { enabled: modelIds.length > 0 },
  );
  const productIds = idsOf('softwareProduct');
  const products = useItamList(
    masterDataPath('softwareProducts'),
    { ids: productIds, pageSize: 200 },
    { enabled: productIds.length > 0 },
  );
  // A model's or product's category and maker, by its id.
  const owners = new Map(
    [...(models.data?.data ?? []), ...(products.data?.data ?? [])].map(
      (row) => [
        row.id,
        {
          categoryId: text(row.categoryId),
          manufacturerId: text(row.manufacturerId),
        },
      ],
    ),
  );
  const categoryIds = [
    ...new Set([
      ...idsOf('category'),
      ...[...owners.values()].map((owner) => owner.categoryId),
    ]),
  ].filter(Boolean);
  const categories = useItamList(
    masterDataPath('categories'),
    { ids: categoryIds, pageSize: 200 },
    { enabled: categoryIds.length > 0 },
  );
  const category = new Map(
    (categories.data?.data ?? []).map((row) => [
      row.id,
      { appliesTo: text(row.appliesTo), name: text(row.name) },
    ]),
  );
  const makers = useReferenceNames([
    {
      collection: 'manufacturers',
      ids: [...owners.values()].map((owner) => owner.manufacturerId),
    },
  ]).manufacturers;
  const categoryOf = (item: KitItem) =>
    item.type === 'category' ? item.id : owners.get(item.id ?? '')?.categoryId;
  return {
    kindOf: (item) => {
      if (item.type === 'softwareProduct') return 'entitlement';
      const id = categoryOf(item);
      return (id && category.get(id)?.appliesTo) || undefined;
    },
    // A category item is its own category, with no maker.
    detailOf: (item) => {
      if (item.type === 'category') return [];
      const owner = owners.get(item.id ?? '');
      if (!owner) return [];
      const categoryName = category.get(owner.categoryId)?.name;
      const makerName = makers?.get(owner.manufacturerId);
      return [
        ...(categoryName
          ? [
              {
                route: 'categories' as const,
                id: owner.categoryId,
                name: categoryName,
              },
            ]
          : []),
        ...(makerName
          ? [
              {
                route: 'manufacturers' as const,
                id: owner.manufacturerId,
                name: makerName,
              },
            ]
          : []),
      ];
    },
  };
}
