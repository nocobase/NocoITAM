import { isAssetTypeField } from '@/lib/itam/fields';
import { AssetTypeBadge } from './asset-type-badge.js';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldDefinition } from '@/lib/itam/fields';
import { cn } from '@/lib/utils';

import { ReferenceSelect } from './reference-select.js';

const ALL = '__all__';

/**
 * One dropdown per filterable field, beside the search box. Values live in
 * the URL under the field key, so a filtered list is shareable.
 */
export function MasterDataFilters({
  fields,
  value,
  onChange,
}: {
  readonly fields: readonly FieldDefinition[];
  readonly value: Readonly<Record<string, string | undefined>>;
  readonly onChange: (key: string, next: string | undefined) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (fields.length === 0) return null;
  return (
    <>
      {fields.map((field) =>
        field.type === 'reference' && field.reference ? (
          <ReferenceSelect
            key={field.key}
            reference={field.reference}
            value={value[field.key] ?? null}
            onChange={(next) => onChange(field.key, next ?? undefined)}
            placeholder={t(field.label)}
            className='w-44'
          />
        ) : (
          <Select
            key={field.key}
            items={[
              { value: ALL, label: t(field.label) },
              ...(field.options ?? []).map((option) => ({
                value: option.value,
                label: t(option.label),
              })),
            ]}
            value={value[field.key] ?? ALL}
            onValueChange={(next) =>
              onChange(field.key, next === ALL ? undefined : String(next))
            }
          >
            <SelectTrigger
              // Same footprint and unset look as the reference pickers.
              className={cn(
                'w-44 font-normal',
                !value[field.key] && 'text-muted-foreground',
              )}
              aria-label={t(field.label)}
            >
              <SelectValue>
                {isAssetTypeField(field) && value[field.key] ? (
                  <AssetTypeBadge value={value[field.key]} />
                ) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t('common.allOf', { field: t(field.label) })}
              </SelectItem>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {isAssetTypeField(field) ? (
                    <AssetTypeBadge value={option.value} />
                  ) : (
                    t(option.label)
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      )}
    </>
  );
}
