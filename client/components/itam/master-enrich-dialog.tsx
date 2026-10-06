import { useTranslation } from '@nocobase/i18n/client';
import { RotateCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReviewMark } from '@/components/itam/review-mark';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  masterDataPath,
  useItamMutations,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { templateOf } from '@/lib/itam/field-template';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';
import {
  attributeKey,
  type MasterCapture,
  type MasterCaptureCollection,
} from '@/lib/itam/master-capture';
import { masterDataByName } from '@/lib/itam/master-data';
import { referencePath, useReferenceNames } from '@/lib/itam/references';
import { useMasterCapture } from '@/lib/itam/use-master-capture';

/**
 * The fields AI 联网补充 compares. The category is left out: it decides what
 * kind of asset the record's devices are, which a web page does not settle.
 */
const COMPARED: Readonly<Record<MasterCaptureCollection, readonly string[]>> = {
  models: [
    'name',
    'code',
    'manufacturerId',
    'specification',
    'warrantyMonths',
    'releaseDate',
    'eolDate',
    'eosDate',
  ],
  softwareProducts: [
    'name',
    'manufacturerId',
    'deliveryMethod',
    'description',
    'website',
  ],
};

/** A different name or maker is another record: offered, never preselected. */
const IDENTITY = new Set(['name', 'manufacturerId']);

const blank = (value: unknown) =>
  value === undefined || value === null || value === '';

interface Row {
  /** The form's key: a field's own, or `attributes.<key>`. */
  readonly key: string;
  readonly label: string;
  readonly field?: FieldDefinition;
  readonly current: unknown;
  readonly found: unknown;
}

/**
 * AI 联网补充 on a model's or software product's page (2026-10-06): the
 * assistant looks the record up under the catalog skill, with its current
 * values as the form, and the dialog lists what it found beside what the
 * books say — only where they differ. A field the books leave empty is
 * ticked; a value that would change is listed unticked, and the name and
 * the maker never start ticked. Nothing changes until 应用所选, which saves
 * the ticked fields like an edit.
 */
export function MasterEnrichDialog({
  collection,
  record,
  open,
  onOpenChange,
}: {
  readonly collection: MasterCaptureCollection;
  readonly record: ItamRecord;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  return (
    <EnrichForm
      key={open ? text(record.id) : 'closed'}
      collection={collection}
      record={record}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function EnrichForm({
  collection,
  record,
  open,
  onOpenChange,
}: {
  readonly collection: MasterCaptureCollection;
  readonly record: ItamRecord;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const meta = masterDataByName(collection)!;
  const mutations = useItamMutations(referencePath(collection));
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    record.categoryId ? text(record.categoryId) : undefined,
  );
  const template = useMemo(
    () =>
      collection === 'models'
        ? templateOf(category.data?.fieldTemplate).filter(
            (field) => !field.hidden,
          )
        : [],
    [collection, category.data],
  );
  const attributes = useMemo(
    () =>
      record.attributes && typeof record.attributes === 'object'
        ? (record.attributes as Record<string, unknown>)
        : {},
    [record.attributes],
  );
  const [result, setResult] = useState<MasterCapture>();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [instruction, setInstruction] = useState('');
  const names = useReferenceNames(
    useMemo(
      () => [
        {
          collection: 'manufacturers',
          ids: [
            text(record.manufacturerId),
            text(result?.values.manufacturerId),
          ],
        },
        { collection: 'categories', ids: [text(record.categoryId)] },
      ],
      [record.manufacturerId, record.categoryId, result],
    ),
  );
  const maker = names.manufacturers?.get(text(record.manufacturerId)) ?? '';

  // What the books say, for the comparison and for the assistant's form.
  const fields = useMemo(
    () =>
      COMPARED[collection].flatMap((key) => {
        const field = meta.fields.find((entry) => entry.key === key);
        return field ? [field] : [];
      }),
    [collection, meta],
  );
  const rows = useMemo((): Row[] => {
    if (!result) return [];
    const found = result.values;
    const foundAttributes =
      found.attributes && typeof found.attributes === 'object'
        ? (found.attributes as Record<string, unknown>)
        : {};
    const differs = (current: unknown, next: unknown) =>
      !blank(next) && text(current).trim() !== text(next).trim();
    return [
      ...fields
        .filter((field) => differs(record[field.key], found[field.key]))
        .map((field) => ({
          key: field.key,
          label: t(field.label),
          field,
          current: record[field.key],
          found: found[field.key],
        })),
      ...template
        .filter((entry) =>
          differs(attributes[entry.key], foundAttributes[entry.key]),
        )
        .map((entry) => ({
          key: attributeKey(entry.key),
          label: entry.label,
          current: attributes[entry.key],
          found: foundAttributes[entry.key],
        })),
    ];
  }, [result, fields, template, record, attributes, t]);

  const capture = useMasterCapture({
    collection,
    purpose: 'enrich',
    form: () => ({
      ...Object.fromEntries(
        fields.map((field) => [field.key, record[field.key] ?? null]),
      ),
      manufacturer: maker || null,
      category: names.categories?.get(text(record.categoryId)) ?? null,
      ...(collection === 'models' ? { attributes } : {}),
    }),
    onFill: (next) => {
      setResult(next);
      // Only what the books leave empty starts ticked; a name or a maker
      // never does, since another one is another record.
      const found = next.values;
      const foundAttributes =
        found.attributes && typeof found.attributes === 'object'
          ? (found.attributes as Record<string, unknown>)
          : {};
      setTicked(
        new Set([
          ...COMPARED[collection].filter(
            (key) =>
              !IDENTITY.has(key) && blank(record[key]) && !blank(found[key]),
          ),
          ...Object.keys(foundAttributes)
            .filter(
              (key) => blank(attributes[key]) && !blank(foundAttributes[key]),
            )
            .map(attributeKey),
        ]),
      );
    },
  });
  // The lookup reads the dialog as page context, so it may start only once
  // the dialog's body is in the page: asked earlier, the chat cannot read
  // the context and never sends.
  const [mounted, setMounted] = useState(false);
  const bodyRef = (element: HTMLDivElement | null) => {
    capture.contextRef(element);
    setMounted(element !== null);
  };

  // The lookup starts as the dialog opens, from what the books say.
  const material = [
    [maker, text(record.name)].filter(Boolean).join(' '),
    record.code ? `${t('fields.modelCode')} ${text(record.code)}` : '',
  ]
    .filter(Boolean)
    .join('，');
  const startedRef = useRef(false);
  useEffect(() => {
    if (!open || !mounted || startedRef.current || !capture.available)
      return;
    // The maker's name is part of what is looked up; wait for it.
    if (record.manufacturerId && !maker) return;
    startedRef.current = true;
    capture.organise(material);
  }, [open, mounted, capture, material, maker, record.manufacturerId]);

  const show = (row: Row, value: unknown): string => {
    if (blank(value)) return '—';
    if (row.key === 'manufacturerId')
      return names.manufacturers?.get(text(value)) ?? '…';
    if (value === true) return t('common.yes');
    if (value === false) return t('common.no');
    const option = row.field?.options?.find(
      (entry) => entry.value === text(value),
    );
    return option ? t(option.label) : text(value);
  };

  const apply = async () => {
    const input: Record<string, unknown> = {};
    const nextAttributes: Record<string, unknown> = { ...attributes };
    let attributesChanged = false;
    for (const row of rows) {
      if (!ticked.has(row.key)) continue;
      if (row.key.startsWith('attributes.')) {
        nextAttributes[row.key.slice('attributes.'.length)] = row.found;
        attributesChanged = true;
      } else input[row.key] = row.found;
    }
    if (attributesChanged) input.attributes = nextAttributes;
    await mutations.update.mutateAsync({ id: text(record.id), input });
    capture.release();
    onOpenChange(false);
  };

  const busy = capture.busy;
  const marks = new Set(result?.uncertain ?? []);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          mutations.update.reset();
          capture.release();
        }
        onOpenChange(next);
      }}
      size='wide'
      title={t('masterEnrich.title', { name: text(record.name) })}
      description={t('masterEnrich.description')}
      busy={mutations.update.isPending}
      error={mutations.update.error}
      confirmLabel={t('masterEnrich.apply', { count: ticked.size })}
      confirmDisabled={busy || ticked.size === 0}
      onConfirm={() => void apply()}
    >
      <div ref={bodyRef} className='grid gap-3 text-sm'>
        {!capture.available ? (
          <p className='text-muted-foreground'>
            {t('masterEnrich.unavailable')}
          </p>
        ) : busy && capture.mode !== 'adjust' ? (
          <p className='flex items-center gap-2 text-muted-foreground'>
            <Spinner />
            {t(
              capture.searches
                ? 'masterCapture.searching'
                : 'procurement.capture.organising',
            )}
          </p>
        ) : capture.failure && !result ? (
          <div className='grid justify-items-start gap-2'>
            <p className='text-destructive'>
              <CollapsibleText text={capture.failure} chars={160} lines={3} />
            </p>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => capture.organise(material)}
            >
              <RotateCw data-icon='inline-start' />
              {t('masterEnrich.retry')}
            </Button>
          </div>
        ) : null}

        {result ? (
          <>
            <p className='flex gap-2'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-success-foreground' />
              <span className='min-w-0'>
                {capture.summary ? (
                  <CollapsibleText
                    text={capture.summary}
                    chars={200}
                    lines={4}
                  />
                ) : (
                  t('masterEnrich.done')
                )}
              </span>
            </p>
            {rows.length === 0 ? (
              <p className='rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground'>
                {t('masterEnrich.nothing')}
              </p>
            ) : (
              <div className='overflow-x-auto rounded-lg border border-border'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/40 text-xs text-muted-foreground'>
                    <tr>
                      <th className='w-8 px-2 py-1.5' />
                      <th className='px-2 py-1.5 text-left font-medium'>
                        {t('masterEnrich.field')}
                      </th>
                      <th className='px-2 py-1.5 text-left font-medium'>
                        {t('masterEnrich.current')}
                      </th>
                      <th className='px-2 py-1.5 text-left font-medium'>
                        {t('masterEnrich.found')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className='border-t border-border align-top'
                      >
                        <td className='px-2 py-2'>
                          <Checkbox
                            checked={ticked.has(row.key)}
                            aria-label={row.label}
                            onCheckedChange={(checked) =>
                              setTicked((known) => {
                                const next = new Set(known);
                                if (checked) next.add(row.key);
                                else next.delete(row.key);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className='px-2 py-2 whitespace-nowrap'>
                          <span className='inline-flex items-center gap-1.5'>
                            {row.label}
                            {marks.has(row.key) ? <ReviewMark /> : null}
                          </span>
                        </td>
                        <td className='min-w-0 px-2 py-2 text-muted-foreground wrap-anywhere'>
                          <CollapsibleText
                            text={show(row, row.current)}
                            chars={120}
                            lines={3}
                          />
                        </td>
                        <td className='min-w-0 px-2 py-2 wrap-anywhere'>
                          <CollapsibleText
                            text={show(row, row.found)}
                            chars={120}
                            lines={3}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {capture.searched && result.sources.length > 0 ? (
              <div className='grid gap-1'>
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
              <p className='text-xs text-warning-foreground'>
                {t(
                  capture.searched
                    ? 'masterCapture.noSources'
                    : 'masterCapture.notSearched',
                )}
              </p>
            )}
            {capture.turns.map((turn) =>
              turn.from === 'user' ? (
                <p
                  key={turn.id}
                  className='ml-auto max-w-[90%] rounded-lg bg-muted px-3 py-1.5 whitespace-pre-wrap'
                >
                  {turn.text}
                </p>
              ) : (
                <p
                  key={turn.id}
                  className='flex max-w-[90%] gap-1.5 text-muted-foreground'
                >
                  <span className='flex h-[1lh] shrink-0 items-center'>
                    <Sparkles className='size-3.5 text-success-foreground' />
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
            <div className='flex gap-2'>
              <Input
                value={instruction}
                disabled={busy}
                maxLength={1000}
                placeholder={t('capture.adjustPlaceholder')}
                aria-label={t('procurement.capture.adjust')}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (instruction.trim() && !busy) {
                      capture.adjust(instruction);
                      setInstruction('');
                    }
                  }
                }}
              />
              <Button
                type='button'
                variant='outline'
                disabled={busy || !instruction.trim()}
                onClick={() => {
                  capture.adjust(instruction);
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
          </>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
