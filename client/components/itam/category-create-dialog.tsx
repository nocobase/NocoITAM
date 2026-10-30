import { createUuid, resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { CaptureFailure } from '@/components/itam/ai/capture-failure';
import { CaptureTurns } from '@/components/itam/ai/capture-turns';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import {
  FieldTemplateEditor,
  type FieldMarks,
} from '@/components/itam/field-template-editor';
import {
  initialFormValues,
  RecordFormDialog,
  type RecordFormDialogProps,
} from '@/components/itam/record-form-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import {
  apiErrorBody,
  masterDataPath,
  useItamMutations,
  type ItamRecord,
} from '@/lib/itam/api';
import {
  CATEGORY_DEFAULT_KEYS,
  categoryDefaultsOf,
} from '@/lib/itam/category-defaults';
import { parseTemplate, type TemplateField } from '@/lib/itam/field-template';
import {
  applyFieldSuggestion,
  keepHeldFields,
  type FieldChange,
} from '@/lib/itam/field-suggestion';
import { errorMessage, text } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';

export interface CategoryCreateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
  /** 创建子分类: the parent and the rules the child starts from. */
  readonly initial?: Readonly<Record<string, unknown>>;
  readonly title?: string;
  /** The parent's kind filling 资产类型, as the plain form does. */
  readonly derive?: RecordFormDialogProps['derive'];
  /** A sub-category's parent's fields, which it keeps; suggestions add to them. */
  readonly baseTemplate?: readonly TemplateField[];
  /**
   * 完善 (2026-10-20): the category to improve. The dialog opens on the
   * model's suggestions for it — its rules, defaults and fields — marked 修改
   * and 新增 against what it holds, and saves them onto it.
   */
  readonly record?: ItamRecord;
}

interface CategoryReading {
  readonly values?: Readonly<Record<string, unknown>>;
  readonly fieldTemplate?: unknown;
  readonly uncertain?: readonly string[];
  readonly duplicates?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
}

/**
 * 创建分类 with AI 整理, and 完善 of a category (2026-10-20). Creating, the
 * reader writes what the category is and the model fills the whole form —
 * where it goes, its kind, its rules, its defaults — and the extended fields
 * its records carry (task `category`, checked on the server). Improving, it
 * opens on what the model suggests for the category (task
 * `categoryFields`), each value it changed tagged 修改 with what it was and
 * each field tagged 新增 or 修改. Either way the fields are edited under the
 * form, the column beside it holds what the model said and a line to ask
 * for a change, and nothing is saved until the reader saves.
 */
export function CategoryCreateDialog(
  props: CategoryCreateDialogProps,
): ReactElement {
  if (!props.open) return <Fragment />;
  return (
    <CategoryCreateForm
      key={JSON.stringify(props.initial ?? props.record?.id ?? {})}
      {...props}
    />
  );
}

function CategoryCreateForm({
  open,
  onOpenChange,
  onCreated,
  initial,
  title,
  derive,
  baseTemplate: givenBase,
  record,
}: CategoryCreateDialogProps): ReactElement {
  const { t } = useTranslation();
  const meta = masterDataByName('categories')!;
  const fields = useMemo(
    () => meta.fields.filter((field) => field.form !== false),
    [meta],
  );
  const mutations = useItamMutations<ItamRecord>(masterDataPath('categories'));
  const ai = useItamAi();
  const read = useAiReading();
  const refining = Boolean(record);
  // What the category holds, which 完善 marks its changes against.
  const recordTemplate = useMemo(
    () => (record ? parseTemplate(record.fieldTemplate) : []),
    [record],
  );
  const baseTemplate = record ? recordTemplate : (givenBase ?? []);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(fields, record ?? initial),
  );
  const [tab, setTab] = useState<'ai' | 'form'>();
  const current = refining ? 'form' : (tab ?? (ai.available ? 'ai' : 'form'));
  const [material, setMaterial] = useState(() => text(record?.name));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  // The model answered and filled nothing: its reply, not an error.
  const [failureAnswered, setFailureAnswered] = useState(false);
  const [said, setSaid] = useState<string>();
  // The fields the editor starts from (the parent's, then the suggestions),
  // re-seeded when the model answers again; and what it holds now.
  const [seed, setSeed] = useState(0);
  const [seedFields, setSeedFields] = useState<readonly TemplateField[]>(
    () => baseTemplate,
  );
  const [fieldMarks, setFieldMarks] = useState<FieldMarks>();
  const [template, setTemplate] = useState<readonly TemplateField[]>(
    () => baseTemplate,
  );
  const [templateValid, setTemplateValid] = useState(true);
  const [attempted, setAttempted] = useState(false);
  const changeFields = useCallback(
    (fields: TemplateField[], valid: boolean) => {
      setTemplate(fields);
      setTemplateValid(valid);
    },
    [],
  );
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  // 完善: the form's values it changed, each with what it was.
  const [changes, setChanges] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // Why it changed each field, kept across adjustments.
  const reasonsRef = useRef(new Map<string, string>());
  const [duplicates, setDuplicates] = useState<
    NonNullable<CategoryReading['duplicates']>
  >([]);
  const [filled, setFilled] = useState(false);
  // The adjustments asked for after filling, and the answers.
  const [turns, setTurns] = useState<
    readonly { id: string; from: 'user' | 'ai'; text: string }[]
  >([]);
  const [instruction, setInstruction] = useState('');

  /** A value as the form shows it, for what a changed one was. */
  const shown = (key: string, value: unknown): string => {
    if (typeof value === 'boolean')
      return t(value ? 'common.yes' : 'common.no');
    const raw = text(value);
    if (!raw) return '—';
    if (key === 'depreciationMethod')
      return t(`enums.depreciationMethod.${raw}`);
    if (key === 'residualRate')
      return `${String(Math.round(Number(raw) * 1000) / 10)}%`;
    return raw;
  };
  const describe = (field: TemplateField) =>
    [
      field.label,
      t(`fieldTemplate.types.${field.type}`),
      field.type === 'select' ? (field.options ?? []).join(', ') : '',
      field.required ? t('fieldTemplate.required') : '',
    ]
      .filter(Boolean)
      .join(' · ');

  /**
   * 完善's marks: each value and field that differs from what the category
   * holds, with what it was (and why, when the model said).
   */
  const markAgainstRecord = (
    nextValues: Readonly<Record<string, unknown>>,
    nextFields: readonly TemplateField[],
  ) => {
    if (!record) return;
    const note = (before: string, key: string) =>
      t('fieldTemplate.changedFrom', {
        before,
        reason: reasonsRef.current.get(key) ?? '',
      });
    setChanges(
      new Map(
        fields.flatMap((field) => {
          const was = record[field.key];
          const now = nextValues[field.key];
          const same =
            typeof now === 'boolean'
              ? Boolean(was) === now
              : text(was) === text(now);
          return same
            ? []
            : [[field.key, note(shown(field.key, was), field.key)] as const];
        }),
      ),
    );
    const held = new Map(recordTemplate.map((field) => [field.key, field]));
    setFieldMarks({
      added: new Set(
        nextFields
          .filter((field) => !held.has(field.key))
          .map((field) => field.key),
      ),
      changed: new Map(
        nextFields.flatMap((field) => {
          const was = held.get(field.key);
          return was && describe(was) !== describe(field)
            ? [[field.key, note(describe(was), field.key)] as const]
            : [];
        }),
      ),
    });
  };

  /** Puts an answer into the form and the fields' editor. */
  const fill = (
    nextValues: Readonly<Record<string, unknown>>,
    nextFields: readonly TemplateField[],
  ) => {
    setValues({ ...nextValues });
    setSeedFields(nextFields);
    setTemplate(nextFields);
    markAgainstRecord(nextValues, nextFields);
    setSeed((known) => known + 1);
    setFilled(true);
    setTab('form');
  };

  /**
   * Asks the model: to fill the form from the material, or to change the
   * form as it stands (`instruction`), which hands it back whole.
   */
  const ask = async (instruction?: string) => {
    if (!material.trim() || busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const answer = await read({
        task: 'category',
        material,
        context: {
          parentId: text(values.parentId) || null,
          ...(record ? { categoryId: text(record.id) } : {}),
          ...(instruction
            ? { form: { ...values, fieldTemplate: template } }
            : {}),
        },
        ...(instruction ? { instruction } : {}),
      });
      const reading = answer.reading as CategoryReading | null;
      if (!reading?.values) {
        setFailure(answer.said || t('masterCapture.nothing'));
        setFailureAnswered(true);
        return;
      }
      setMarks(
        new Set(
          (reading.uncertain ?? []).filter((key) => key !== 'fieldTemplate'),
        ),
      );
      // Filling, the parent's fields come first and the suggestions after;
      // adjusting, the fields are the form's as the model hands them back.
      const answered = parseTemplate(reading.fieldTemplate);
      const kept = new Set(baseTemplate.map((field) => field.key));
      fill(
        { ...values, ...reading.values },
        instruction
          ? record
            ? keepHeldFields(recordTemplate, template, answered)
            : answered
          : [
              ...baseTemplate,
              ...answered.filter((field) => !kept.has(field.key)),
            ],
      );
      setDuplicates(reading.duplicates ?? []);
      if (instruction)
        setTurns((known) => [
          ...known,
          {
            id: createUuid(),
            from: 'ai',
            text: answer.said || t('masterCapture.filled'),
          },
        ]);
      else {
        setSaid(answer.said || undefined);
        setTurns([]);
      }
    } catch (caught) {
      setFailure(apiErrorBody(caught)?.message ?? errorMessage(caught));
      setFailureAnswered(false);
    } finally {
      setBusy(false);
    }
  };

  /** 完善: what the model suggests for the category as it is. */
  const refine = async () => {
    if (!record) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const answer = await read({
        task: 'categoryFields',
        material: text(record.name) || 'category',
        context: { categoryId: text(record.id) },
      });
      const reading = answer.reading as {
        fields?: unknown;
        changes?: unknown;
        defaults?: unknown;
      } | null;
      const fieldChanges = Array.isArray(reading?.changes)
        ? (reading.changes as FieldChange[]).filter(
            (change) => typeof change?.key === 'string',
          )
        : [];
      for (const change of fieldChanges)
        if (change.reason) reasonsRef.current.set(change.key, change.reason);
      const suggested = applyFieldSuggestion(
        recordTemplate,
        parseTemplate(reading?.fields),
        fieldChanges,
        () => '',
      );
      const defaults = categoryDefaultsOf(reading?.defaults);
      const nextValues: Record<string, unknown> = { ...values };
      for (const key of CATEGORY_DEFAULT_KEYS)
        if (defaults[key] !== undefined) nextValues[key] = defaults[key];
      fill(nextValues, suggested.fields);
      setSaid(answer.said || undefined);
    } catch (caught) {
      setFailure(apiErrorBody(caught)?.message ?? errorMessage(caught));
      setFailureAnswered(false);
    } finally {
      setBusy(false);
    }
  };
  // 完善 asks once, as it opens.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!refining || askedRef.current) return;
    askedRef.current = true;
    void refine();
  });

  const organise = () => ask();
  const adjust = (instruction: string) => {
    const words = instruction.trim();
    if (!words) return;
    setTurns((known) => [
      ...known,
      { id: createUuid(), from: 'user', text: words },
    ]);
    void ask(words);
  };

  const close = (next: boolean) => {
    if (!next) {
      mutations.create.reset();
      mutations.update.reset();
    }
    onOpenChange(next);
  };

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={close}
      title={
        title ??
        (record
          ? t('categories.refineTitle', { name: text(record.name) })
          : t('categories.new'))
      }
      fields={fields}
      columns={2}
      {...(record ? { recordId: text(record.id) } : {})}
      values={values}
      onValuesChange={(next, key) => {
        setValues(next);
        if (marks.has(key))
          setMarks((known) => {
            const left = new Set(known);
            left.delete(key);
            return left;
          });
      }}
      marks={marks}
      changes={changes}
      {...(derive ? { derive } : {})}
      titleAside={
        ai.available && !refining ? (
          <Tabs
            value={current}
            onValueChange={(value) => setTab(value as 'ai' | 'form')}
          >
            <TabsList>
              <TabsTrigger
                value='ai'
                className='text-primary data-active:text-primary'
              >
                <Sparkles data-icon='inline-start' />
                {t('procurement.capture.aiTab')}
              </TabsTrigger>
              <TabsTrigger value='form'>
                {t('procurement.capture.formTab')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : undefined
      }
      replacement={
        // 完善 waits for the model's first answer before showing the form.
        refining && !filled ? (
          failure ? (
            <CaptureFailure text={failure} answered={failureAnswered} />
          ) : (
            <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
              <Spinner />
              {t('categories.refining')}
            </p>
          )
        ) : current === 'ai' ? (
          <div className='grid gap-2'>
            <Textarea
              autoFocus
              value={material}
              disabled={busy}
              maxLength={2000}
              className='min-h-24'
              placeholder={t('categoryCapture.placeholder')}
              aria-label={t('masterCapture.material')}
              onChange={(event) => setMaterial(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void organise();
                }
              }}
            />
            <div className='flex justify-end'>
              <Button
                type='button'
                disabled={busy || !material.trim()}
                onClick={() => void organise()}
              >
                {busy ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <Sparkles data-icon='inline-start' />
                )}
                {t(
                  busy
                    ? 'procurement.capture.organising'
                    : 'procurement.capture.organise',
                )}
              </Button>
            </div>
            {failure ? (
              <CaptureFailure text={failure} answered={failureAnswered} />
            ) : null}
          </div>
        ) : undefined
      }
      // Above the form: the categories already called the same.
      prelude={
        filled && current === 'form' && duplicates.length > 0 ? (
          <p className='rounded-md border border-warning bg-warning/20 px-3 py-2 text-sm text-warning-foreground'>
            {t('categoryCapture.duplicates')}
            {duplicates.map((row, index) => (
              <Fragment key={row.id}>
                {index > 0 ? '、' : null}
                <a
                  href={resolveAppUrl(`/categories?selected=${row.id}`)}
                  target='_blank'
                  rel='noreferrer'
                  className='text-info-foreground hover:underline'
                >
                  {row.name}
                </a>
              </Fragment>
            ))}
          </p>
        ) : undefined
      }
      // Beside the form: what the model said, and where to ask it for a
      // change — the whole form, the fields under it too.
      aside={
        filled ? (
          <div className='grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
            <p className='flex gap-2'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
              <span className='min-w-0'>
                <CollapsibleText
                  text={said ?? t('masterCapture.filled')}
                  chars={200}
                  lines={4}
                />
              </span>
            </p>
            <div className='grid gap-2 border-t border-border pt-2'>
              <CaptureTurns turns={turns}>
                {failure && turns.length > 0 ? (
                  <CaptureFailure
                    text={failure}
                    answered={failureAnswered}
                    inline
                  />
                ) : null}
              </CaptureTurns>
              <Textarea
                value={instruction}
                disabled={busy}
                maxLength={1000}
                className='bg-background'
                placeholder={t('capture.adjustPlaceholder')}
                aria-label={t('procurement.capture.adjust')}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    // Enter here adjusts; it must not submit the form.
                    event.preventDefault();
                    adjust(instruction);
                    setInstruction('');
                  }
                }}
              />
              <Button
                type='button'
                className='justify-self-end'
                disabled={busy || !instruction.trim()}
                onClick={() => {
                  adjust(instruction);
                  setInstruction('');
                }}
              >
                {busy ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <Sparkles data-icon='inline-start' />
                )}
                {t(
                  busy
                    ? 'procurement.capture.adjusting'
                    : 'procurement.capture.adjust',
                )}
              </Button>
            </div>
          </div>
        ) : undefined
      }
      // The fields are edited right here: the same editor as the category's
      // card, embedded, saved with the form.
      postlude={
        filled ? (
          <FieldTemplateEditor
            key={seed}
            value={seedFields}
            editable
            onSave={() => Promise.resolve()}
            embedded={{
              onChange: changeFields,
              showProblems: attempted,
            }}
            {...(fieldMarks ? { marks: fieldMarks } : {})}
          />
        ) : undefined
      }
      submitting={mutations.create.isPending || mutations.update.isPending}
      error={mutations.create.error ?? mutations.update.error}
      onSubmit={async (payload) => {
        // A field still missing its name or key stops the save, and the
        // editor shows where.
        if (!templateValid) {
          setAttempted(true);
          throw new Error(t('categoryCapture.fieldsInvalid'));
        }
        if (record) {
          const saved = await mutations.update.mutateAsync({
            id: record.id,
            input: { ...payload, fieldTemplate: template, $origin: 'ai' },
          });
          onCreated(saved);
        } else {
          const created = await mutations.create.mutateAsync({
            ...payload,
            ...(template.length > 0 ? { fieldTemplate: template } : {}),
            // Filled by AI 整理: its history says so.
            ...(filled ? { $origin: 'ai' } : {}),
          });
          onCreated(created);
        }
        onOpenChange(false);
      }}
    />
  );
}
