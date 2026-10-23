import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { dayPickerLocale } from '@/lib/itam/day-picker-locale';
import { DatePicker } from '#components/date-picker';

/**
 * A date picked from the application's calendar, in the reader's language
 * (2026-10-16): what the dialogs and filters that had a native date input —
 * an English calendar unlike every form's — use instead. `required` leaves
 * out the clear button.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  required = false,
  className = 'w-full',
}: {
  readonly id?: string;
  /** `yyyy-mm-dd`, or empty. */
  readonly value: string | null | undefined;
  readonly onChange: (value: string | null) => void;
  /** The earliest day that may be picked, `yyyy-mm-dd`. */
  readonly min?: string;
  readonly required?: boolean;
  readonly className?: string;
}): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <DatePicker
      id={id}
      className={className}
      value={value ? value.slice(0, 10) : undefined}
      onChange={onChange}
      min={min}
      locale={dayPickerLocale(i18n.language)}
      placeholder={t('common.pickDate')}
      clearLabel={required ? undefined : t('common.clearDate')}
    />
  );
}
