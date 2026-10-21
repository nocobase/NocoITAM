import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert, Globe, Sparkles } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { ManufacturerCaptureDialog } from '@/components/itam/manufacturer-capture-dialog';
import {
  initialFormValues,
  RecordFormDialog,
} from '@/components/itam/record-form-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  masterDataPath,
  useItamMutations,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { templateOf } from '@/lib/itam/field-template';
import type { FieldDefinition } from '@/lib/itam/fields';
import { formatDate, text, titlePrefixFor } from '@/lib/itam/format';
import {
  applyMasterCapture,
  attributeKey,
  withAttributes,
  type MasterCapture,
  type MasterCaptureCollection,
} from '@/lib/itam/master-capture';
import { masterDataByName } from '@/lib/itam/master-data';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { referencePath, useReferenceNames } from '@/lib/itam/references';
import {
  useMasterCapture,
  type MasterCaptureState,
} from '@/lib/itam/use-master-capture';

export interface MasterCreateDialogProps {
  readonly collection: MasterCaptureCollection;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initial?: Readonly<Record<string, unknown>>;
  /** Tightens a field, e.g. a purchase line's model must be of its kind. */
  readonly narrow?: (field: FieldDefinition) => FieldDefinition;
  readonly onCreated: (record: ItamRecord) => void;
  /**
   * 完善 (2026-10-21): the record on the books, which the reading checks and
   * completes in this same dialog, marked 修改 where it differs; saving
   * updates it.
   */
  readonly record?: ItamRecord;
}

/** A record's extended fields, as the form holds them (`attributes.<key>`). */
function attributeValues(
  record: ItamRecord | undefined,
): Record<string, unknown> {
  let attributes: unknown = record?.attributes;
  if (typeof attributes === 'string')
    try {
      attributes = JSON.parse(attributes);
    } catch {
      attributes = undefined;
    }
  if (!attributes || typeof attributes !== 'object') return {};
  return Object.fromEntries(
    Object.entries(attributes as Record<string, unknown>).map(
      ([key, value]) => [attributeKey(key), value],
    ),
  );
}

/**
 * 创建型号 / 创建软件产品 (2026-10-06). With the assistant available it opens
 * on AI 整理: the reader writes the maker and the model, the assistant looks
 * the rest up on the web and fills the form, which then shows 请核对 on what
 * it was not sure of, the pages it read, a maker the books do not hold yet
 * (with 新建制造商), records already on the books, and a line to tell it
 * what to change. Without the assistant it is the plain form. Nothing is
 * saved until the reader saves.
 */
export function MasterCreateDialog(
  props: MasterCreateDialogProps,
): ReactElement {
  // Nothing while closed: the form registers the capture's page tool under
  // one context id per collection, and a purchase order mounts one of these
  // beside every line, so two closed forms threw "already registered" and
  // took the page down. A fresh form, and a fresh capture, for every opening.
  if (!props.open) return <Fragment />;
  return (
    <MasterCreateForm key={JSON.stringify(props.initial ?? {})} {...props} />
  );
}

function MasterCreateForm({
  collection,
  open,
  onOpenChange,
  initial,
  narrow,
  onCreated,
  record,
}: MasterCreateDialogProps): ReactElement {
  const { t } = useTranslation();
  const meta = masterDataByName(collection)!;
  const mutations = useItamMutations(referencePath(collection));
  const fields = useMemo(
    () =>
      meta.fields
        .filter((field) => field.form !== false)
        .map((field) => (narrow ? narrow(field) : field)),
    [meta, narrow],
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    record
      ? { ...initialFormValues(fields, record), ...attributeValues(record) }
      : initialFormValues(fields, initial),
  );
  // A model fills its category's extended fields (2026-10-06), right after
  // its specification: they are the structured half of it, and a new device
  // of the model starts with them.
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    collection === 'models' && values.categoryId
      ? text(values.categoryId)
      : undefined,
  );
  const shared = useMemo(
    () =>
      collection === 'models'
        ? templateOf(category.data?.fieldTemplate).filter(
            (field) => !field.hidden,
          )
        : [],
    [collection, category.data],
  );
  const formFields = useMemo(() => {
    if (shared.length === 0) return fields;
    const extra = shared.map((field): FieldDefinition => ({
      key: attributeKey(field.key),
      label: field.label,
      type: field.type,
      options: field.options?.map((option) => ({
        value: option,
        label: option,
      })),
    }));
    const at = fields.findIndex((field) => field.key === 'specification');
    return at < 0
      ? [...fields, ...extra]
      : [...fields.slice(0, at + 1), ...extra, ...fields.slice(at + 1)];
  }, [fields, shared]);
  const [tab, setTab] = useState<'ai' | 'form'>();
  // What a reader coming from a purchase line already has: its name and
  // part code.
  const [material, setMaterial] = useState(() =>
    [text(initial?.name), text(initial?.code)]
      .filter((part, index, parts) => part && parts.indexOf(part) === index)
      .join(' '),
  );
  const [result, setResult] = useState<MasterCapture>();
  // Fields the assistant filled without being sure; a field leaves the set
  // when somebody changes it.
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  const names = useReferenceNames(
    useMemo(
      () => [
        { collection: 'manufacturers', ids: [text(values.manufacturerId)] },
        { collection: 'categories', ids: [text(values.categoryId)] },
      ],
      [values.manufacturerId, values.categoryId],
    ),
  );
  const capture = useMasterCapture({
    collection,
    // The form as the reader sees it: references by name.
    form: () => ({
      ...withAttributes(
        values,
        shared.map((field) => field.key),
      ),
      manufacturer:
        names.manufacturers?.get(text(values.manufacturerId)) ?? null,
      category: names.categories?.get(text(values.categoryId)) ?? null,
    }),
    onFill: (next) => {
      setValues((current) => applyMasterCapture(current, next));
      setMarks(new Set(next.uncertain));
      setResult(next);
      setTab('form');
    },
    refine: Boolean(record),
  });
  // 完善 has no AI 整理 tab: it is the form, once the reading is in.
  const current = record
    ? 'form'
    : (tab ?? (capture.available ? 'ai' : 'form'));
  const maker = names.manufacturers?.get(text(record?.manufacturerId));
  // 完善 asks once, as it opens, when the categories, the record's maker and
  // its category's fields are there to send with it.
  const askedRef = useRef(false);
  const refineReady =
    Boolean(record) &&
    capture.ready &&
    // The maker's names loaded, though a maker since deleted has none.
    (!record?.manufacturerId || names.manufacturers !== undefined) &&
    // Only a model carries its category's extended fields; a software
    // product has none to wait for.
    (collection !== 'models' || !record?.categoryId || category.isSuccess);
  useEffect(() => {
    if (!refineReady || askedRef.current || !record) return;
    askedRef.current = true;
    capture.organise(
      [
        titlePrefixFor(maker ?? '', record.name),
        text(record.name),
        text(record.code),
      ]
        .filter(Boolean)
        .join(' '),
    );
  });
  // What 完善 changed, each with what it was, against the record.
  const changes = useMemo(() => {
    if (!record || !result) return undefined;
    const held: Record<string, unknown> = {
      ...record,
      ...attributeValues(record),
    };
    const shown = (field: FieldDefinition, value: unknown): string => {
      if (value === null || value === undefined || value === '') return '—';
      if (field.key === 'manufacturerId')
        return names.manufacturers?.get(text(value)) ?? text(value);
      if (field.key === 'categoryId')
        return names.categories?.get(text(value)) ?? text(value);
      if (field.type === 'date') return formatDate(value);
      return text(value);
    };
    const same = (a: unknown, b: unknown) =>
      (a === null || a === undefined || a === '' ? '' : text(a)) ===
      (b === null || b === undefined || b === '' ? '' : text(b));
    return new Map(
      formFields.flatMap((field) =>
        same(held[field.key], values[field.key])
          ? []
          : [
              [
                field.key,
                t('fieldTemplate.changedFrom', {
                  before: shown(field, held[field.key]),
                  reason: '',
                }),
              ] as const,
            ],
      ),
    );
  }, [record, result, formFields, values, names, t]);
  const [creatingManufacturer, setCreatingManufacturer] = useState(false);
  const mayCreateManufacturer = useCollectionPermissions('manufacturers', [
    'create',
  ]).create;
  const close = (next: boolean) => {
    if (!next) {
      mutations.create.reset();
      mutations.update.reset();
      capture.release();
    }
    onOpenChange(next);
  };

  return (
    <>
      <RecordFormDialog
        open={open}
        onOpenChange={close}
        title={
          record
            ? t('masterEnrich.title', {
                name: [
                  titlePrefixFor(maker ?? '', record.name),
                  text(record.name),
                ]
                  .filter(Boolean)
                  .join(' '),
              })
            : t(`${meta.i18n}.new`)
        }
        {...(record ? { recordId: text(record.id) } : {})}
        description={
          current === 'ai' && !record
            ? t(`masterCapture.description.${collection}`)
            : undefined
        }
        fields={formFields}
        columns={2}
        prelude={
          result && current === 'form' ? (
            <CapturePrelude
              collection={collection}
              result={result}
              self={record ? text(record.id) : undefined}
            />
          ) : undefined
        }
        // The category's fields stand apart from the model's own, under
        // 扩展字段, so the reader sees which came from the category.
        section={
          shared.length > 0
            ? {
                title: t('groups.extended'),
                keys: new Set(shared.map((field) => attributeKey(field.key))),
              }
            : undefined
        }
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
        {...(changes ? { changes } : {})}
        titleAside={
          capture.available && !record ? (
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
          // 完善 waits for the reading before showing the form.
          record && !result ? (
            capture.failure ? (
              <p className='text-sm text-destructive'>
                <CollapsibleText text={capture.failure} chars={160} lines={3} />
              </p>
            ) : (
              <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
                <Spinner />
                {t(
                  capture.searches
                    ? 'masterEnrich.searching'
                    : 'masterEnrich.refining',
                )}
              </p>
            )
          ) : current === 'ai' ? (
            <MaterialPane
              collection={collection}
              capture={capture}
              material={material}
              onMaterial={setMaterial}
            />
          ) : undefined
        }
        aside={
          result ? (
            <CaptureNotes
              capture={capture}
              result={result}
              onCreateManufacturer={
                mayCreateManufacturer
                  ? () => setCreatingManufacturer(true)
                  : undefined
              }
            />
          ) : undefined
        }
        submitting={mutations.create.isPending || mutations.update.isPending}
        error={mutations.create.error ?? mutations.update.error}
        onSubmit={async (payload) => {
          if (record) {
            const saved = await mutations.update.mutateAsync({
              id: text(record.id),
              input: {
                ...withAttributes(
                  payload,
                  shared.map((field) => field.key),
                ),
                // Checked by 完善: its history says so.
                $origin: 'ai',
              },
            });
            capture.release();
            onCreated(saved);
            onOpenChange(false);
            return;
          }
          const created = await mutations.create.mutateAsync({
            ...withAttributes(
              payload,
              shared.map((field) => field.key),
            ),
            // Filled by AI 整理: its history says so (2026-10-20).
            ...(result ? { $origin: 'ai' } : {}),
          });
          capture.release();
          onCreated(created);
          onOpenChange(false);
        }}
      />
      {/* A sibling, not inside the form: a submit inside a portal still
          bubbles to the form around it in React's tree. Looked up on the
          web as it opens (2026-10-21), mounted only while open. */}
      {creatingManufacturer ? (
        <ManufacturerCaptureDialog
          open
          onOpenChange={setCreatingManufacturer}
          name={result?.manufacturerName ?? ''}
          onCreated={(created) => {
            setValues((known) => ({
              ...known,
              manufacturerId: text(created.id),
            }));
            setResult((known) =>
              known ? { ...known, manufacturerName: null } : known,
            );
            setCreatingManufacturer(false);
          }}
        />
      ) : null}
    </>
  );
}

/** The AI 整理 tab: what the reader knows, and the button that looks it up. */
function MaterialPane({
  collection,
  capture,
  material,
  onMaterial,
}: {
  readonly collection: MasterCaptureCollection;
  readonly capture: MasterCaptureState;
  readonly material: string;
  readonly onMaterial: (value: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const busy = capture.busy;
  const go = () => {
    if (material.trim() && !busy) capture.organise(material);
  };
  return (
    <div className='grid gap-2'>
      <Textarea
        autoFocus
        value={material}
        disabled={busy}
        maxLength={5000}
        className='max-h-[40svh] min-h-28'
        placeholder={t(`masterCapture.placeholder.${collection}`)}
        aria-label={t('masterCapture.material')}
        onChange={(event) => onMaterial(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            go();
          }
        }}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
          <Globe className='size-3.5 shrink-0' />
          {t(
            capture.searches
              ? 'masterCapture.willSearch'
              : 'masterCapture.cannotSearch',
          )}
        </span>
        {/* Blue like every AI entry, filled because it is this tab's one
            action — as on the purchase order's AI 整理. */}
        <Button
          type='button'
          className='bg-primary text-primary-foreground hover:bg-primary/90'
          disabled={busy || !material.trim()}
          onClick={go}
        >
          {busy ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <Sparkles data-icon='inline-start' />
          )}
          {t(
            busy
              ? capture.searches
                ? 'masterCapture.searching'
                : 'procurement.capture.organising'
              : 'procurement.capture.organise',
          )}
        </Button>
      </div>
      {/* What the AI asks for reads as its reply, not as an error
          (2026-10-21); a failure is still red. */}
      {capture.failure && capture.mode === 'organise' ? (
        capture.failureAnswered ? (
          <p className='flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
            <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
            <span className='min-w-0'>
              <CollapsibleText text={capture.failure} chars={200} lines={4} />
            </span>
          </p>
        ) : (
          <p className='flex gap-2 text-sm text-destructive'>
            <CircleAlert className='mt-0.5 size-4 shrink-0' />
            <span className='min-w-0'>
              <CollapsibleText text={capture.failure} chars={160} lines={3} />
            </span>
          </p>
        )
      ) : null}
    </div>
  );
}

/**
 * Beside the form once AI 整理 filled it: what the assistant said, where it
 * read it, a maker the books lack, and where to ask for a change.
 */
function CaptureNotes({
  capture,
  result,
  onCreateManufacturer,
}: {
  readonly capture: MasterCaptureState;
  readonly result: MasterCapture;
  /** Opens 新建制造商; absent for a reader who may not create one. */
  readonly onCreateManufacturer: (() => void) | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');
  const busy = capture.busy;
  const adjusting = busy && capture.mode === 'adjust';
  const send = () => {
    if (!instruction.trim() || busy) return;
    capture.adjust(instruction);
    setInstruction('');
  };
  return (
    <div className='grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
      <p className='flex gap-2'>
        <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
        <span className='min-w-0'>
          {capture.summary ? (
            <CollapsibleText text={capture.summary} chars={200} lines={4} />
          ) : (
            t('masterCapture.filled')
          )}
        </span>
      </p>
      {/* Where it came from — or that it came from nowhere but the model,
          which is when every value wants checking. */}
      {capture.searched && result.sources.length > 0 ? (
        <div className='grid gap-1 pl-6'>
          <p className='text-xs text-muted-foreground'>
            {t('masterCapture.sources')}
          </p>
          <ul className='grid gap-0.5 text-xs'>
            {result.sources.map((source) => (
              <li key={source.url} className='min-w-0'>
                <a
                  href={source.url}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='block truncate text-info-foreground hover:underline'
                  title={source.url}
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className='pl-6 text-xs text-warning-foreground'>
          {t(
            capture.searched
              ? 'masterCapture.noSources'
              : 'masterCapture.notSearched',
          )}
        </p>
      )}
      {result.manufacturerName ? (
        <div className='grid gap-1.5 pl-6'>
          <p className='text-warning-foreground wrap-anywhere'>
            {t('masterCapture.manufacturerNotFound', {
              name: result.manufacturerName,
            })}
          </p>
          {onCreateManufacturer ? (
            <Button
              type='button'
              variant='outline'
              className='justify-self-start bg-background'
              onClick={onCreateManufacturer}
            >
              {t('manufacturers.new')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className='grid gap-2 border-t border-border pt-2'>
        {capture.turns.map((turn) =>
          turn.from === 'user' ? (
            <p
              key={turn.id}
              className='ml-auto max-w-[90%] rounded-lg bg-background px-3 py-1.5 whitespace-pre-wrap'
            >
              {turn.text}
            </p>
          ) : (
            <p
              key={turn.id}
              className='flex max-w-[90%] gap-1.5 text-muted-foreground'
            >
              <span className='flex h-[1lh] shrink-0 items-center'>
                <Sparkles className='size-3.5 text-primary' />
              </span>
              <span className='min-w-0'>
                <CollapsibleText text={turn.text} chars={200} lines={3} />
              </span>
            </p>
          ),
        )}
        {capture.failure && capture.mode === 'adjust' ? (
          <p className='text-destructive'>
            <CollapsibleText text={capture.failure} chars={160} lines={3} />
          </p>
        ) : null}
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
              // Enter here adjusts; it must not submit the form around it.
              event.preventDefault();
              send();
            }
          }}
        />
        <Button
          type='button'
          className='justify-self-end'
          disabled={busy || !instruction.trim()}
          onClick={send}
        >
          {adjusting ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <Sparkles data-icon='inline-start' />
          )}
          {t(
            adjusting
              ? 'procurement.capture.adjusting'
              : 'procurement.capture.adjust',
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Above the form AI 整理 filled: the records the books already hold for it,
 * read before checking the fields, not in the column beside them. What
 * 请核对 means is the mark's own tooltip.
 */
function CapturePrelude({
  collection,
  result,
  self,
}: {
  readonly collection: MasterCaptureCollection;
  readonly result: MasterCapture;
  /** 完善: the record itself, which is no duplicate of itself. */
  readonly self?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const route = masterDataByName(collection)!.route;
  const duplicates = result.duplicates.filter((row) => row.id !== self);
  const similar = (result.similar ?? []).filter((row) => row.id !== self);
  if (duplicates.length === 0 && similar.length === 0) return null;
  // The label and its records on one line, the records as links.
  const line = (
    label: string,
    rows: readonly { id: string; name: string }[],
  ) => (
    <p className='min-w-0 text-warning-foreground'>
      {label}
      {rows.map((row, index) => (
        <Fragment key={row.id}>
          {index > 0 ? '、' : null}
          {/* A new tab: following the link must not lose the form. */}
          <a
            href={resolveAppUrl(`/${route}/${row.id}`)}
            target='_blank'
            rel='noreferrer'
            className='text-info-foreground wrap-anywhere hover:underline'
          >
            {row.name}
          </a>
        </Fragment>
      ))}
    </p>
  );
  // One box for the records the books may already hold.
  return (
    <div className='grid gap-1.5 rounded-md border border-warning bg-warning/20 px-3 py-2 text-sm'>
      {duplicates.length > 0
        ? line(t(`masterCapture.duplicates.${collection}`), duplicates)
        : null}
      {similar.length > 0
        ? line(t(`masterCapture.similar.${collection}`), similar)
        : null}
    </div>
  );
}
