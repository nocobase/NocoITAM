import { useTranslation } from '@nocobase/i18n/client';
import { AppWindow, FolderTree, Package, Pencil, Plus, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import { useReferenceNames } from '@/lib/itam/references';

import { ReferenceSelect } from './reference-select.js';

/**
 * A kit's items: each a model, a category (any model in it) or a software
 * product, with how many (入职配置, 2026-10-05). Shown beside the kit's
 * information card the way a category's field template is, and saved as the
 * kit's one `items` list.
 */
const TYPES: readonly KitItemType[] = ['model', 'category', 'softwareProduct'];
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

export function KitItems({
  value,
  editable,
  onSave,
}: {
  readonly value: unknown;
  readonly editable: boolean;
  readonly onSave: (items: Record<string, unknown>[]) => Promise<void>;
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
            {t('onboardingKits.items')}
          </h2>
          {editable && !editing ? (
            <Button
              size='sm'
              variant='outline'
              className='shrink-0'
              onClick={() => {
                setRows(parseKitItems(value));
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
                const Icon = ICON[item.type];
                return (
                  <li
                    // Positional: the list has no ids of its own.
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
                    key={index}
                    className='flex items-center gap-2 py-2'
                  >
                    <Icon
                      aria-hidden='true'
                      className='size-4 shrink-0 text-muted-foreground'
                    />
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
                <Select
                  items={TYPES.map((type) => ({
                    value: type,
                    label: t(`onboardingKits.types.${type}`),
                  }))}
                  value={row.type}
                  onValueChange={(next) =>
                    update(index, { type: next as KitItemType, id: null })
                  }
                >
                  <SelectTrigger className='w-28 shrink-0'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`onboardingKits.types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className='min-w-40 flex-1'>
                  <ReferenceSelect
                    reference={{ collection: COLLECTION[row.type] }}
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
                  { type: 'model', id: null, quantity: 1 },
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
