import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { ReferenceSelect } from '@/components/itam/reference-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type Mode = 'vendor' | 'other';

/**
 * Who receives the devices: a vendor on the books, or anyone else by name.
 * One recipient, asked as one question — the reader says which kind it is
 * and answers once, instead of meeting two fields and having to work out
 * that only one of them may be filled in.
 */
export function RecipientInput({
  id,
  vendorId,
  name,
  labelled = true,
  onChange,
}: {
  readonly id: string;
  readonly vendorId: string | null;
  readonly name: string;
  /** False where the row already carries the label (the record's own card). */
  readonly labelled?: boolean;
  readonly onChange: (value: {
    readonly vendorId: string | null;
    readonly name: string;
  }) => void;
}): ReactElement {
  const { t } = useTranslation();
  // What is already answered decides the starting kind; after that the
  // reader's choice stands, so switching to 其他 does not jump back the
  // moment the name is emptied.
  const [mode, setMode] = useState<Mode>(name ? 'other' : 'vendor');
  return (
    <div className='grid gap-1.5'>
      {labelled ? <Label>{t('fields.recipient')}</Label> : null}
      <RadioGroup
        value={mode}
        onValueChange={(value: unknown) => {
          if (value !== 'vendor' && value !== 'other') return;
          setMode(value);
          // The other kind's answer goes with it: a record names one
          // recipient.
          onChange({ vendorId: null, name: '' });
        }}
        className='flex flex-wrap gap-x-6 gap-y-2'
      >
        {(['vendor', 'other'] as const).map((value) => (
          <Label
            key={value}
            htmlFor={`${id}-${value}`}
            className='flex items-center gap-2 font-normal'
          >
            <RadioGroupItem value={value} id={`${id}-${value}`} />
            {t(value === 'vendor' ? 'fields.vendor' : 'common.other')}
          </Label>
        ))}
      </RadioGroup>
      {mode === 'vendor' ? (
        <ReferenceSelect
          id={id}
          reference={{ collection: 'vendors' }}
          value={vendorId}
          onChange={(value) =>
            onChange({ vendorId: value ? String(value) : null, name: '' })
          }
        />
      ) : (
        <Input
          id={id}
          value={name}
          onChange={(event) =>
            onChange({ vendorId: null, name: event.target.value })
          }
        />
      )}
    </div>
  );
}
