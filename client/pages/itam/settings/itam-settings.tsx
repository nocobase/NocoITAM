import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Page, PageHeader } from '@/components/itam/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorBody,
  useApi,
  useItamSettings,
  type ItamSettings,
} from '@/lib/itam/api';
import { errorMessage, formatDate } from '@/lib/itam/format';

import { ReceiptAgentCard } from './receipt-agent-card';

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
          <ReceiptAgentCard />
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
      {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
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

type DemoLanguage = 'zh-CN' | 'en-US';
const DEMO_LANGUAGES: readonly DemoLanguage[] = ['zh-CN', 'en-US'];

interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly role: string;
  readonly password: string;
}

interface DemoSummary {
  readonly generated: boolean;
  readonly records: number;
  readonly createdAt: string | null;
  readonly language: DemoLanguage | null;
  readonly accounts: readonly DemoAccount[];
  readonly accountsByLanguage: Readonly<
    Record<DemoLanguage, readonly DemoAccount[]>
  >;
}

/**
 * The demo dataset, imported and cleared here (after NocoCRM's settings
 * tab): what it is, the sign-ins it creates — those of the language picked
 * before an import, those of the import present after — when it was
 * imported and how big it is. The banner above every page links here
 * (`#demo`) while nothing is imported.
 */
function DemoCard(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'generate' | 'clear'>();
  const [notice, setNotice] = useState<string>();
  // The reader's own language is the first choice.
  const [language, setLanguage] = useState<DemoLanguage>(
    i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
  );
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
        json: action === 'generate' ? { language } : {},
      }),
    onSuccess: async (_result, action) => {
      setConfirming(undefined);
      setNotice(
        t(
          action === 'generate'
            ? 'settings.demo.generated'
            : 'settings.demo.cleared',
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    },
  });
  const demo = status.data;
  const accounts = demo
    ? demo.generated
      ? demo.accounts
      : demo.accountsByLanguage[language]
    : [];
  // Scrolled to when the banner's link brings the reader here.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (demo && window.location.hash === '#demo')
      ref.current?.scrollIntoView({ block: 'start' });
  }, [demo]);
  return (
    <Card id='demo' ref={ref} className='lg:col-span-2'>
      <CardHeader>
        <CardTitle>{t('settings.demo.title')}</CardTitle>
        <p className='text-sm text-muted-foreground'>
          {t('settings.demo.description')}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        {accounts.length > 0 ? (
          <div className='space-y-2'>
            <p className='text-sm'>
              {t('settings.demo.accounts')}
              <span className='ml-2 text-muted-foreground'>
                {t('settings.demo.accountsHint')}
              </span>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.demo.username')}</TableHead>
                  <TableHead>{t('settings.demo.name')}</TableHead>
                  <TableHead>{t('settings.demo.role')}</TableHead>
                  <TableHead>{t('settings.demo.password')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.username}>
                    <TableCell>
                      <code className='text-xs'>{account.username}</code>
                    </TableCell>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>
                      {t(`settings.demo.roles.${account.role}`, {
                        defaultValue: account.role,
                      })}
                    </TableCell>
                    <TableCell>
                      <code className='text-xs'>{account.password}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <p className='text-sm'>
          {demo?.generated
            ? t('settings.demo.present', {
                date: formatDate(demo.createdAt, true),
                count: demo.records,
              })
            : t('settings.demo.none')}
        </p>
        {notice ? (
          <p role='status' className='rounded-md bg-primary/10 p-3 text-sm'>
            {notice}
          </p>
        ) : null}
        <div className='flex flex-wrap items-center gap-2'>
          {demo && !demo.generated ? (
            <>
              <Label htmlFor='demo-language'>
                {t('settings.demo.language')}
              </Label>
              <Select
                items={DEMO_LANGUAGES.map((value) => ({
                  value,
                  label: t(`settings.demo.languages.${value}`),
                }))}
                value={language}
                onValueChange={(next) => next && setLanguage(next)}
              >
                <SelectTrigger id='demo-language' size='sm' className='w-32'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_LANGUAGES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`settings.demo.languages.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size='sm'
                disabled={act.isPending}
                onClick={() => {
                  act.reset();
                  setConfirming('generate');
                }}
              >
                <Database data-icon='inline-start' />
                {act.isPending
                  ? t('settings.demo.generating')
                  : t('settings.demo.generate')}
              </Button>
            </>
          ) : null}
          {demo?.generated ? (
            <Button
              size='sm'
              variant='outline'
              disabled={act.isPending}
              onClick={() => {
                act.reset();
                setConfirming('clear');
              }}
            >
              <Trash2 data-icon='inline-start' />
              {t('settings.demo.clear')}
            </Button>
          ) : null}
        </div>
        <ConfirmDialog
          open={confirming !== undefined}
          onOpenChange={(open) => {
            if (!open) setConfirming(undefined);
          }}
          title={t(
            confirming === 'clear'
              ? 'settings.demo.clearTitle'
              : 'settings.demo.generateTitle',
          )}
          description={t(
            confirming === 'clear'
              ? 'settings.demo.clearDescription'
              : 'settings.demo.generateDescription',
          )}
          busy={act.isPending}
          error={act.error}
          destructive={confirming === 'clear'}
          confirmLabel={t(
            confirming === 'clear'
              ? 'settings.demo.clear'
              : 'settings.demo.generate',
          )}
          onConfirm={() => {
            if (confirming) {
              setNotice(undefined);
              act.mutate(confirming);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
