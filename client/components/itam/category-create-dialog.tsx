import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { FieldTemplateEditor } from '@/components/itam/field-template-editor';
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
import { parseTemplate, type TemplateField } from '@/lib/itam/field-template';
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
 * 创建分类 with AI 整理 (2026-10-20): the reader writes what the category is
 * — its name, often what it is for — and the model fills the whole form —
 * where it goes, its kind, its rules, its defaults — and the extended fields
 * its records carry, read against the categories on the books
 * (`categoryFields`' sibling task `category`, checked on the server). The
 * fields show beside the form, each removable, and are saved with it.
 * Without a model it is the plain form. Nothing is saved until the reader
 * saves.
 */
export function CategoryCreateDialog(
  props: CategoryCreateDialogProps,
): ReactElement {
  if (!props.open) return <Fragment />;
  return (
    <CategoryCreateForm key={JSON.stringify(props.initial ?? {})} {...props} />
  );
}

function CategoryCreateForm({
  open,
  onOpenChange,
  onCreated,
  initial,
  title,
  derive,
  baseTemplate = [],
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
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(fields, initial),
  );
  const [tab, setTab] = useState<'ai' | 'form'>();
  const current = tab ?? (ai.available ? 'ai' : 'form');
  const [material, setMaterial] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [said, setSaid] = useState<string>();
  // The fields the editor starts from (the parent's, then the suggestions),
  // re-seeded when AI 整理 answers again; and what it holds now.
  const [seed, setSeed] = useState(0);
  const [seedFields, setSeedFields] = useState<readonly TemplateField[]>(
    () => baseTemplate,
  );
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
  const [duplicates, setDuplicates] = useState<
    NonNullable<CategoryReading['duplicates']>
  >([]);
  const [filled, setFilled] = useState(false);

  const organise = async () => {
    if (!material.trim() || busy) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const answer = await read({
        task: 'category',
        material,
        context: { parentId: text(values.parentId) || null },
      });
      const reading = answer.reading as CategoryReading | null;
      if (!reading?.values) {
        setFailure(answer.said || t('masterCapture.nothing'));
        return;
      }
      setValues((known) => ({ ...known, ...reading.values }));
      setMarks(
        new Set(
          (reading.uncertain ?? []).filter((key) => key !== 'fieldTemplate'),
        ),
      );
      const kept = new Set(baseTemplate.map((field) => field.key));
      const fields = [
        ...baseTemplate,
        ...parseTemplate(reading.fieldTemplate).filter(
          (field) => !kept.has(field.key),
        ),
      ];
      setSeedFields(fields);
      setTemplate(fields);
      setSeed((known) => known + 1);
      setDuplicates(reading.duplicates ?? []);
      setSaid(answer.said || undefined);
      setFilled(true);
      setTab('form');
    } catch (caught) {
      setFailure(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) mutations.create.reset();
    onOpenChange(next);
  };

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={close}
      title={title ?? t('categories.new')}
      description={
        current === 'ai' ? t('categoryCapture.description') : undefined
      }
      fields={fields}
      columns={2}
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
      {...(derive ? { derive } : {})}
      titleAside={
        ai.available ? (
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
        current === 'ai' ? (
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
              <p className='text-sm text-destructive'>
                <CollapsibleText text={failure} chars={160} lines={3} />
              </p>
            ) : null}
          </div>
        ) : undefined
      }
      // Above the form: what AI 整理 said, and the categories already called
      // the same; no column beside it, so the fields' table has the width.
      prelude={
        filled && current === 'form' ? (
          <div className='grid gap-2'>
            <p className='flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
              <span className='min-w-0'>
                {said ?? t('masterCapture.filled')}
              </span>
            </p>
            {duplicates.length > 0 ? (
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
            ) : null}
          </div>
        ) : undefined
      }
      // The fields are edited right here (2026-10-20): the same editor as
      // the category's card, embedded, saved with the form.
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
          />
        ) : undefined
      }
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onSubmit={async (payload) => {
        // A field still missing its name or key stops the save, and the
        // editor shows where.
        if (!templateValid) {
          setAttempted(true);
          throw new Error(t('categoryCapture.fieldsInvalid'));
        }
        const created = await mutations.create.mutateAsync({
          ...payload,
          ...(template.length > 0 ? { fieldTemplate: template } : {}),
        });
        onCreated(created);
        onOpenChange(false);
      }}
    />
  );
}
