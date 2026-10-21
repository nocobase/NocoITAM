import { useTranslation } from '@nocobase/i18n/client';
import { Check } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/**
 * What a diagnosis made of the person's own words (2026-10-20): their
 * description tidied for the record — every fact they gave, nothing
 * added — offered beside the diagnosis, and put in the field only when they
 * choose to. Until then what they wrote stands.
 */
export function TidiedDescription({
  label,
  text,
  onApply,
}: {
  /** What it is: 整理后的故障描述 / 整理后的说明. */
  readonly label: string;
  readonly text: string;
  readonly onApply: (text: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [applied, setApplied] = useState(false);
  return (
    <div className='space-y-1 border-t border-border/60 pt-2'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-xs font-medium text-muted-foreground'>
          {label}
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={applied}
          onClick={() => {
            onApply(text);
            setApplied(true);
          }}
        >
          {applied ? <Check data-icon='inline-start' /> : null}
          {t(applied ? 'common.applied' : 'common.apply')}
        </Button>
      </div>
      <p className='whitespace-pre-wrap'>{text}</p>
    </div>
  );
}
