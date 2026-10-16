import { useTranslation } from '@nocobase/i18n/client';
import { Save } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorBody } from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';

/**
 * What the settings tabs that edit ITAM's settings documents share: the card
 * a document is edited on, and a number with what it decides. Saving one
 * is `useSave` (use-settings-save.ts).
 */
export function SettingsCard({
  title,
  description,
  children,
  onSave,
  saving,
  error,
  saved,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactElement | ReactElement[];
  readonly onSave: () => void;
  readonly saving: boolean;
  readonly error: unknown;
  readonly saved: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className='space-y-4'>
        {children}
        <div className='flex items-center gap-3'>
          <Button disabled={saving} onClick={onSave}>
            <Save data-icon='inline-start' />
            {t('actions.save')}
          </Button>
          {error ? (
            <span className='text-sm text-destructive'>
              {apiErrorBody(error)?.message ?? errorMessage(error)}
            </span>
          ) : saved ? (
            <span className='text-sm text-muted-foreground'>
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly step?: number;
  /** What the number decides, in a line. A threshold's name rarely says. */
  readonly hint?: string;
}): ReactElement {
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='number'
        step={step ?? 1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
    </div>
  );
}
