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
