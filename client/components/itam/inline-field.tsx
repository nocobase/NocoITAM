import { useTranslation } from '@nocobase/i18n/client';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { FieldDefinition } from '@/lib/itam/fields';
import { errorMessage } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

import { FieldInput } from './field-input.js';

export interface InlineFieldProps {
  readonly field: FieldDefinition;
  readonly value: unknown;
  readonly display: ReactNode;
  readonly onSave: (value: unknown) => Promise<void>;
  readonly editable?: boolean;
  readonly recordId?: string;
  /**
   * An editor of the page's own for a value no generic input fits (an audit's
   * scope, a list of people). It is finished by hand like any composite
   * control: 保存 commits the draft, 取消 puts it back.
   */
  readonly renderInput?: (
    draft: unknown,
    onChange: (next: unknown) => void,
  ) => ReactNode;
}

/**
 * Hover hints editability, double-click edits in place, blur or Enter saves.
 * A single click still selects text as the spec requires.
 */
export function InlineField({
  field,
  value,
  display,
  onSave,
  editable = true,
  recordId,
  renderInput,
}: InlineFieldProps): ReactElement {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // Selection controls save on change and close on dismiss; the ref keeps a
  // dismiss that follows a change from closing the editor mid-save.
  const savingRef = useRef(false);

  const startEditing = () => {
    // A write-only field shows a mask, never its value: the editor starts
    // empty so a save can never write the mask back.
    setDraft(field.writeOnly ? '' : value);
    setError(undefined);
    setEditing(true);
  };

  const commit = async () => {
    if (saving) return;
    // Leaving a write-only field empty means "unchanged", not "clear it".
    if (field.writeOnly && (draft === '' || draft === undefined)) {
      setEditing(false);
      return;
    }
    if (JSON.stringify(draft ?? null) === JSON.stringify(value ?? null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!editable) return <div>{display}</div>;

  if (editing) {
    /**
     * A control built from several parts — a set of checkboxes, a recipient
     * named either way, an answer with the choice it calls for — is only an
     * answer once every part is given, so it is finished by hand: leaving
     * it changes nothing and 取消 puts it back. A control that edits one
     * value saves as soon as it is chosen, and a text field on blur.
     */
    const composite =
      Boolean(renderInput) ||
      field.type === 'multiselect' ||
      Boolean(field.dependent) ||
      Boolean(field.alternateField);
    const immediate =
      !composite &&
      (field.type === 'boolean' ||
        field.type === 'select' ||
        field.type === 'reference' ||
        // A date is picked from a calendar, and the pick is the answer.
        field.type === 'date');
    // A write-only field cannot be emptied by leaving the editor empty —
    // that means "unchanged" — so clearing it is its own control, beside
    // the input: an input is inline, so a control after it would flow past
    // its right edge and out of a table cell.
    const clearable = Boolean(field.writeOnly && value);
    const input = renderInput ? (
      renderInput(draft, setDraft)
    ) : (
      <FieldInput
        field={field}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (immediate) {
            // Selection controls have no meaningful blur; save on change.
            savingRef.current = true;
            void Promise.resolve()
              .then(() => onSave(next))
              .then(
                () => setEditing(false),
                (caught: unknown) => {
                  // A refused choice snaps back to the saved value so the
                  // control never shows a state the record does not have.
                  setDraft(value);
                  setError(errorMessage(caught));
                },
              )
              .finally(() => {
                savingRef.current = false;
              });
          }
        }}
        autoFocus
        disabled={saving}
        excludeId={recordId}
        onBlur={immediate || composite ? undefined : () => void commit()}
        onDismiss={
          immediate
            ? () => {
                if (savingRef.current) return;
                setDraft(value);
                setEditing(false);
              }
            : undefined
        }
      />
    );
    return (
      <div
        className='space-y-1'
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
          if (event.key === 'Enter' && field.type !== 'textarea') {
            event.preventDefault();
            void commit();
          }
        }}
      >
        {clearable ? (
          <div className='flex items-center gap-1'>
            <div className='min-w-0 flex-1'>{input}</div>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='text-destructive'
              disabled={saving}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                savingRef.current = true;
                setSaving(true);
                void Promise.resolve()
                  .then(() => onSave(null))
                  .then(
                    () => setEditing(false),
                    (caught: unknown) => setError(errorMessage(caught)),
                  )
                  .finally(() => {
                    savingRef.current = false;
                    setSaving(false);
                  });
              }}
            >
              {t('actions.clear')}
            </Button>
          </div>
        ) : (
          input
        )}
        {composite ? (
          <div className='flex gap-2'>
            <Button
              type='button'
              size='sm'
              disabled={saving}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void commit()}
            >
              {t('actions.save')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              disabled={saving}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              {t('actions.cancel')}
            </Button>
          </div>
        ) : null}
        {error ? <p className='text-xs text-destructive'>{error}</p> : null}
      </div>
    );
  }

  return (
    <div
      role='button'
      tabIndex={0}
      title={t('common.doubleClickToEdit')}
      className={cn(
        '-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
      )}
      onDoubleClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'F2') startEditing();
      }}
    >
      {display}
    </div>
  );
}
