import { CalendarIcon, XIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import type { Locale } from 'react-day-picker';

import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * A date picked from a calendar, as shadcn's Date Picker guide composes it
 * and NocoCRM's record pages edit one: an outline button showing the date
 * opens the Calendar in a Popover. The value is a calendar day,
 * `yyyy-mm-dd`, with no zone — what every date field stores.
 */
export interface DatePickerProps {
  readonly id?: string;
  /** `yyyy-mm-dd`, or empty. */
  readonly value: string | undefined;
  readonly onChange: (value: string | null) => void;
  readonly locale?: Locale;
  readonly placeholder?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly 'aria-label'?: string;
  /** Told when the calendar opens and closes. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Open from the start (an editor opened by a double-click). */
  readonly defaultOpen?: boolean;
  /**
   * Offers to clear a date that is set, under the calendar; leave it out
   * where a date is required.
   */
  readonly clearLabel?: string;
  /**
   * The earliest day that may be picked, `yyyy-mm-dd` (ITAM, 2026-10-16:
   * a loan's return date, which the native date inputs it replaced bounded
   * with `min`).
   */
  readonly min?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  locale,
  placeholder,
  className,
  disabled,
  'aria-label': ariaLabel,
  onOpenChange,
  defaultOpen = false,
  clearLabel,
  min,
}: DatePickerProps): ReactElement {
  const earliest = localDay(min);
  const [open, setOpen] = useState(defaultOpen);
  const day = localDay(value);
  const close = (): void => {
    setOpen(false);
    onOpenChange?.(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type='button'
            variant='outline'
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'justify-start font-normal',
              !day && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <CalendarIcon />
        {day ? isoDay(day) : placeholder}
      </PopoverTrigger>
      <PopoverContent className='w-auto gap-0 p-0' align='start'>
        <Calendar
          mode='single'
          selected={day}
          defaultMonth={day}
          locale={locale}
          {...(earliest ? { disabled: { before: earliest } } : {})}
          onSelect={(picked) => {
            onChange(picked ? isoDay(picked) : null);
            close();
          }}
        />
        {clearLabel && day ? (
          <div className='border-t p-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='w-full'
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              <XIcon data-icon='inline-start' />
              {clearLabel}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** A `yyyy-mm-dd` value as that day on the local calendar. */
function localDay(value: string | undefined): Date | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : undefined;
}

/** A local day as `yyyy-mm-dd` (never through UTC, which is a day off east of it). */
function isoDay(day: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
