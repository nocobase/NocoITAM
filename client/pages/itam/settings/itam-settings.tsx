import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Save, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { MultiReferenceInput } from '@/components/itam/multi-reference';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorBody,
  useApi,
  useItamSettings,
  type ItamSettings,
} from '@/lib/itam/api';
import { DEVICE_SYNC_PATH } from '@/lib/itam/device-sync';
import { errorMessage, formatDate } from '@/lib/itam/format';

import { DeviceSyncCard } from './device-sync-card';
import { ReceiptAgentCard } from './receipt-agent-card';

type SettingsKey = keyof ItamSettings;

/** The page's tabs, in reading order, by the address's `?tab=`. */
const TABS = [
  'general',
  'thresholds',
  'numbering',
  'ai',
  'receiptAgent',
  'deviceSync',
  'demo',
] as const;
type Tab = (typeof TABS)[number];

/**
 * ITAM configuration: one tab per settings document, saved as a whole
 * (2026-10-05; they were cards on one long page). The tab is in the
 * address, so a link can open one — the demo banner opens 演示数据.
 * Business options and field templates live on the master data they belong
 * to (categories carry field templates); this page holds the documents.
 */
export default function ItamSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : 'general';
  return (
    <Page>
      <PageHeader
        title={t('settings.pageTitle')}
        description={t('settings.description')}
      />
      <Tabs
        value={tab}
        onValueChange={(next) =>
          setParams({ tab: String(next) }, { replace: true })
        }
      >
        <TabsList variant='line'>
          {TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`settings.${key}.title`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {settings.data ? (
        // One document at a time, at a readable width.
        <div className='max-w-4xl'>
          {tab === 'general' ? (
            <GeneralCard value={settings.data.general} />
          ) : tab === 'thresholds' ? (
            <ThresholdsCard value={settings.data.thresholds} />
          ) : tab === 'numbering' ? (
            <NumberingCard value={settings.data.numbering} />
          ) : tab === 'ai' ? (
            <AiCard value={settings.data.ai} />
          ) : tab === 'receiptAgent' ? (
            <ReceiptAgentCard />
          ) : tab === 'deviceSync' ? (
            <div className='flex flex-col gap-4'>
              <DeviceSyncCard />
              <DeviceSyncRulesCard value={settings.data.deviceSync} />
            </div>
          ) : (
            <DemoCard />
          )}
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
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['itam', 'settings'] }),
        // The MDM review lists and counts follow 核对规则 (2026-10-15).
        key === 'deviceSync'
          ? queryClient.invalidateQueries({
              queryKey: ['itam', DEVICE_SYNC_PATH],
            })
          : undefined,
      ]),
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
      <div className='flex items-start justify-between gap-4'>
        <div className='grid gap-1'>
          <Label htmlFor='ai-onboarding-advice'>
            {t('settings.ai.onboardingAdvice')}
          </Label>
          <p className='text-xs text-muted-foreground'>
            {t('settings.ai.onboardingAdviceHint')}
          </p>
        </div>
        <Switch
          id='ai-onboarding-advice'
          checked={draft.onboardingAdvice !== false}
          onCheckedChange={(checked) =>
            setDraft({ ...draft, onboardingAdvice: checked })
          }
        />
      </div>
    </SettingsCard>
  );
}

/**
 * When a difference with the platforms is raised (device sync, step 2,
 * 2026-10-15): how long a device in use may be silent, how recent an
 * off-duty device's sync makes it 状态不符, which categories should be on
 * a platform, and whether personal devices count at all.
 */
function DeviceSyncRulesCard({
  value,
}: {
  readonly value: ItamSettings['deviceSync'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('deviceSync');
  const [draft, setDraft] = useState(value);
  return (
    <SettingsCard
      title={t('settings.deviceSyncRules.title')}
      description={t('settings.deviceSyncRules.description')}
      onSave={() => save.mutate(draft)}
      saving={save.isPending}
      error={save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        <NumberField
          id='device-sync-stale-days'
          label={t('settings.deviceSyncRules.staleDays')}
          hint={t('settings.deviceSyncRules.staleDaysHint')}
          value={draft.staleDays}
          onChange={(next) => setDraft({ ...draft, staleDays: next })}
        />
        <NumberField
          id='device-sync-recent-days'
          label={t('settings.deviceSyncRules.recentDays')}
          hint={t('settings.deviceSyncRules.recentDaysHint')}
          value={draft.recentDays}
          onChange={(next) => setDraft({ ...draft, recentDays: next })}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='device-sync-categories'>
          {t('settings.deviceSyncRules.managedCategories')}
        </Label>
        <MultiReferenceInput
          id='device-sync-categories'
          reference={{
            collection: 'categories',
            filter: { appliesTo: 'device' },
          }}
          value={draft.managedCategoryIds}
          onChange={(next) =>
            setDraft({ ...draft, managedCategoryIds: [...next] })
          }
        />
        <p className='text-xs text-muted-foreground'>
          {t('settings.deviceSyncRules.managedCategoriesHint')}
        </p>
      </div>
      <div className='flex items-start justify-between gap-4'>
        <div className='grid gap-1'>
          <Label htmlFor='device-sync-personal'>
            {t('settings.deviceSyncRules.ignorePersonal')}
          </Label>
          <p className='text-xs text-muted-foreground'>
            {t('settings.deviceSyncRules.ignorePersonalHint')}
          </p>
        </div>
        <Switch
          id='device-sync-personal'
          checked={draft.ignorePersonal !== false}
          onCheckedChange={(checked) =>
            setDraft({ ...draft, ignorePersonal: checked })
          }
        />
      </div>
      <Link
        to='/device-sync?view=ignored'
        className='text-sm text-link underline-offset-4 hover:underline'
      >
        {t('settings.deviceSyncRules.ignoredLink')}
      </Link>
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
 * (`?tab=demo`) while nothing is imported.
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
  return (
    <Card>
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
