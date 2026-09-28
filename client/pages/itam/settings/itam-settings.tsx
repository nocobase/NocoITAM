import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Save, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Page, PageHeader } from '@/components/itam/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorBody,
  useApi,
  useItamSettings,
  type ItamSettings,
} from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';
import { useConfirm } from '@/lib/itam/use-confirm';

type SettingsKey = keyof ItamSettings;

/**
 * ITAM configuration: one card per settings document, saved as a whole.
 * Business options and field templates live on the master data they belong
 * to (categories carry field templates); this page holds the documents.
 */
export default function ItamSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  return (
    <Page>
      <PageHeader
        title={t('settings.pageTitle')}
        description={t('settings.description')}
      />
      {settings.data ? (
        <div className='grid gap-6 lg:grid-cols-2'>
          <GeneralCard value={settings.data.general} />
          <ThresholdsCard value={settings.data.thresholds} />
          <NumberingCard value={settings.data.numbering} />
          <AiCard value={settings.data.ai} />
          <DemoCard />
        </div>
      ) : null}
    </Page>
  );
}

function useSave<K extends SettingsKey>(key: K) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: ItamSettings[K]) =>
      api.request({ path: `itam/settings/${key}`, method: 'PUT', json: value }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['itam', 'settings'] }),
  });
}

function SettingsCard({
  title,
  description,
  children,
  onSave,
  saving,
  error,
  saved,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactElement | ReactElement[];
  readonly onSave: () => void;
  readonly saving: boolean;
  readonly error: unknown;
  readonly saved: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className='space-y-4'>
        {children}
        <div className='flex items-center gap-3'>
          <Button size='sm' disabled={saving} onClick={onSave}>
            <Save data-icon='inline-start' />
            {t('actions.save')}
          </Button>
          {error ? (
            <span className='text-sm text-destructive'>
              {apiErrorBody(error)?.message ?? errorMessage(error)}
            </span>
          ) : saved ? (
            <span className='text-sm text-muted-foreground'>
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly step?: number;
  /** What the number decides, in a line. A threshold's name rarely says. */
  readonly hint?: string;
}): ReactElement {
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='number'
        step={step ?? 1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? (
        <p className='text-xs text-muted-foreground'>{hint}</p>
      ) : null}
    </div>
  );
}

function GeneralCard({
  value,
}: {
  readonly value: ItamSettings['general'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('general');
  const [draft, setDraft] = useState(value);
  return (
    <SettingsCard
      title={t('settings.general.title')}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-3 sm:grid-cols-3'>
        {(['currency', 'timeZone', 'dateFormat'] as const).map((key) => (
          <div key={key} className='grid gap-1.5'>
            <Label htmlFor={`general-${key}`}>
              {t(`settings.general.${key}`)}
            </Label>
            <Input
              id={`general-${key}`}
              value={draft[key]}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

function ThresholdsCard({
  value,
}: {
  readonly value: ItamSettings['thresholds'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('thresholds');
  const [draft, setDraft] = useState(value);
  const keys = Object.keys(value) as (keyof ItamSettings['thresholds'])[];
  return (
    <SettingsCard
      title={t('settings.thresholds.title')}
      description={t('settings.thresholds.description')}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        {keys.map((key) => (
          <NumberField
            key={key}
            id={`threshold-${key}`}
            label={t(`settings.thresholds.${key}`)}
            hint={t(`settings.thresholdHints.${key}`, { defaultValue: '' })}
            value={draft[key]}
            step={key === 'idleSeatRatio' ? 0.05 : 1}
            onChange={(next) => setDraft({ ...draft, [key]: next })}
          />
        ))}
      </div>
    </SettingsCard>
  );
}

function NumberingCard({
  value,
}: {
  readonly value: ItamSettings['numbering'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('numbering');
  const [draft, setDraft] = useState(value);
  return (
    <SettingsCard
      title={t('settings.numbering.title')}
      description={t('settings.numbering.description')}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className='space-y-3'>
        {Object.entries(draft).map(([kind, rule]) => (
          <div
            key={kind}
            className='grid items-end gap-2 sm:grid-cols-[8rem_1fr_5rem_5rem]'
          >
            <span className='text-sm font-medium'>
              {t(`settings.numbering.kinds.${kind}`)}
            </span>
            <div className='grid gap-1'>
              <Label htmlFor={`numbering-${kind}-prefix`} className='text-xs'>
                {t('settings.numbering.prefix')}
              </Label>
              <Input
                id={`numbering-${kind}-prefix`}
                value={rule.prefix}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    [kind]: { ...rule, prefix: event.target.value },
                  })
                }
              />
            </div>
            <div className='grid gap-1'>
              <Label htmlFor={`numbering-${kind}-width`} className='text-xs'>
                {t('settings.numbering.width')}
              </Label>
              <Input
                id={`numbering-${kind}-width`}
                type='number'
                min={1}
                max={12}
                value={rule.width}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    [kind]: { ...rule, width: Number(event.target.value) },
                  })
                }
              />
            </div>
            <div className='grid gap-1'>
              <Label htmlFor={`numbering-${kind}-start`} className='text-xs'>
                {t('settings.numbering.start')}
              </Label>
              <Input
                id={`numbering-${kind}-start`}
                type='number'
                min={1}
                value={rule.start}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    [kind]: { ...rule, start: Number(event.target.value) },
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

function AiCard({
  value,
}: {
  readonly value: ItamSettings['ai'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('ai');
  const [draft, setDraft] = useState(value);
  return (
    <SettingsCard
      title={t('settings.ai.title')}
      description={t('settings.ai.description')}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-1.5'>
        <Label htmlFor='ai-notes'>{t('settings.ai.businessNotes')}</Label>
        <Textarea
          id='ai-notes'
          rows={4}
          value={draft.businessNotes}
          onChange={(event) =>
            setDraft({ ...draft, businessNotes: event.target.value })
          }
        />
      </div>
    </SettingsCard>
  );
}

interface DemoSummary {
  readonly generated: boolean;
  readonly counts: Readonly<Record<string, number>>;
}

function DemoCard(): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirmClear, setConfirmClear] = useState(false);
  const status = useQuery({
    queryKey: ['itam', 'demo'],
    queryFn: async () =>
      (await api.request<{ data: DemoSummary }>({ path: 'itam/demo' })).data,
  });
  const act = useMutation({
    mutationFn: (action: 'generate' | 'clear') =>
      api.request<{ data: DemoSummary }>({
        path: `itam/demo/${action}`,
        method: 'POST',
        json: {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itam'] }),
  });
  const confirmGenerate = useConfirm();
  const counts = Object.entries(status.data?.counts ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  return (
    <Card className='lg:col-span-2'>
      {confirmGenerate.dialog}
      <CardHeader>
        <CardTitle>{t('settings.demo.title')}</CardTitle>
        <p className='text-sm text-muted-foreground'>
          {t('settings.demo.description')}
        </p>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {status.data?.generated ? (
            <Button
              size='sm'
              variant='outline'
              disabled={act.isPending}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 data-icon='inline-start' />
              {t('settings.demo.clear')}
            </Button>
          ) : (
            <Button
              size='sm'
              disabled={act.isPending || !status.data}
              onClick={() =>
                confirmGenerate.ask({
                  title: t('settings.demo.generate'),
                  description: t('confirmations.generateDemo'),
                  confirmLabel: t('settings.demo.generate'),
                  action: () => act.mutateAsync('generate'),
                })
              }
            >
              <Database data-icon='inline-start' />
              {act.isPending
                ? t('settings.demo.generating')
                : t('settings.demo.generate')}
            </Button>
          )}
          {act.error ? (
            <span className='text-sm text-destructive'>
              {apiErrorBody(act.error)?.message ?? errorMessage(act.error)}
            </span>
          ) : null}
        </div>
        {status.data?.generated ? (
          <div className='flex flex-wrap gap-1.5'>
            {counts.map(([collection, count]) => (
              <Badge key={collection} variant='secondary'>
                {t(`references.${collection}`, {
                  defaultValue: t(`navigation.${collection}`, {
                    defaultValue: collection,
                  }),
                })}{' '}
                {count}
              </Badge>
            ))}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('settings.demo.none')}
          </p>
        )}
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title={t('settings.demo.clear')}
          description={t('settings.demo.clearDescription')}
          busy={act.isPending}
          error={act.error}
          destructive
          confirmLabel={t('settings.demo.clear')}
          onConfirm={() =>
            void act.mutateAsync('clear').then(() => setConfirmClear(false))
          }
        />
      </CardContent>
    </Card>
  );
}
