import { useTranslation } from '@nocobase/i18n/client';
import { Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { InfoRow, InfoSection } from '@/components/itam/detail-page';
import { templateOf, type TemplateField } from '@/lib/itam/field-template';
import { InlineField } from '@/components/itam/inline-field';
import { Switch } from '@/components/ui/switch';
import { masterDataPath, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';
import { attributesOf, isBlank } from '@/lib/itam/model-attributes';

/**
 * The extended fields a record's category defines, read from
 * `categories.fieldTemplate` and stored in `attributes`.
 *
 * Every asset type has them, not only devices: a category carries a template
 * whatever it applies to, and stock items and entitlements gained the same
 * `attributes` document on 2026-09-28. A category that defines none renders
 * nothing at all — an empty 扩展字段 heading says less than no heading.
 *
 * A field the template keeps on the model (`scope: 'model'`, 2026-10-06) is
 * filled on the model page (`of: 'model'` shows only those) and read by the
 * model's devices and stock items, which show it as the model's until they
 * state their own: typing a value there records that this one differs, and
 * 改回型号 — or saving the model's own value, or nothing — drops it again.
 */
export function ExtendedFields({
  record,
  editable,
  onSave,
  of = 'record',
}: {
  readonly record: ItamRecord;
  readonly editable: boolean;
  readonly onSave: (attributes: Record<string, unknown>) => Promise<void>;
  /** `model`: the record is a model, showing the fields its devices share. */
  readonly of?: 'record' | 'model';
}): ReactElement | null {
  const { t } = useTranslation();
  const [showHidden, setShowHidden] = useState(false);
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    record.categoryId ? text(record.categoryId) : undefined,
  );
  const template = templateOf(category.data?.fieldTemplate);
  const full =
    of === 'model'
      ? template.filter((entry) => entry.scope === 'model')
      : template;
  const inherits =
    of === 'record' &&
    Boolean(record.modelId) &&
    full.some((entry) => entry.scope === 'model');
  const model = useItamRecord<ItamRecord>(
    masterDataPath('models'),
    inherits ? text(record.modelId) : undefined,
  );
  if (full.length === 0) return null;
  // Hidden template fields stay out of the way unless the reader asks.
  const hiddenCount = full.filter((entry) => entry.hidden).length;
  const shown = showHidden ? full : full.filter((entry) => !entry.hidden);
  const own = attributesOf(record.attributes);
  const shared = inherits ? attributesOf(model.data?.attributes) : {};
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
        const fromModel = inherits && entry.scope === 'model';
        return (
          <ExtendedFieldRow
            key={entry.key}
            entry={entry}
            own={own}
            inherited={fromModel ? shared[entry.key] : undefined}
            fromModel={fromModel}
            editable={editable}
            onSave={onSave}
          />
        );
      })}
    </InfoSection>
  );
}

function ExtendedFieldRow({
  entry,
  own,
  inherited,
  fromModel,
  editable,
  onSave,
}: {
  readonly entry: TemplateField;
  readonly own: Readonly<Record<string, unknown>>;
  /** The model's value, for a field the record reads from its model. */
  readonly inherited: unknown;
  readonly fromModel: boolean;
  readonly editable: boolean;
  readonly onSave: (attributes: Record<string, unknown>) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const field: FieldDefinition = {
    key: entry.key,
    label: entry.label,
    type: entry.type,
    required: entry.required,
    options: entry.options?.map((option) => ({ value: option, label: option })),
  };
  // A value the same as the model's says nothing of its own: it reads as
  // the model's (devices entered before the field moved to the model carry
  // such copies).
  const stated =
    !isBlank(own[entry.key]) &&
    !(fromModel && sameValue(own[entry.key], inherited));
  const value = stated ? own[entry.key] : fromModel ? inherited : undefined;
  const without = () => {
    const next = { ...own };
    delete next[entry.key];
    return next;
  };
  const show = (shown: unknown) =>
    shown === true
      ? t('common.yes')
      : shown === false
        ? t('common.no')
        : text(shown);
  return (
    <InfoRow
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
          <span className='inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5'>
            {isBlank(value) ? (
              <span className='text-muted-foreground'>—</span>
            ) : (
              <span>{show(value)}</span>
            )}
            {fromModel && !stated && !isBlank(inherited) ? (
              <span className='text-xs text-muted-foreground'>
                {t('extendedFields.fromModel')}
              </span>
            ) : null}
            {fromModel && stated ? (
              <span className='text-xs text-muted-foreground'>
                {isBlank(inherited)
                  ? t('extendedFields.ownValue')
                  : t('extendedFields.modelSays', { value: show(inherited) })}
              </span>
            ) : null}
            {fromModel && stated && editable && !entry.hidden ? (
              <button
                type='button'
                className='inline-flex items-center gap-0.5 text-xs text-info-foreground hover:underline'
                onClick={(event) => {
                  // The row opens its editor on a click; this one only
                  // drops the record's own value.
                  event.stopPropagation();
                  void onSave(without());
                }}
              >
                <Undo2 className='size-3' />
                {t('extendedFields.useModel')}
              </button>
            ) : null}
          </span>
        }
        onSave={(next) =>
          // Nothing, or the model's own value, is no value of the record's:
          // it goes on reading the model.
          fromModel && (isBlank(next) || sameValue(next, inherited))
            ? onSave(without())
            : onSave({ ...own, [entry.key]: next })
        }
      />
    </InfoRow>
  );
}

/** The same answer, however it was typed: `14` and `'14'` are one value. */
const sameValue = (value: unknown, model: unknown): boolean =>
  !isBlank(model) && String(value) === String(model);
