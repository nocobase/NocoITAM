import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/itam/format';

export interface EditableTitleProps {
  /** The editable part of the title. */
  readonly value: string;
  /** Fixed text before the editable part, e.g. a device number. */
  readonly prefix?: ReactNode;
  readonly onSave: (value: string) => Promise<void>;
  readonly editable?: boolean;
}

/**
 * A page title that edits in place: one click opens an input in the same
 * type size, Enter or blur saves, Escape cancels. Unlike field rows, the
 * title has nothing to select, so a single click is enough.
 */
export function EditableTitle({
  value,
  prefix,
  onSave,
  editable = true,
}: EditableTitleProps): ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const commit = async () => {
    if (saving) return;
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(next);
      setEditing(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return (
      <h1 className='truncate font-heading text-2xl font-semibold tracking-tight'>
        {prefix ? (
          <>
            <span className='text-muted-foreground'>{prefix}</span>{' '}
          </>
        ) : null}
        {value}
      </h1>
    );
  }

  if (editing) {
    return (
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex items-center gap-2'>
          {prefix ? (
            <span className='shrink-0 font-heading text-2xl font-semibold tracking-tight text-muted-foreground'>
              {prefix}
            </span>
          ) : null}
          <Input
            autoFocus
            value={draft}
            disabled={saving}
            aria-label={t('common.editTitle')}
            className='h-10 w-full max-w-2xl font-heading text-2xl! font-semibold tracking-tight'
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void commit();
              }
              if (event.key === 'Escape') {
                setDraft(value);
                setEditing(false);
              }
            }}
          />
        </div>
        {error ? <p className='text-xs text-destructive'>{error}</p> : null}
      </div>
    );
  }

  return (
    <h1 className='flex min-w-0 flex-1 items-center gap-1.5 font-heading text-2xl font-semibold tracking-tight'>
      {prefix ? (
        <span className='shrink-0 text-muted-foreground'>{prefix}</span>
      ) : null}
      <button
        type='button'
        title={t('common.clickToEdit')}
        className='group/title -ml-1.5 inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
        onClick={() => {
          setDraft(value);
          setError(undefined);
          setEditing(true);
        }}
      >
        <span className='truncate'>{value}</span>
        <Pencil className='size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100' />
      </button>
    </h1>
  );
}
