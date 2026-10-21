import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import {
  initialFormValues,
  RecordFormDialog,
} from '@/components/itam/record-form-dialog';
import { Spinner } from '@/components/ui/spinner';
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

/**
 * 创建制造商 from AI 整理 (2026-10-21): the maker a reading named but the
 * books lack. The dialog looks it up on the web as it opens — its official
 * site, support site and business support contact — and fills the form,
 * 请核对 on what it was not sure of and the pages it read beside it.
 * Nothing is saved until the reader creates it; without a model, or when
 * the lookup fails, it is the plain form with the name.
 */
export function ManufacturerCaptureDialog({
  open,
  onOpenChange,
  name,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The maker as the reading named it. */
  readonly name: string;
  readonly onCreated: (record: ItamRecord) => void;
}): ReactElement {
  const { t } = useTranslation();
  const ai = useItamAi();
  const searches = useAiStatus().data?.webSearch === true;
  const read = useAiReading();
  const mutations = useItamMutations(referencePath('manufacturers'));
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(FIELDS, { name }),
  );
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  const [said, setSaid] = useState<string>();
  const [sources, setSources] = useState<readonly Source[]>([]);
  const [answered, setAnswered] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [filled, setFilled] = useState(false);
  // Asked once per opening; reading until it answers.
  const asks = open && ai.available && name.trim() !== '';
  const busy = asks && !answered;
  const askedRef = useRef(false);
  useEffect(() => {
    if (!asks || askedRef.current) return;
    askedRef.current = true;
    void (async () => {
      try {
        const answer = await read({
          task: 'manufacturer',
          material: name,
          context: { today: todayIso() },
        });
        const reading = answer.reading;
        if (reading) {
          const next: Record<string, unknown> = {};
          for (const key of READ_KEYS) {
            const value = text(reading[key]).trim();
            if (value) next[key] = value;
          }
          setValues((current) => ({ ...current, ...next }));
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
          setFilled(true);
        }
        setSaid(answer.said || undefined);
      } catch (error) {
        setFailure(errorMessage(error));
      } finally {
        setAnswered(true);
      }
    })();
  }, [asks, name, read]);

  return (
    <RecordFormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) mutations.create.reset();
        onOpenChange(next);
      }}
      title={t('manufacturers.new')}
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
      // The lookup before the form; the form once it answered or failed.
      replacement={
        busy ? (
          <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
            <Spinner />
            {t(
              searches
                ? 'manufacturerCapture.searching'
                : 'manufacturerCapture.reading',
              { name },
            )}
          </p>
        ) : undefined
      }
      aside={
        said || failure ? (
          <div className='grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
            <p className='flex gap-2'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
              <span
                className={failure ? 'min-w-0 text-destructive' : 'min-w-0'}
              >
                <CollapsibleText
                  text={failure ?? said ?? ''}
                  chars={200}
                  lines={4}
                />
              </span>
            </p>
            {filled ? (
              sources.length > 0 ? (
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
              )
            ) : null}
          </div>
        ) : undefined
      }
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onSubmit={async (payload) => {
        const created = await mutations.create.mutateAsync({
          ...payload,
          // Looked up by AI: its history says so.
          ...(filled ? { $origin: 'ai' } : {}),
        });
        onCreated(created);
      }}
    />
  );
}
