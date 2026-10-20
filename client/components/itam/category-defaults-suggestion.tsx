import { useTranslation } from '@nocobase/i18n/client';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { apiErrorBody, type ItamRecord } from '@/lib/itam/api';
import {
  CATEGORY_DEFAULT_KEYS as KEYS,
  type CategoryDefaultKey as Key,
  type CategoryDefaults,
} from '@/lib/itam/category-defaults';
import { errorMessage, text } from '@/lib/itam/format';

/**
 * The defaults 建议字段 suggests for a category (2026-10-20): those that
 * differ from what the category holds, current beside suggested, and 采用,
 * which writes them to the category; the fields are saved apart.
 */
export function CategoryDefaultsSuggestion({
  record,
  defaults,
  onApply,
}: {
  readonly record: ItamRecord;
  readonly defaults: CategoryDefaults;
  readonly onApply: (values: CategoryDefaults) => Promise<void>;
}): ReactElement | null {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string>();
  const changed = KEYS.filter(
    (key) =>
      defaults[key] !== undefined &&
      String(defaults[key]) !== (text(record[key]) ?? ''),
  );
  if (changed.length === 0) return null;
  const shown = (key: Key, value: unknown): string => {
    const raw = text(value);
    if (!raw) return '—';
    if (key === 'depreciationMethod')
      return t(`enums.depreciationMethod.${raw}`);
    if (key === 'residualRate')
      return `${String(Math.round(Number(raw) * 1000) / 10)}%`;
    return raw;
  };
  const apply = async () => {
    setState('saving');
    setError(undefined);
    try {
      await onApply(
        Object.fromEntries(changed.map((key) => [key, defaults[key]])),
      );
      setState('done');
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
      setState('idle');
    }
  };
  return (
    <div className='rounded-lg border border-border bg-muted/30 p-3 text-sm'>
      <div className='flex items-center justify-between gap-3'>
        <p className='font-medium'>{t('categories.suggestedDefaults')}</p>
        {state === 'done' ? (
          <span className='inline-flex items-center gap-1 text-muted-foreground'>
            <Check className='size-4' />
            {t('categories.defaultsApplied')}
          </span>
        ) : (
          <Button
            variant='outline'
            disabled={state === 'saving'}
            onClick={() => void apply()}
          >
            {t('categories.applyDefaults')}
          </Button>
        )}
      </div>
      <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1'>
        {changed.map((key) => (
          <div key={key} className='contents'>
            <dt className='text-muted-foreground'>{t(`fields.${key}`)}</dt>
            <dd>
              <span className='text-muted-foreground line-through'>
                {shown(key, record[key])}
              </span>
              <span className='mx-1.5 text-muted-foreground'>→</span>
              <span className='font-medium'>{shown(key, defaults[key])}</span>
            </dd>
          </div>
        ))}
      </dl>
      {error ? (
        <p role='alert' className='mt-2 text-xs text-destructive'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
