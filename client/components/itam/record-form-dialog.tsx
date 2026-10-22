import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { FieldLabel } from '@/components/itam/field-label';
import { ReviewMark } from '@/components/itam/review-mark';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { apiErrorBody, type ItamRecord } from '@/lib/itam/api';
import {
  resolveFormField,
  changeFormField,
  type FieldDefinition,
} from '@/lib/itam/fields';
import { errorMessage } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

import { AttachmentsUpload } from './attachments-upload.js';
import { FieldInput } from './field-input.js';

export interface RecordFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly FieldDefinition[];
  readonly initial?: Readonly<Record<string, unknown>>;
  readonly submitting?: boolean;
  readonly error?: unknown;
  readonly onSubmit: (
    values: Record<string, unknown>,
    attachments: readonly FileRecord[],
  ) => Promise<void> | void;
  /** Offer an attachment field (create only); the files come back with the values. */
  readonly attachments?: boolean;
  /** The record being edited, so a tree field can exclude it from parents. */
  readonly recordId?: string;
  /**
   * Called after a field changes; whatever it returns is merged into the
   * values (a model choice filling in the name, for example). `record` is
   * the chosen record when the field is a reference.
   */
  readonly derive?: (
    change: { key: string; value: unknown; record?: ItamRecord },
    values: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown> | undefined;
  /**
   * The values, when the caller holds them — AI 整理 fills the form from
   * outside (`initialFormValues` gives the starting point). `key` is the
   * field the reader changed.
   */
  readonly values?: Readonly<Record<string, unknown>>;
  readonly onValuesChange?: (
    values: Record<string, unknown>,
    key: string,
  ) => void;
  /** Fields that carry 请核对 beside their label. */
  readonly marks?: ReadonlySet<string>;
  /**
   * Fields AI 完善 changed (2026-10-20), each with what it was: tagged 修改
   * with that on hover. A field leaves the map when the caller drops it.
   */
  readonly changes?: ReadonlyMap<string, string>;
  /** Beside the title: AI 整理 / 表单录入. */
  readonly titleAside?: ReactNode;
  /** Shown instead of the fields, with no footer (the AI 整理 tab). */
  readonly replacement?: ReactNode;
  /** A column beside the fields (what AI 整理 said), widening the dialog. */
  readonly aside?: ReactNode;
  /** The form element, e.g. to register it as the assistant's page context. */
  readonly contentRef?: (element: HTMLElement | null) => void;
  /**
   * A run of fields set apart under a heading on a tinted ground — a
   * model's extended fields, which come from its category rather than the
   * model's own definition.
   */
  readonly section?: {
    readonly title: string;
    readonly keys: ReadonlySet<string>;
  };
  /**
   * Two fields to a row, a long text taking the whole row. By default two
   * once the form has more than four fields (2026-10-16): a long form in one
   * narrow column was a tall scroll.
   */
  readonly columns?: 1 | 2;
  /** Above the fields: what the reader should know before checking them. */
  readonly prelude?: ReactNode;
  /** Below the fields, in their column: more the form saves (2026-10-20). */
  readonly postlude?: ReactNode;
  /**
   * Under one field's input, in its cell (2026-10-20): what acts on that
   * field — a new repair's 看看 under its fault description.
   */
  readonly fieldFooters?: Readonly<Record<string, ReactNode>>;
  /** The field the cursor starts in, where the form begins with it. */
  readonly autoFocusField?: string;
}

/** A form's starting values: what it was given, else each field's default. */
// eslint-disable-next-line react-refresh/only-export-components -- the dialog's own helper
export function initialFormValues(
  fields: readonly FieldDefinition[],
  initial?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...initial };
  for (const field of fields.filter((entry) => entry.form !== false)) {
    next[field.key] =
      initial?.[field.key] ??
      field.defaultValue ??
      (field.type === 'multiselect'
        ? []
        : field.type === 'boolean'
          ? false
          : null);
  }
  return next;
}

/** Create / edit dialog driven by field definitions. */
export function RecordFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitting,
  error,
  onSubmit,
  recordId,
  derive,
  attachments,
  values: heldValues,
  onValuesChange,
  marks,
  changes,
  titleAside,
  replacement,
  fieldFooters,
  autoFocusField,
  aside,
  contentRef,
  section,
  columns: columnsOption,
  prelude,
  postlude,
}: RecordFormDialogProps): ReactElement {
  const columns = columnsOption ?? (fields.length > 4 ? 2 : 1);
  const [files, setFiles] = useState<readonly FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const { t } = useTranslation();
  const editable = fields.filter((field) => field.form !== false);
  // Mount the dialog with a `key` that changes per record so this initial
  // state is computed fresh for every create / edit session.
  const [ownValues, setOwnValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(fields, initial),
  );
  const values: Record<string, unknown> = heldValues
    ? { ...heldValues }
    : ownValues;
  const setValues = (
    key: string,
    update: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    if (heldValues) onValuesChange?.(update({ ...heldValues }), key);
    else setOwnValues(update);
  };

  const currencyFields = new Set(
    fields.map((field) => field.currencyField).filter(Boolean),
  );
  const resolved = editable
    .map((field) => resolveFormField(field, values))
    .filter((field) => !field.visibleWhen || field.visibleWhen(values));
  const missing = resolved.some(
    (field) =>
      field.required &&
      (values[field.key] == null || String(values[field.key]).trim() === ''),
  );
  const body = apiErrorBody(error);
  const fieldErrors = new Map<string, string>();
  // An issue only becomes a field's message when the form actually shows
  // that field. A rejection about something else — a value passed through
  // outside the form, a key the endpoint does not accept — has an empty or
  // unknown path, and pinning it to a field nobody renders loses it: the
  // dialog would sit there as if nothing had happened.
  const shownFields = new Set(resolved.map((field) => field.key));
  const unattached: string[] = [];
  for (const issue of body?.issues ?? []) {
    if (issue.path && shownFields.has(issue.path))
      fieldErrors.set(issue.path, issue.message);
    else unattached.push(issue.message);
  }
  if (body?.field && body.message) fieldErrors.set(body.field, body.message);
  const generalError = !error
    ? undefined
    : unattached.length > 0
      ? unattached.join('\n')
      : fieldErrors.size === 0
        ? (body?.message ?? errorMessage(error))
        : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing || replacement) return;
    const payload: Record<string, unknown> = {};
    // Editing (a recordId is set) sends only what changed; creating sends
    // every value, including presets passed through `initial`.
    const editingRecord = Boolean(recordId);
    for (const field of editable) {
      // A hidden dependent field sends nothing.
      if (field.visibleWhen && !field.visibleWhen(values)) continue;
      const value = values[field.key];
      if (
        editingRecord &&
        JSON.stringify(value ?? null) ===
          JSON.stringify(initial?.[field.key] ?? null)
      )
        continue;
      if (value === null && !editingRecord) continue;
      payload[field.key] = value;
    }
    await onSubmit(payload, files);
  };

  const twoColumns = columns === 2;
  // In two columns a long text keeps the whole row. A cell keeps its label
  // at the top when the field beside it is taller (2026-10-21: a
  // multi-choice wrapping to a second line pushed its neighbour's down).
  const cell = (field: FieldDefinition) =>
    twoColumns && (field.type === 'textarea' || field.wide)
      ? 'grid content-start gap-1.5 sm:col-span-2'
      : 'grid content-start gap-1.5';
  const renderField = (field: FieldDefinition): ReactNode => {
    if (field.visibleWhen && !field.visibleWhen(values)) return null;
    // A currency edited with its amount has no row of its own.
    if (currencyFields.has(field.key)) return null;
    const id = `form-${field.key}`;
    const message = fieldErrors.get(field.key);
    if (field.currencyField) {
      const currencyKey = field.currencyField;
      return (
        <div key={field.key} className={cell(field)}>
          <Label htmlFor={id}>
            {t(field.label)}
            {field.required ? (
              <span className='text-destructive'> *</span>
            ) : null}
            {changes?.has(field.key) ? (
              <ReviewMark
                label={t('fieldTemplate.changedTag')}
                hint={changes.get(field.key)}
              />
            ) : marks?.has(field.key) ? (
              <ReviewMark />
            ) : null}
          </Label>
          <FieldInput
            id={id}
            field={field}
            value={{
              amount: values[field.key] ?? null,
              currency: values[currencyKey] ?? null,
            }}
            onChange={(value) => {
              const pair = (value ?? {}) as {
                amount?: unknown;
                currency?: unknown;
              };
              setValues(field.key, (current) => ({
                ...current,
                [field.key]: pair.amount ?? null,
                [currencyKey]: pair.currency ?? null,
              }));
            }}
            disabled={submitting || Boolean(field.readonlyWhen?.(values))}
          />
          {message ? (
            <p className='text-xs text-destructive'>{message}</p>
          ) : null}
        </div>
      );
    }
    return (
      <div key={field.key} className={cell(field)}>
        <Label htmlFor={id}>
          <FieldLabel
            label={t(field.label)}
            hint={
              field.readonlyHint && field.readonlyWhen?.(values)
                ? field.readonlyHint
                : undefined
            }
          >
            {field.required ? (
              <span className='text-destructive'>*</span>
            ) : null}
            {changes?.has(field.key) ? (
              <ReviewMark
                label={t('fieldTemplate.changedTag')}
                hint={changes.get(field.key)}
              />
            ) : marks?.has(field.key) ? (
              <ReviewMark />
            ) : null}
          </FieldLabel>
        </Label>
        <FieldInput
          id={id}
          field={field}
          value={values[field.key]}
          onChange={(value, record) =>
            setValues(field.key, (current) => {
              const next = changeFormField(field, value, current);
              return {
                ...next,
                ...derive?.({ key: field.key, value, record }, next),
              };
            })
          }
          disabled={submitting || Boolean(field.readonlyWhen?.(values))}
          excludeId={recordId}
          autoFocus={field.key === autoFocusField}
        />
        {message ? <p className='text-xs text-destructive'>{message}</p> : null}
        {field.noteWhen?.(values) ? (
          <p className='text-xs text-muted-foreground'>
            {t(field.noteWhen(values)!)}
          </p>
        ) : null}
        {fieldFooters?.[field.key]}
      </div>
    );
  };
  // The fields in order; a section's are gathered where its first one
  // stands.
  const sectionFields = section
    ? resolved.filter((field) => section.keys.has(field.key))
    : [];
  const grid = twoColumns
    ? 'grid min-w-0 gap-4 sm:grid-cols-2'
    : 'grid min-w-0 gap-4';
  const fieldsGrid = (
    <div className={grid}>
      {resolved.map((field) => {
        if (!section?.keys.has(field.key)) return renderField(field);
        if (field !== sectionFields[0]) return null;
        return (
          <div
            key={`section:${section.title}`}
            role='group'
            aria-label={section.title}
            className={cn(
              grid,
              'rounded-lg bg-muted/60 p-3',
              twoColumns && 'sm:col-span-2',
            )}
          >
            <p
              className={cn(
                '-mb-1 text-sm font-medium',
                twoColumns && 'sm:col-span-2',
              )}
            >
              {section.title}
            </p>
            {sectionFields.map(renderField)}
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}
    >
      <DialogContent
        className={cn(
          'max-h-[90svh] overflow-y-auto',
          aside && !replacement
            ? postlude
              ? // The fields' column holds a table too (a new category's
                // extended fields): wider, so it has room beside the AI.
                'sm:max-w-6xl'
              : twoColumns
                ? 'sm:max-w-5xl'
                : 'sm:max-w-3xl'
            : // A table under the fields (a new category's extended
              // fields) wants the width a column beside them would take.
              postlude && !replacement
              ? 'sm:max-w-4xl'
              : twoColumns && !replacement
                ? 'sm:max-w-2xl'
                : 'sm:max-w-lg',
        )}
      >
        <form
          ref={contentRef}
          onSubmit={(event) => void submit(event)}
          className='space-y-4'
        >
          <DialogHeader>
            {titleAside ? (
              // As in ConfirmDialog: right after the title, clear of the
              // close button when it wraps.
              <div className='flex flex-wrap items-center gap-x-3 gap-y-2 pr-9'>
                <DialogTitle>{title}</DialogTitle>
                {titleAside}
              </div>
            ) : (
              <DialogTitle>{title}</DialogTitle>
            )}
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {replacement ?? (
            <div
              className={
                aside
                  ? 'grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start'
                  : 'grid'
              }
            >
              {prelude || postlude ? (
                <div className='grid min-w-0 gap-4'>
                  {prelude}
                  {fieldsGrid}
                  {postlude}
                </div>
              ) : (
                fieldsGrid
              )}
              {/* The column beside stays in view while the form scrolls. */}
              {aside ? <div className='md:sticky md:top-0'>{aside}</div> : null}
            </div>
          )}
          {attachments && !recordId && !replacement ? (
            <AttachmentsUpload
              value={files}
              onChange={setFiles}
              onBusy={setUploading}
            />
          ) : null}
          {generalError ? (
            <p className='text-sm text-destructive'>{generalError}</p>
          ) : null}
          {/* The AI 整理 tab has nothing to save and no footer: the
              corner's close button closes the dialog. */}
          {replacement ? null : (
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                {t('actions.cancel')}
              </Button>
              {/* 创建 for a new record, 保存 for one being edited
                  (2026-10-20). */}
              <Button
                type='submit'
                disabled={submitting || missing || uploading}
              >
                {t(recordId ? 'actions.save' : 'actions.create')}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
