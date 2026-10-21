import { useTranslation } from '@nocobase/i18n/client';
import { X } from 'lucide-react';
import type { ReactElement } from 'react';

import { ReferenceSelect } from '@/components/itam/reference-select';
import { Badge } from '@/components/ui/badge';
import type { ReferenceTarget } from '@/lib/itam/fields';
import { useReferenceNames } from '@/lib/itam/references';

/** Several records of one collection: chips plus a search to add more. */
export function MultiReferenceInput({
  reference,
  value,
  onChange,
  id,
  disabled,
}: {
  readonly reference: ReferenceTarget;
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
  readonly id?: string;
  readonly disabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const names = useReferenceNames([
    { collection: reference.collection, ids: value },
  ]);
  return (
    <div className='space-y-2'>
      {value.length > 0 ? (
        <div className='flex flex-wrap gap-1.5'>
          {value.map((item) => (
            <Badge key={item} variant='secondary' className='gap-1 pr-1'>
              {/* Loaded but absent means the record is gone; `…` for both
                  would read as a load that never finishes. */}
              {names[reference.collection]
                ? (names[reference.collection]?.get(item) ??
                  t('common.missingRecord'))
                : '…'}
              {disabled ? null : (
                <button
                  type='button'
                  className='rounded-sm hover:bg-muted-foreground/20'
                  aria-label={t('actions.remove')}
                  onClick={() => onChange(value.filter((v) => v !== item))}
                >
                  <X className='size-3' />
                </button>
              )}
            </Badge>
          ))}
        </div>
      ) : null}
      <ReferenceSelect
        id={id}
        reference={reference}
        value={null}
        disabled={disabled}
        placeholder={t('common.addItem')}
        onChange={(next) => {
          if (next && !value.includes(next)) onChange([...value, next]);
        }}
      />
    </div>
  );
}
