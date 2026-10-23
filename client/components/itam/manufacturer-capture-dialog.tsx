import { useTranslation } from '@nocobase/i18n/client';
import { Globe, Sparkles } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { CaptureFailure } from '@/components/itam/ai/capture-failure';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import {
  initialFormValues,
  RecordFormDialog,
} from '@/components/itam/record-form-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAiStatus } from '@/lib/itam/ai';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import { useItamMutations, type ItamRecord } from '@/lib/itam/api';
import { errorMessage, text, todayIso } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';
import { referencePath } from '@/lib/itam/references';

const FIELDS = masterDataByName('manufacturers')!.fields.filter(
  (field) => field.form !== false,
);
/** What a reading may fill: the form's own fields, nothing else. */
const READ_KEYS = [
  'name',
  'website',
  'supportUrl',
  'supportPhone',
  'supportEmail',
] as const;

interface Source {
  readonly title: string;
  readonly url: string;
}

export interface ManufacturerCaptureDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Look this maker up as the dialog opens (a maker AI 整理 named). */
  readonly name?: string;
  /** 完善: the maker on the books, checked and completed, then updated. */
  readonly record?: ItamRecord;
  readonly onCreated: (record: ItamRecord) => void;
}

/**
 * A manufacturer, looked up on the web (2026-10-21): its official site,
 * support site and business support contact fill the form, 请核对 on what
 * the AI was not sure of and the pages it read beside it. Three ways in —
 * a maker AI 整理 named but the books lack (looked up as it opens), 创建制造商
 * on the list (AI 整理 / 表单录入, as a model's), and 完善 on a maker's page,
 * which marks 修改 where the reading differs and updates the record.
 * Nothing is saved until the reader saves; without a model it is the plain
 * form.
 */
export function ManufacturerCaptureDialog(
  props: ManufacturerCaptureDialogProps,
): ReactElement {
  // A fresh lookup for every opening.
  if (!props.open) return <Fragment />;
  return <ManufacturerCaptureForm {...props} />;
}

function ManufacturerCaptureForm({
  open,
  onOpenChange,
  name,
  record,
  onCreated,
}: ManufacturerCaptureDialogProps): ReactElement {
  const { t } = useTranslation();
  const ai = useItamAi();
  const searches = useAiStatus().data?.webSearch === true;
  const read = useAiReading();
  const mutations = useItamMutations(referencePath('manufacturers'));
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(FIELDS, record ?? { name: name ?? '' }),
  );
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  const [said, setSaid] = useState<string>();
  const [sources, setSources] = useState<readonly Source[]>([]);
  const [failure, setFailure] = useState<{
    readonly text: string;
    readonly answered: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);
  // Typed on the list's AI 整理 tab; a named maker or a record asks itself.
  const [material, setMaterial] = useState('');
  const [tab, setTab] = useState<'ai' | 'form'>();
  const asksItself = Boolean(record) || Boolean(name?.trim());
  const current = asksItself ? 'form' : (tab ?? (ai.available ? 'ai' : 'form'));

  const lookUp = async (maker: string) => {
    setBusy(true);
    setFailure(undefined);
    try {
      const answer = await read({
        task: 'manufacturer',
        material: maker,
        context: {
          today: todayIso(),
          // 完善 checks the record rather than filling a blank form.
          ...(record
            ? {
                refine: true,
                form: Object.fromEntries(
                  READ_KEYS.map((key) => [key, record[key] ?? null]),
                ),
              }
            : {}),
        },
      });
      const reading = answer.reading;
      if (!reading) {
        setFailure({
          text: answer.said || t('masterCapture.nothing'),
          answered: true,
        });
        return;
      }
      const next: Record<string, unknown> = {};
      for (const key of READ_KEYS) {
        const value = text(reading[key]).trim();
        if (value) next[key] = value;
      }
      setValues((known) => ({ ...known, ...next }));
      setMarks(
        new Set(
          (Array.isArray(reading.uncertain) ? reading.uncertain : [])
            .map((key) => text(key))
            .filter((key) => key in next),
        ),
      );
      setSources(
        (Array.isArray(reading.sources) ? reading.sources : [])
          .map((source) => source as Partial<Source>)
          .filter((source): source is Source =>
            Boolean(source.url && /^https?:\/\//.test(source.url)),
          ),
      );
      setSaid(answer.said || undefined);
      setFilled(true);
      setTab('form');
    } catch (error) {
      setFailure({ text: errorMessage(error), answered: false });
    } finally {
      setBusy(false);
    }
  };

  // A named maker or a record is looked up once, as the dialog opens.
  const askedRef = useRef(false);
  const auto = record ? text(record.name) : (name ?? '').trim();
  useEffect(() => {
    if (!open || !ai.available || !auto || askedRef.current) return;
    askedRef.current = true;
    void lookUp(auto);
  });

  // 完善: what the reading changed, each with what it was.
  const changes = useMemo(() => {
    if (!record || !filled) return undefined;
    const was = (value: unknown) =>
      value === null || value === undefined || value === '' ? '' : text(value);
    return new Map(
      READ_KEYS.flatMap((key) =>
        was(record[key]) === was(values[key])
          ? []
          : [
              [
                key,
                t('fieldTemplate.changedFrom', {
                  before: was(record[key]) || '—',
                  reason: '',
                }),
              ] as const,
            ],
      ),
    );
  }, [record, filled, values, t]);

  const waiting = asksItself && ai.available && !filled && !failure;
  return (
    <RecordFormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          mutations.create.reset();
          mutations.update.reset();
        }
        onOpenChange(next);
      }}
      title={
        record
          ? t('masterEnrich.title', { name: text(record.name) })
          : t('manufacturers.new')
      }
      {...(record ? { recordId: text(record.id) } : {})}
      fields={FIELDS}
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
        ai.available && !asksItself ? (
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
        waiting ? (
          <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
            <Spinner />
            {t(
              searches
                ? 'manufacturerCapture.searching'
                : 'manufacturerCapture.reading',
              { name: auto },
            )}
          </p>
        ) : current === 'ai' && !asksItself ? (
          <div className='grid gap-2'>
            <Textarea
              autoFocus
              value={material}
              disabled={busy}
              maxLength={500}
              className='min-h-20'
              placeholder={t('manufacturerCapture.placeholder')}
              aria-label={t('masterCapture.material')}
              onChange={(event) => setMaterial(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  if (material.trim() && !busy) void lookUp(material.trim());
                }
              }}
            />
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <span className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
                <Globe className='size-3.5 shrink-0' />
                {t(
                  searches
                    ? 'masterCapture.willSearch'
                    : 'masterCapture.cannotSearch',
                )}
              </span>
              <Button
                type='button'
                className='bg-primary text-primary-foreground hover:bg-primary/90'
                disabled={busy || !material.trim()}
                onClick={() => void lookUp(material.trim())}
              >
                {busy ? (
                  <Spinner data-icon='inline-start' />
                ) : (
                  <Sparkles data-icon='inline-start' />
                )}
                {t(
                  busy
                    ? searches
                      ? 'masterCapture.searching'
                      : 'procurement.capture.organising'
                    : 'procurement.capture.organise',
                )}
              </Button>
            </div>
            {failure ? (
              <CaptureFailure text={failure.text} answered={failure.answered} />
            ) : null}
          </div>
        ) : undefined
      }
      // A lookup that failed or found nothing says so above the form.
      prelude={
        failure && current === 'form' ? (
          <CaptureFailure text={failure.text} answered={failure.answered} />
        ) : undefined
      }
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
            {sources.length > 0 ? (
              <div className='grid gap-1 pl-6'>
                <p className='text-xs text-muted-foreground'>
                  {t('masterCapture.sources')}
                </p>
                <ul className='grid gap-0.5 text-xs'>
                  {sources.map((source) => (
                    <li key={source.url} className='min-w-0'>
                      <a
                        href={source.url}
                        target='_blank'
                        rel='noreferrer noopener'
                        className='block truncate text-info-foreground hover:underline'
                        title={source.url}
                      >
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className='pl-6 text-xs text-warning-foreground'>
                {t('masterCapture.noSources')}
              </p>
            )}
          </div>
        ) : undefined
      }
      submitting={mutations.create.isPending || mutations.update.isPending}
      error={mutations.create.error ?? mutations.update.error}
      onSubmit={async (payload) => {
        if (record) {
          const saved = await mutations.update.mutateAsync({
            id: text(record.id),
            input: { ...payload, ...(filled ? { $origin: 'ai' } : {}) },
          });
          onCreated(saved);
        } else {
          const created = await mutations.create.mutateAsync({
            ...payload,
            // Looked up by AI: its history says so.
            ...(filled ? { $origin: 'ai' } : {}),
          });
          onCreated(created);
        }
        onOpenChange(false);
      }}
    />
  );
}
