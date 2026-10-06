import { useTranslation } from '@nocobase/i18n/client';
import { AppWindow, FolderTree, Package, Pencil, Plus, X } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  parseKitItems,
  serializeKitItems,
  type KitItem,
  type KitItemType,
} from '@/lib/itam/kit-items';
import { masterDataPath, useItamList } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

import { AssetTypeBadge } from './asset-type-badge.js';
import { ReferenceSelect } from './reference-select.js';

/**
 * A kit's items: each a model, a category (any model in it) or a software
 * product, with how many (入职配置, 2026-10-05). Shown beside the kit's
 * information card the way a category's field template is, and saved as the
 * kit's one `items` list.
 */
const TYPES: readonly KitItemType[] = ['model', 'category', 'softwareProduct'];
/** The asset types a row is chosen by, in the order the navigation lists them. */
const KINDS = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
] as const;
const COLLECTION: Readonly<Record<KitItemType, string>> = {
  model: 'models',
  category: 'categories',
  softwareProduct: 'softwareProducts',
};
const ICON = {
  model: Package,
  category: FolderTree,
  softwareProduct: AppWindow,
};

/** What the row shows until its kind has loaded. */
function Icon({ type }: { readonly type: KitItemType }): ReactElement {
  const Glyph = ICON[type];
  return (
    <Glyph
      aria-hidden='true'
      className='size-4 shrink-0 text-muted-foreground'
    />
  );
}

/**
 * What kind of asset each item is — 设备, 配件, 耗材, 组件 or 授权 — the way
 * every list of this application tags it: a model's comes from its
 * category, a category's is its own, and a software product is always an
 * entitlement. Reads only the models and categories the kit names.
 */
function useItemKinds(
  items: readonly KitItem[],
): (item: KitItem) => string | undefined {
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
  const categoryOfModel = new Map(
    (models.data?.data ?? []).map((row) => [row.id, text(row.categoryId)]),
  );
  const categoryIds = [
    ...new Set([...idsOf('category'), ...categoryOfModel.values()]),
  ].filter(Boolean);
  const categories = useItamList(
    masterDataPath('categories'),
    { ids: categoryIds, pageSize: 200 },
    { enabled: categoryIds.length > 0 },
  );
  const appliesTo = new Map(
    (categories.data?.data ?? []).map((row) => [row.id, text(row.appliesTo)]),
  );
  return (item) => {
    if (item.type === 'softwareProduct') return 'entitlement';
    const category =
      item.type === 'category' ? item.id : categoryOfModel.get(item.id ?? '');
    return (category && appliesTo.get(category)) || undefined;
  };
}

export function KitItems({
  value,
  editable,
  onSave,
  title,
  actions,
}: {
  readonly value: unknown;
  readonly editable: boolean;
  readonly onSave: (items: Record<string, unknown>[]) => Promise<void>;
  /** The heading, 配置清单 unless the page names the list otherwise. */
  readonly title?: ReactNode;
  /** More of the heading's buttons, before 编辑. */
  readonly actions?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const stored = parseKitItems(value);
  // An empty kit opens in the editor: its only use is to be filled.
  const [editing, setEditing] = useState(() => editable && stored.length === 0);
  const [rows, setRows] = useState<KitItem[]>(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const shown = editing ? rows : stored;
  const names = useReferenceNames(
    TYPES.map((type) => ({
      collection: COLLECTION[type],
      ids: shown.filter((row) => row.type === type).map((row) => row.id),
    })),
  );
  const kindOf = useItemKinds(stored);
  // A row being edited says its asset type once chosen; a stored one reads
  // it from its model, category or product.
  const rowKind = (row: KitItem) => row.kind ?? kindOf(row);
  const nameOf = (item: KitItem) =>
    (item.id && names[COLLECTION[item.type]]?.get(item.id)) || item.id || '';
  const update = (index: number, patch: Partial<KitItem>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  const incomplete = rows.some((row) => !row.id);

  const save = async () => {
    if (incomplete) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(serializeKitItems(rows));
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className='py-0'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex min-h-9 items-center justify-between gap-3 border-b border-border/60 pb-2'>
          <h2 className='font-heading text-sm font-semibold'>
            {title ?? t('onboardingKits.items')}
          </h2>
          <span className='flex-1' />
          {!editing ? actions : null}
          {editable && !editing ? (
            <Button
              size='sm'
              variant='outline'
              className='shrink-0'
              onClick={() => {
                setRows(
                  parseKitItems(value).map((row) => ({
                    ...row,
                    kind: kindOf(row),
                  })),
                );
                setError(undefined);
                setAttempted(false);
                setEditing(true);
              }}
            >
              <Pencil data-icon='inline-start' />
              {t('actions.edit')}
            </Button>
          ) : null}
        </div>

        {!editing ? (
          stored.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('onboardingKits.noItems')}
            </p>
          ) : (
            <ul className='divide-y divide-border/60 text-sm'>
              {stored.map((item, index) => {
                const kind = kindOf(item);
                return (
                  <li
                    // Positional: the list has no ids of its own.
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
                    key={index}
                    className='flex items-center gap-2 py-2'
                  >
                    {/* What kind of asset it is leads the row, the way the
                        lists tag a record; the tag carries its own icon. */}
                    {kind ? (
                      <AssetTypeBadge value={kind} className='shrink-0' />
                    ) : (
                      <Icon type={item.type} />
                    )}
                    <span className='min-w-0 flex-1 truncate'>
                      {nameOf(item)}
                      {item.type === 'category' ? (
                        <span className='ml-1.5 text-xs text-muted-foreground'>
                          {t('onboardingKits.anyModel')}
                        </span>
                      ) : null}
                    </span>
                    <span className='shrink-0 text-muted-foreground tabular-nums'>
                      ×{item.quantity}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className='space-y-2'>
            {rows.map((row, index) => (
              <div
                // eslint-disable-next-line @eslint-react/no-array-index-key -- positional rows being edited
                key={index}
                className='flex flex-wrap items-start gap-2'
              >
                {/* The asset type first, then what of it: a model of that
                    type, or a software product for 授权. A row stored as a
                    whole category keeps its category. */}
                <Select
                  items={KINDS.map((kind) => ({
                    value: kind,
                    label: t(`enums.appliesTo.${kind}`),
                  }))}
                  value={rowKind(row) ?? null}
                  onValueChange={(next) =>
                    update(index, {
                      kind: String(next),
                      type:
                        next === 'entitlement' ? 'softwareProduct' : 'model',
                      id: null,
                    })
                  }
                >
                  <SelectTrigger
                    className='w-24 shrink-0'
                    aria-label={t('onboardingKits.assetType')}
                  >
                    <SelectValue placeholder={t('onboardingKits.assetType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {t(`enums.appliesTo.${kind}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className='min-w-40 flex-1'>
                  <ReferenceSelect
                    reference={{
                      collection: COLLECTION[row.type],
                      ...(row.type !== 'softwareProduct' && rowKind(row)
                        ? { filter: { appliesTo: String(rowKind(row)) } }
                        : {}),
                    }}
                    value={row.id}
                    onChange={(next) => update(index, { id: next })}
                    placeholder={t(`onboardingKits.pick.${row.type}`)}
                  />
                  {attempted && !row.id ? (
                    <p className='mt-1 text-xs text-destructive'>
                      {t('onboardingKits.itemRequired')}
                    </p>
                  ) : null}
                </div>
                <Input
                  type='number'
                  min={1}
                  max={100}
                  aria-label={t('onboardingKits.quantity')}
                  className='w-20 shrink-0'
                  value={row.quantity}
                  onChange={(event) =>
                    update(index, {
                      quantity: Math.min(
                        100,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    })
                  }
                />
                <Button
                  size='icon'
                  variant='ghost'
                  aria-label={t('actions.remove')}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { type: 'model', id: null, quantity: 1, kind: 'device' },
                ])
              }
            >
              <Plus data-icon='inline-start' />
              {t('onboardingKits.addItem')}
            </Button>
            {error ? <p className='text-sm text-destructive'>{error}</p> : null}
            <div className='flex justify-end gap-2 border-t border-border/60 pt-3'>
              <Button
                variant='outline'
                disabled={saving}
                onClick={() => {
                  setRows(parseKitItems(value));
                  setEditing(false);
                }}
              >
                {t('actions.cancel')}
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {t('actions.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
