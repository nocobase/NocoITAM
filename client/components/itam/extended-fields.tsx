import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { InfoRow, InfoSection } from '@/components/itam/detail-page';
import type { TemplateField } from '@/components/itam/field-template-editor';
import { InlineField } from '@/components/itam/inline-field';
import { Switch } from '@/components/ui/switch';
import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';

/**
 * The extended fields a record's category defines, read from
 * `categories.fieldTemplate` and stored in the record's own `attributes`.
 *
 * Every asset type has them, not only devices: a category carries a template
 * whatever it applies to, and stock items and entitlements gained the same
 * `attributes` document on 2026-09-28. A category that defines none renders
 * nothing at all — an empty 扩展字段 heading says less than no heading.
 *
 * A model shows the same fields (2026-10-06): what is filled there is the
 * default a new device of the model starts with, copied when the device is
 * created, after which each is edited on its own.
 */
export function ExtendedFields({
  record,
  editable,
  onSave,
}: {
  readonly record: ItamRecord;
  readonly editable: boolean;
  readonly onSave: (attributes: Record<string, unknown>) => Promise<void>;
}): ReactElement | null {
  const { t } = useTranslation();
  const [showHidden, setShowHidden] = useState(false);
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    record.categoryId ? text(record.categoryId) : undefined,
  );
  const full = (
    Array.isArray(category.data?.fieldTemplate)
      ? category.data.fieldTemplate
      : []
  ) as TemplateField[];
  if (full.length === 0) return null;
  // Hidden template fields stay out of the way unless the reader asks.
  const hiddenCount = full.filter((entry) => entry.hidden).length;
  const shown = showHidden ? full : full.filter((entry) => !entry.hidden);
  const attributes = (
    record.attributes && typeof record.attributes === 'object'
      ? record.attributes
      : {}
  ) as Record<string, unknown>;
  return (
    <InfoSection
      title={t('groups.extended')}
      action={
        hiddenCount > 0 ? (
          <label className='flex items-center gap-2 text-xs text-muted-foreground'>
            {t('devices.showHiddenFields', { count: hiddenCount })}
            <Switch
              checked={showHidden}
              onCheckedChange={setShowHidden}
              aria-label={t('devices.showHiddenFields', { count: hiddenCount })}
            />
          </label>
        ) : undefined
      }
    >
      {shown.map((entry) => {
        const field: FieldDefinition = {
          key: entry.key,
          label: entry.label,
          type: entry.type,
          required: entry.required,
          options: entry.options?.map((option) => ({
            value: option,
            label: option,
          })),
        };
        const value = attributes[entry.key];
        return (
          <InfoRow
            key={entry.key}
            label={
              entry.hidden ? (
                <span className='text-muted-foreground line-through'>
                  {entry.label}
                </span>
              ) : (
                entry.label
              )
            }
          >
            <InlineField
              field={field}
              value={value}
              editable={editable && !entry.hidden}
              display={
                <span>
                  {value === undefined || value === null || value === '' ? (
                    <span className='text-muted-foreground'>—</span>
                  ) : (
                    text(value)
                  )}
                </span>
              }
              onSave={(next) => onSave({ ...attributes, [entry.key]: next })}
            />
          </InfoRow>
        );
      })}
    </InfoSection>
  );
}
