import { dayPickerLocale } from '@/lib/itam/day-picker-locale';
import { isAssetTypeField } from '@/lib/itam/fields';
import { AssetTypeBadge } from './asset-type-badge.js';
import { useTranslation } from '@nocobase/i18n/client';
import { X } from 'lucide-react';
import type { PointerEvent, ReactElement } from 'react';

import { DatePicker } from '#components/date-picker';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useItamSettings, type ItamRecord } from '@/lib/itam/api';
import { CURRENCIES } from '@/lib/itam/currencies';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';

import { PositionSelect } from './position-select.js';
import { RecipientInput } from './recipient-input.js';
import { ReferenceSelect } from './reference-select.js';

export interface FieldInputProps {
  readonly field: FieldDefinition;
  readonly value: unknown;
  readonly onChange: (value: unknown, record?: ItamRecord) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly excludeId?: string;
  readonly id?: string;
  readonly onBlur?: () => void;
  /** A selection control closed its list (or lost focus) without a change. */
  readonly onDismiss?: () => void;
  /** A reference's list ends in 创建… for a record the books lack. */
  readonly onCreate?: (search: string) => void;
  readonly createLabel?: string;
}

/** One editable control per field type; forms and inline editing share it. */
/**
 * A field whose placeholder names a setting reads that setting first and
 * passes it the value; every other field renders as it is.
 */
export function FieldInput(props: FieldInputProps): ReactElement {
  return props.field.placeholderSetting ? (
    <SettingPlaceholder {...props} />
  ) : (
    <FieldControl {...props} />
  );
}

function SettingPlaceholder(props: FieldInputProps): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const { placeholderSetting: setting, ...field } = props.field;
  const value = setting ? settings.data?.thresholds[setting] : undefined;
  return (
    <FieldControl
      {...props}
      field={{
        ...field,
        placeholder:
          field.placeholder && value !== undefined
            ? t(field.placeholder, { value })
            : undefined,
      }}
    />
  );
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
  autoFocus,
  excludeId,
  id,
  onBlur,
  onDismiss,
  onCreate,
  createLabel,
}: FieldInputProps): ReactElement {
  const { t, i18n } = useTranslation();
  const inputId = id ?? `field-${field.key}`;
  // A placeholder is a translation key, the way the label is; a caller that
  // passes text already translated gets it back unchanged.
  const placeholder = field.placeholder ? t(field.placeholder) : undefined;

  if (field.positionOf)
    return (
      <PositionSelect
        id={inputId}
        departmentId={field.department}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onDismiss={onDismiss}
      />
    );

  switch (field.type) {
    case 'textarea':
      return (
        <Textarea
          id={inputId}
          value={text(value)}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
          autoFocus={autoFocus}
          onBlur={onBlur}
          rows={3}
        />
      );
    case 'percent': {
      const shown =
        value === null || value === undefined || value === ''
          ? ''
          : String(Math.round(Number(value) * 10000) / 100);
      return (
        <div className='relative'>
          <Input
            id={inputId}
            type='number'
            inputMode='decimal'
            min={0}
            max={100}
            step={field.step ?? 1}
            value={shown}
            className='pr-7'
            onChange={(event) =>
              onChange(
                event.target.value === ''
                  ? null
                  : Number(event.target.value) / 100,
              )
            }
            disabled={disabled}
            autoFocus={autoFocus}
            onBlur={onBlur}
          />
          <span className='pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground'>
            %
          </span>
        </div>
      );
    }
    case 'money':
    case 'number': {
      if (
        field.type === 'money' &&
        field.currencyField &&
        typeof value === 'object' &&
        value !== null
      ) {
        // Amount and currency side by side (the detail page passes the
        // pair; a form passes the bare amount); leaving the pair commits once.
        const pair = value as { amount?: unknown; currency?: unknown };
        const current = text(pair.currency);
        const currencies = [
          ...(current && !CURRENCIES.includes(current) ? [current] : []),
          ...CURRENCIES,
        ].map((code) => ({ value: code, label: code }));
        return (
          <div
            className='flex gap-2'
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                onBlur?.();
            }}
          >
            <Select
              items={currencies}
              value={current || null}
              onValueChange={(next) =>
                onChange({ ...pair, currency: next ?? null })
              }
              disabled={disabled}
            >
              <SelectTrigger className='w-28' aria-label={t('fields.currency')}>
                <SelectValue placeholder='CNY' />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={inputId}
              type='number'
              inputMode='decimal'
              min={field.min}
              max={field.max}
              step={field.step ?? 0.01}
              value={text(pair.amount)}
              onChange={(event) =>
                onChange({
                  ...pair,
                  amount:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
              disabled={disabled}
              autoFocus={autoFocus}
            />
          </div>
        );
      }
      return (
        <Input
          id={inputId}
          type='number'
          inputMode='decimal'
          placeholder={placeholder}
          min={field.min}
          max={field.max}
          step={field.step ?? (field.type === 'money' ? 0.01 : 1)}
          value={text(value)}
          onChange={(event) =>
            onChange(
              event.target.value === '' ? null : Number(event.target.value),
            )
          }
          disabled={disabled}
          autoFocus={autoFocus}
          onBlur={onBlur}
        />
      );
    }
    case 'date':
      // A day picked from a calendar, not a native date input, as NocoCRM
      // edits one. Picking closes the calendar and is the change, so an
      // inline editor saves on it as it does on a select; closing without
      // a pick is a dismissal. An optional date clears under the calendar.
      return (
        <DatePicker
          id={inputId}
          className='w-full'
          value={value ? text(value).slice(0, 10) : undefined}
          onChange={(next) => onChange(next)}
          disabled={disabled}
          defaultOpen={autoFocus}
          locale={dayPickerLocale(i18n.language)}
          placeholder={placeholder ?? t('common.pickDate')}
          clearLabel={field.required ? undefined : t('common.clearDate')}
          onOpenChange={(open) => {
            if (!open) {
              onDismiss?.();
              onBlur?.();
            }
          }}
        />
      );
    case 'boolean':
      if (field.control === 'select') {
        const items = [
          { value: 'true', label: t('common.yes') },
          { value: 'false', label: t('common.no') },
        ];
        return (
          <Select
            items={items}
            value={
              value === null || value === undefined
                ? null
                : String(Boolean(value))
            }
            onValueChange={(next) => onChange(next === 'true')}
            disabled={disabled}
            defaultOpen={autoFocus}
            onOpenChange={(open) => {
              if (!open) onDismiss?.();
            }}
          >
            <SelectTrigger id={inputId} className='w-full' onBlur={onBlur}>
              <SelectValue placeholder={t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      return (
        <div className='flex h-8 items-center'>
          <Switch
            id={inputId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}
            autoFocus={autoFocus}
            onBlur={onDismiss}
          />
        </div>
      );
    case 'currency': {
      // The codes the application offers, plus whatever this record already
      // holds, so an older or hand-entered code is never silently dropped.
      const current = text(value);
      const items = [
        ...(current && !CURRENCIES.includes(current) ? [current] : []),
        ...CURRENCIES,
      ].map((item) => ({ value: item, label: item }));
      return (
        <Select
          items={items}
          value={current || null}
          onValueChange={(next) => onChange(next === null ? null : next)}
          disabled={disabled}
          defaultOpen={autoFocus}
          onOpenChange={(open) => {
            if (!open) onDismiss?.();
          }}
        >
          <SelectTrigger id={inputId} className='w-full' onBlur={onBlur}>
            <SelectValue placeholder={t('common.select')} />
            {!field.required && current && !disabled ? (
              <X
                className='size-3.5 opacity-60 hover:opacity-100'
                aria-label={t('common.clear')}
                onPointerDown={(event: PointerEvent<SVGSVGElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(null);
                }}
              />
            ) : null}
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'select': {
      // A cascading answer edits both halves at once, so 已清除 is never
      // saved without the method it calls for.
      if (field.dependent) {
        const dependent = field.dependent;
        const pair = (value ?? {}) as { value?: unknown; dependent?: unknown };
        const main = { ...field, dependent: undefined };
        return (
          <div
            className='grid gap-3'
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                onBlur?.();
            }}
          >
            <FieldInput
              id={inputId}
              field={main}
              value={pair.value}
              disabled={disabled}
              autoFocus={autoFocus}
              onChange={(next) =>
                onChange({
                  value: next,
                  // An answer that asks for nothing carries nothing.
                  dependent: dependent.when(next) ? pair.dependent : null,
                })
              }
            />
            {dependent.when(pair.value) ? (
              <div className='grid gap-1.5'>
                <Label htmlFor={`${inputId}-dependent`}>
                  {t(dependent.label)}
                  {dependent.required ? (
                    <span className='text-destructive'> *</span>
                  ) : null}
                </Label>
                <FieldInput
                  id={`${inputId}-dependent`}
                  field={{
                    key: dependent.key,
                    label: dependent.label,
                    type: 'select',
                    options: dependent.options,
                    required: dependent.required,
                  }}
                  value={pair.dependent}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange({ value: pair.value, dependent: next })
                  }
                />
              </div>
            ) : null}
          </div>
        );
      }
      // Only the answers. Emptying an optional choice is the clear beside
      // the control, not an answer called "none" sitting among them.
      const items = (field.options ?? []).map((option) => ({
        value: option.value,
        label: t(option.label),
      }));
      const clearable = !field.required && Boolean(value) && !disabled;
      return (
        <Select
          items={items}
          value={value ? text(value) : null}
          onValueChange={(next) => onChange(next === null ? null : next)}
          disabled={disabled}
          defaultOpen={autoFocus}
          onOpenChange={(open) => {
            if (!open) onDismiss?.();
          }}
        >
          <SelectTrigger id={inputId} className='w-full' onBlur={onBlur}>
            <SelectValue placeholder={t('common.select')}>
              {isAssetTypeField(field) && value ? (
                <AssetTypeBadge value={value} />
              ) : undefined}
            </SelectValue>
            {clearable ? (
              <X
                className='size-3.5 opacity-60 hover:opacity-100'
                aria-label={t('common.clear')}
                onPointerDown={(event: PointerEvent<SVGSVGElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(null);
                }}
              />
            ) : null}
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {isAssetTypeField(field) ? (
                  <AssetTypeBadge value={item.value} />
                ) : (
                  item.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'multiselect': {
      // A dropdown that keeps several (2026-10-21; a grid of checkboxes
      // until then): what is chosen reads as a tag each in the field.
      const current = Array.isArray(value) ? value.map(text) : [];
      const items = (field.options ?? []).map((option) => ({
        value: option.value,
        label: t(option.label),
      }));
      return (
        <Select
          multiple
          items={items}
          value={current}
          onValueChange={(next) => onChange([...next])}
          disabled={disabled}
          defaultOpen={autoFocus}
          onOpenChange={(open) => {
            if (!open) onDismiss?.();
          }}
        >
          <SelectTrigger
            id={inputId}
            className='w-full data-[size=default]:h-auto data-[size=default]:min-h-8'
            onBlur={onBlur}
          >
            <SelectValue placeholder={t('common.select')}>
              {current.length > 0 ? (
                <span className='flex flex-wrap gap-1'>
                  {current.map((entry) => (
                    <Badge key={entry} variant='outline'>
                      {items.find((item) => item.value === entry)?.label ??
                        entry}
                    </Badge>
                  ))}
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'reference': {
      // A reference that may be answered with free text instead edits the
      // pair: which kind of answer, and the answer itself.
      if (field.alternateField) {
        const pair = (value ?? {}) as { vendorId?: unknown; name?: unknown };
        return (
          <RecipientInput
            id={inputId}
            labelled={false}
            vendorId={pair.vendorId ? text(pair.vendorId) : null}
            name={text(pair.name)}
            onChange={onChange}
          />
        );
      }
      return (
        <ReferenceSelect
          id={inputId}
          reference={field.reference ?? { collection: '' }}
          value={value ? text(value) : null}
          onChange={onChange}
          disabled={disabled}
          excludeId={excludeId}
          defaultOpen={autoFocus}
          onOpenChange={(open) => {
            if (!open) onDismiss?.();
          }}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      );
    }
    default:
      return (
        <Input
          id={inputId}
          value={text(value)}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : event.target.value)
          }
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onBlur={onBlur}
        />
      );
  }
}
