import { useTranslation } from '@nocobase/i18n/client';
import {
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { CellText } from './cell-text.js';
import { ConfirmDialog } from './confirm-dialog.js';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiErrorBody } from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';
import {
  parseTemplate,
  TEMPLATE_TYPES as TYPES,
  type TemplateField,
} from '@/lib/itam/field-template';
import { cn } from '@/lib/utils';

export type { TemplateField };

/** Derives a camelCase key from a label the first time a row gets one. */
function keyFromLabel(label: string): string {
  const ascii = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (ascii.length === 0) return '';
  return ascii
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part[0].toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join('');
}

/**
 * Edits a category's extended-field definitions in a table: label, key,
 * type, required and (for selects) the options. Saved as a whole; the device
 * pages of that category pick the new template up on their next load.
 */
let nextRowId = 0;
/** A row under edit: the field plus a stable id and the options as typed. */
type EditRow = TemplateField & { rid: number; optionsText: string };
const parseOptions = (text: string): string[] =>
  text
    .split(/[,，]/)
    .map((option) => option.trim())
    .filter(Boolean);
const withIds = (fields: TemplateField[]): EditRow[] =>
  fields.map((field) => ({
    ...field,
    rid: nextRowId++,
    optionsText: (field.options ?? []).join(', '),
  }));
// Options come from the typed text so a comma or space in progress is kept.
const stripIds = (rows: readonly EditRow[]): TemplateField[] =>
  rows.map(({ rid: _rid, optionsText, ...field }) => ({
    ...field,
    options:
      field.type === 'select' ? parseOptions(optionsText) : field.options,
  }));

/** What AI 建议字段 answers: the fields to add, and its one sentence. */
/** A change 建议字段 proposes to a field the category has, and why. */
export interface FieldChange {
  readonly key: string;
  readonly label?: string;
  readonly type?: TemplateField['type'];
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly reason?: string;
}

export interface FieldSuggestion {
  readonly fields: readonly TemplateField[];
  /** Changes to the fields there already (2026-10-20). */
  readonly changes?: readonly FieldChange[];
  readonly said: string;
  /** Shown under the sentence, e.g. the record's suggested defaults. */
  readonly extra?: ReactNode;
}

export function FieldTemplateEditor({
  value,
  editable,
  usage,
  onSave,
  onSuggest,
  embedded,
}: {
  readonly value: unknown;
  readonly editable: boolean;
  /** Devices holding a value per key; such fields can be hidden, not deleted. */
  readonly usage?: Readonly<Record<string, number>>;
  readonly onSave: (template: TemplateField[]) => Promise<void>;
  /**
   * AI 建议字段 (2026-10-20): asks the model for fields to add; they join the
   * rows under edit for the reader to check and save. Absent without a model.
   */
  readonly onSuggest?: () => Promise<FieldSuggestion>;
  /**
   * Part of a form rather than a card of its own (2026-10-20, 创建分类): always
   * the editor, with no 保存 or 取消 — the form saves the fields it is told
   * of, with whether they are valid, and asks the problems shown.
   */
  readonly embedded?: {
    readonly onChange: (fields: TemplateField[], valid: boolean) => void;
    readonly showProblems: boolean;
  };
}): ReactElement {
  const { t } = useTranslation();
  const [rows, setRows] = useState(() => withIds(parseTemplate(value)));
  // A category with no extended fields yet opens in the editor: its read-only
  // state is an empty card whose only offer is 编辑, so the reader has to
  // press a button to be told they can add one. Starting in the editor puts
  // 添加字段 straight in front of them. Cancelling still returns to the
  // empty card — that is the reader saying they did not want one.
  const [editing, setEditing] = useState(
    () => Boolean(embedded) || (editable && parseTemplate(value).length === 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<string>();
  const [suggestedExtra, setSuggestedExtra] = useState<ReactNode>();
  // The rows 建议字段 added, marked until they are saved or dropped
  // (2026-10-20): beside the fields there already, they looked the same.
  const [freshRows, setFreshRows] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  // Rows it changed: what they were, and why, for the 修改 tag's tooltip.
  const [changedRows, setChangedRows] = useState<ReadonlyMap<number, string>>(
    () => new Map(),
  );
  // Problems surface only after a save attempt; a fresh row starts quiet.
  const [attempted, setAttempted] = useState(false);
  // Removing a row that already describes a field asks first; a blank row
  // just goes.
  const [removing, setRemoving] = useState<number>();
  const removeRow = (index: number) =>
    setRows((current) => current.filter((_, at) => at !== index));
  /** Inserts a blank row after `index` (at the end when undefined). */
  const insertAfter = (index?: number) =>
    setRows((current) => {
      const blank = {
        key: '',
        label: '',
        type: 'text' as const,
        required: false,
        rid: nextRowId++,
        optionsText: '',
      };
      const at = index === undefined ? current.length : index + 1;
      return [...current.slice(0, at), blank, ...current.slice(at)];
    });
  const dirty =
    JSON.stringify(stripIds(rows)) !== JSON.stringify(parseTemplate(value));

  const update = (index: number, patch: Partial<EditRow>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  // Rows reorder by dragging the grip; the drop target is the row under
  // the pointer, before or after it depending on the pointer's half.
  const [dragIndex, setDragIndex] = useState<number>();
  const [dropAt, setDropAt] = useState<number>();
  const reorder = (from: number, to: number) =>
    setRows((current) => {
      if (from === to || from + 1 === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
  const dropIndexFor = (event: DragEvent<HTMLElement>, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? index : index + 1;
  };

  // One problem per row, attached to the cell it concerns.
  type ProblemCell = 'label' | 'key' | 'options';
  const problems = new Map<number, { cell: ProblemCell; message: string }>();
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!row.label.trim())
      problems.set(index, {
        cell: 'label',
        message: t('fieldTemplate.labelRequired'),
      });
    else if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(row.key))
      problems.set(index, {
        cell: 'key',
        message: t('fieldTemplate.keyInvalid'),
      });
    else if (seen.has(row.key))
      problems.set(index, {
        cell: 'key',
        message: t('fieldTemplate.keyDuplicate'),
      });
    else if (
      row.type === 'select' &&
      parseOptions(row.optionsText).length === 0
    )
      problems.set(index, {
        cell: 'options',
        message: t('fieldTemplate.optionsRequired'),
      });
    seen.add(row.key);
  });
  const problemAt = (index: number, cell: ProblemCell) =>
    (attempted || embedded?.showProblems) && problems.get(index)?.cell === cell
      ? problems.get(index)?.message
      : undefined;
  const problemText = (index: number, cell: ProblemCell) => {
    const message = problemAt(index, cell);
    return message ? (
      <p className='mt-1 text-xs text-destructive'>{message}</p>
    ) : null;
  };

  /** Adds what the model suggests that the template lacks, as new rows. */
  const suggest = async () => {
    if (!onSuggest) return;
    setEditing(true);
    setSuggesting(true);
    setSuggested(undefined);
    setSuggestedExtra(undefined);
    setError(undefined);
    try {
      const answer = await onSuggest();
      const taken = new Set(rows.map((row) => row.key));
      const fresh = answer.fields.filter(
        (field) =>
          /^[A-Za-z][A-Za-z0-9_]*$/.test(field.key) && !taken.has(field.key),
      );
      const added = withIds(
        fresh.map((field) => ({ ...field, required: false })),
      );
      // A change applies to the row of its key, in place; the key stays.
      const describe = (row: EditRow) =>
        [
          row.label,
          t(`fieldTemplate.types.${row.type}`),
          row.type === 'select' ? row.optionsText : '',
          row.required ? t('fieldTemplate.required') : '',
        ]
          .filter(Boolean)
          .join(' · ');
      const changes = new Map(
        (answer.changes ?? []).map((change) => [change.key, change]),
      );
      const notes = new Map<number, string>();
      const next = rows
        .filter((row) => row.key || row.label)
        .map((row) => {
          const change = changes.get(row.key);
          if (!change) return row;
          const changed: EditRow = {
            ...row,
            ...(change.label ? { label: change.label } : {}),
            ...(change.type && TYPES.includes(change.type)
              ? { type: change.type }
              : {}),
            ...(change.required === undefined
              ? {}
              : { required: change.required }),
            ...(change.options?.length
              ? {
                  options: change.options,
                  optionsText: change.options.join(', '),
                }
              : {}),
          };
          if (JSON.stringify(changed) === JSON.stringify(row)) return row;
          notes.set(
            row.rid,
            t('fieldTemplate.changedFrom', {
              before: describe(row),
              reason: change.reason ?? '',
            }),
          );
          return changed;
        });
      setRows([...next, ...added]);
      setFreshRows(
        (known) => new Set([...known, ...added.map((row) => row.rid)]),
      );
      setChangedRows((known) => new Map([...known, ...notes]));
      setSuggestedExtra(answer.extra);
      setSuggested(
        fresh.length || notes.size
          ? t(
              fresh.length && notes.size
                ? 'fieldTemplate.suggested'
                : fresh.length
                  ? 'fieldTemplate.suggestedAdded'
                  : 'fieldTemplate.suggestedChanged',
              {
                count: fresh.length,
                changed: notes.size,
                said: answer.said,
              },
            )
          : answer.said || t('fieldTemplate.suggestedNone'),
      );
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setSuggesting(false);
    }
  };
  const suggestAction =
    editable && onSuggest ? (
      <AiShortcut
        disabled={suggesting || saving}
        onClick={() => void suggest()}
      >
        {/* Greyed while it runs; the card's own line says what is going on. */}
        {t('fieldTemplate.suggest')}
      </AiShortcut>
    ) : null;

  /** The fields as saved: labels trimmed, options only on a select. */
  const cleaned = (): TemplateField[] =>
    stripIds(rows).map((row) => ({
      key: row.key,
      label: row.label.trim(),
      type: row.type,
      ...(row.required ? { required: true } : {}),
      ...(row.hidden ? { hidden: true } : {}),
      ...(row.type === 'select' ? { options: row.options ?? [] } : {}),
    }));
  // Embedded, the form is told of every change and saves the fields itself.
  const onEmbeddedChange = embedded?.onChange;
  const valid = problems.size === 0;
  const fingerprint = JSON.stringify(cleaned());
  useEffect(() => {
    onEmbeddedChange?.(JSON.parse(fingerprint) as TemplateField[], valid);
  }, [onEmbeddedChange, fingerprint, valid]);

  const save = async () => {
    if (problems.size > 0) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(cleaned());
      setEditing(false);
      setSuggested(undefined);
      setSuggestedExtra(undefined);
      setFreshRows(new Set());
      setChangedRows(new Map());
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const fields = parseTemplate(value);
    return (
      <Card className='py-0'>
        <CardContent className='space-y-3 p-4'>
          <div className='flex min-h-9 items-center justify-between gap-3 border-b border-border/60 pb-2'>
            <div className='min-w-0'>
              <h2 className='font-heading text-sm font-semibold'>
                {t('fieldTemplate.title')}
              </h2>
            </div>
            {editable ? (
              <div className='flex items-center gap-3'>
                {suggestAction}
                <Button
                  variant='outline'
                  className='shrink-0'
                  onClick={() => {
                    setRows(withIds(parseTemplate(value)));
                    setError(undefined);
                    setAttempted(false);
                    setEditing(true);
                  }}
                >
                  <Pencil data-icon='inline-start' />
                  {t('actions.edit')}
                </Button>
              </div>
            ) : null}
          </div>
          {fields.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('fieldTemplate.empty')}
            </p>
          ) : (
            <div className='flex flex-wrap gap-2'>
              {fields.map((field) => (
                // Larger than a status tag (2026-10-20): these are the
                // card's content, not a mark beside it, so not a Badge,
                // whose size styles.css sets for every tag.
                <span
                  key={field.key}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-sm font-medium whitespace-nowrap text-secondary-foreground',
                    field.hidden &&
                      'bg-muted text-muted-foreground line-through',
                  )}
                  title={
                    field.hidden ? t('fieldTemplate.hiddenHint') : undefined
                  }
                >
                  {field.hidden ? <EyeOff className='size-3.5' /> : null}
                  {field.label}
                  <span className='font-normal text-muted-foreground no-underline'>
                    {t(`fieldTemplate.types.${field.type}`)}
                    {field.required ? ' *' : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const body = (
    <>
      {/* In a form it is a section heading like the form's own, no rule. */}
      <div
        className={cn(
          'flex items-center justify-between gap-3',
          embedded ? null : 'min-h-9 border-b border-border/60 pb-2',
        )}
      >
        <div className='min-w-0'>
          <h2 className='font-heading text-sm font-semibold'>
            {t('fieldTemplate.title')}
          </h2>
        </div>
        {/* Nothing has been written yet, so there is nothing to keep or
              throw away: the card offers only 添加字段 (and AI 建议字段)
              until a row exists. */}
        {editable && rows.length === 0 ? suggestAction : null}
        {editable && rows.length > 0 && !embedded ? (
          <div className='flex items-center gap-2'>
            <span className='mr-1'>{suggestAction}</span>
            <Button
              variant='ghost'
              disabled={saving}
              onClick={() => {
                setRows(withIds(parseTemplate(value)));
                setError(undefined);
                setSuggested(undefined);
                setSuggestedExtra(undefined);
                setFreshRows(new Set());
                setChangedRows(new Map());
                setEditing(false);
              }}
            >
              <X data-icon='inline-start' />
              {t('actions.cancel')}
            </Button>
            <Button disabled={!dirty || saving} onClick={() => void save()}>
              <Save data-icon='inline-start' />
              {t('actions.save')}
            </Button>
          </div>
        ) : null}
      </div>
      {suggesting ? (
        <p className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner />
          {t('fieldTemplate.suggesting')}
        </p>
      ) : suggested ? (
        <div className='space-y-2'>
          <p className='text-sm text-muted-foreground'>{suggested}</p>
          {suggestedExtra}
        </div>
      ) : null}
      {/* While fields are being suggested, the empty card's offer to add
            one by hand would compete with them; it waits. */}
      {suggesting && rows.length === 0 ? null : rows.length === 0 ? (
        <div className='flex flex-col items-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground'>
          {t('fieldTemplate.empty')}
          {/* The only thing to do on an empty card, so it reads as the
                action it is rather than as a muted secondary one. */}
          <Button onClick={() => insertAfter()}>
            <Plus data-icon='inline-start' />
            {t('fieldTemplate.add')}
          </Button>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border border-border bg-card'>
          <Table>
            <TableHeader>
              <TableRow>
                {editable ? <TableHead className='w-8' /> : null}
                <TableHead>{t('fieldTemplate.label')}</TableHead>
                <TableHead className='w-40'>{t('fieldTemplate.key')}</TableHead>
                <TableHead className='w-32'>
                  {t('fieldTemplate.type')}
                </TableHead>
                <TableHead className='w-16 text-center'>
                  {t('fieldTemplate.required')}
                </TableHead>
                <TableHead>{t('fieldTemplate.options')}</TableHead>
                {editable ? <TableHead className='w-28' /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow
                  key={row.rid}
                  className={cn(
                    dragIndex === index && 'opacity-40',
                    row.hidden && 'text-muted-foreground',
                    freshRows.has(row.rid) && 'bg-primary/5',
                    changedRows.has(row.rid) && 'bg-warning/25',
                    dropAt === index &&
                      'shadow-[inset_0_2px_0_0_var(--color-primary)]',
                    dropAt === index + 1 &&
                      index === rows.length - 1 &&
                      'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
                  )}
                  onDragOver={(event) => {
                    if (dragIndex === undefined) return;
                    event.preventDefault();
                    const at = dropIndexFor(event, index);
                    if (at !== dropAt) setDropAt(at);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== undefined)
                      reorder(dragIndex, dropIndexFor(event, index));
                    setDragIndex(undefined);
                    setDropAt(undefined);
                  }}
                >
                  {editable ? (
                    <TableCell className='pr-0'>
                      <span
                        draggable
                        aria-label={t('fieldTemplate.drag')}
                        className='inline-flex cursor-grab text-muted-foreground/60 active:cursor-grabbing'
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', row.key);
                          setDragIndex(index);
                        }}
                        onDragEnd={() => {
                          setDragIndex(undefined);
                          setDropAt(undefined);
                        }}
                      >
                        <GripVertical className='size-4' />
                      </span>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {editable ? (
                      <div className='flex items-center gap-2'>
                        <Input
                          value={row.label}
                          aria-invalid={
                            problemAt(index, 'label') ? true : undefined
                          }
                          onChange={(event) =>
                            update(index, {
                              label: event.target.value,
                              ...(row.key === '' ||
                              row.key === keyFromLabel(row.label)
                                ? { key: keyFromLabel(event.target.value) }
                                : {}),
                            })
                          }
                        />
                        {freshRows.has(row.rid) ? (
                          <span className='shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary'>
                            {t('fieldTemplate.newTag')}
                          </span>
                        ) : changedRows.has(row.rid) ? (
                          <span
                            className='shrink-0 cursor-help rounded-md bg-warning px-1.5 py-0.5 text-xs font-medium text-warning-foreground'
                            title={changedRows.get(row.rid)}
                          >
                            {t('fieldTemplate.changedTag')}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      row.label
                    )}
                    {problemText(index, 'label')}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={row.key}
                        className='font-mono text-xs'
                        aria-invalid={
                          problemAt(index, 'key') ? true : undefined
                        }
                        onChange={(event) =>
                          update(index, { key: event.target.value })
                        }
                      />
                    ) : (
                      <code className='text-xs'>{row.key}</code>
                    )}
                    {problemText(index, 'key')}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Select
                        items={TYPES.map((type) => ({
                          value: type,
                          label: t(`fieldTemplate.types.${type}`),
                        }))}
                        value={row.type}
                        onValueChange={(next) =>
                          update(index, {
                            type: next as TemplateField['type'],
                          })
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`fieldTemplate.types.${type}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      t(`fieldTemplate.types.${row.type}`)
                    )}
                  </TableCell>
                  <TableCell>
                    <div className='flex justify-center'>
                      <Checkbox
                        checked={Boolean(row.required)}
                        disabled={!editable}
                        aria-label={t('fieldTemplate.required')}
                        onCheckedChange={(checked) =>
                          update(index, { required: Boolean(checked) })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.type === 'select' ? (
                      editable ? (
                        <>
                          <Input
                            value={row.optionsText}
                            placeholder={t('fieldTemplate.optionsPlaceholder')}
                            aria-invalid={
                              problemAt(index, 'options') ? true : undefined
                            }
                            onChange={(event) =>
                              update(index, {
                                optionsText: event.target.value,
                              })
                            }
                          />
                          {problemText(index, 'options')}
                        </>
                      ) : (
                        <CellText className='max-w-64'>
                          {(row.options ?? []).join(', ')}
                        </CellText>
                      )
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  {editable ? (
                    <TableCell>
                      <div className='flex items-center justify-end gap-0.5'>
                        <Button
                          size='icon'
                          variant='ghost'
                          aria-label={t('fieldTemplate.addBelow')}
                          onClick={() => insertAfter(index)}
                        >
                          <Plus />
                        </Button>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size='icon'
                                variant='ghost'
                                aria-label={
                                  row.hidden
                                    ? t('fieldTemplate.show')
                                    : t('fieldTemplate.hide')
                                }
                                onClick={() =>
                                  update(index, { hidden: !row.hidden })
                                }
                              />
                            }
                          >
                            {row.hidden ? <EyeOff /> : <Eye />}
                          </TooltipTrigger>
                          <TooltipContent>
                            {row.hidden
                              ? t('fieldTemplate.showTip')
                              : t('fieldTemplate.hideTip')}
                          </TooltipContent>
                        </Tooltip>
                        {(usage?.[row.key] ?? 0) > 0 ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className='inline-flex' tabIndex={0} />
                              }
                            >
                              <Button
                                size='icon'
                                variant='ghost'
                                disabled
                                aria-label={t('fieldTemplate.remove')}
                              >
                                <Trash2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('fieldTemplate.inUse', {
                                count: usage?.[row.key] ?? 0,
                              })}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            size='icon'
                            variant='ghost'
                            aria-label={t('fieldTemplate.remove')}
                            onClick={() =>
                              row.label.trim() || row.key
                                ? setRemoving(index)
                                : removeRow(index)
                            }
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={t('fieldTemplate.removeTitle', {
          label: removing !== undefined ? rows[removing]?.label : '',
        })}
        description={t('fieldTemplate.removeDescription')}
        destructive
        confirmLabel={t('fieldTemplate.remove')}
        onConfirm={() => {
          if (removing !== undefined) removeRow(removing);
          setRemoving(undefined);
        }}
      />
    </>
  );
  // Embedded in a form it is a section of that form, not a card of its
  // own.
  return embedded ? (
    <section className='space-y-3'>{body}</section>
  ) : (
    <Card className='py-0'>
      <CardContent className='space-y-3 p-4'>{body}</CardContent>
    </Card>
  );
}
