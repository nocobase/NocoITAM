import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useItamSettings, type ItamSettings } from '@/lib/itam/api';

import { NumberField, SettingsCard } from './settings-parts';
import { useSave } from './use-settings-save';

/**
 * Where a link written before the settings became one page (`?tab=`) now
 * goes: each of those tabs is a tab of 设置 of its own (2026-10-16).
 */
const MOVED: Readonly<Record<string, string>> = {
  deviceSync: '/settings/mdm',
  receiptAgent: '/settings/receipt-agent',
  demo: '/settings/demo',
};

/**
 * 设置 → 通用: ITAM's own settings documents, one card under another, each
 * saved by its own button (after NocoCRM's General tab, 2026-10-16). MDM,
 * receiving by delivery document and the demo have tabs of their own.
 */
export default function ItamSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const [params] = useSearchParams();
  const moved = MOVED[params.get('tab') ?? ''];
  if (moved) return <Navigate to={moved} replace />;
  return (
    <PageContainer>
      <PageHeader
        title={t('settings.pageTitle')}
        description={t('settings.description')}
      />
      {settings.data ? (
        // At a readable width.
        <div className='flex max-w-4xl flex-col gap-6'>
          <GeneralCard value={settings.data.general} />
          <ThresholdsCard value={settings.data.thresholds} />
          <NumberingCard value={settings.data.numbering} />
          <AiCard value={settings.data.ai} />
        </div>
      ) : null}
    </PageContainer>
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
      <div className='grid items-start gap-3 sm:grid-cols-2'>
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
        {/* The language the models write in (2026-10-20): the
            deployment's by default, the same for every reader. */}
        <div className='grid gap-1.5'>
          <Label htmlFor='general-aiLanguage'>
            {t('settings.general.aiLanguage')}
          </Label>
          <Select
            value={draft.aiLanguage ?? 'auto'}
            onValueChange={(next) =>
              setDraft({
                ...draft,
                aiLanguage: next as NonNullable<
                  ItamSettings['general']['aiLanguage']
                >,
              })
            }
          >
            <SelectTrigger id='general-aiLanguage' className='w-full'>
              <SelectValue>
                {(value: string) => t(`settings.general.aiLanguages.${value}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(['auto', 'zh-CN', 'en-US'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`settings.general.aiLanguages.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-xs text-muted-foreground'>
            {t('settings.general.aiLanguageHint')}
          </p>
        </div>
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
        {keys.map((key) =>
          // The idle ratio is stored as a fraction and edited as a
          // percentage (2026-10-28): 30 %, not 0.3.
          key === 'idleSeatRatio' ? (
            <NumberField
              key={key}
              id={`threshold-${key}`}
              label={t(`settings.thresholds.${key}`)}
              hint={t(`settings.thresholdHints.${key}`, { defaultValue: '' })}
              value={Math.round(draft[key] * 100)}
              step={5}
              unit='%'
              onChange={(next) => setDraft({ ...draft, [key]: next / 100 })}
            />
          ) : (
            <NumberField
              key={key}
              id={`threshold-${key}`}
              label={t(`settings.thresholds.${key}`)}
              hint={t(`settings.thresholdHints.${key}`, { defaultValue: '' })}
              value={draft[key]}
              onChange={(next) => setDraft({ ...draft, [key]: next })}
            />
          ),
        )}
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
      {/* 业务说明 moved to its own page, AI → 业务说明 (2026-10-16). */}
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
      {/* The ask box at the bottom of pages, for everyone (after NocoCRM's
          Business defaults switch). */}
      <div className='flex items-start justify-between gap-4'>
        <div className='grid gap-1'>
          <Label htmlFor='ai-assistant-dock'>
            {t('settings.ai.assistantDock')}
          </Label>
          <p className='text-xs text-muted-foreground'>
            {t('settings.ai.assistantDockHint')}
          </p>
        </div>
        <Switch
          id='ai-assistant-dock'
          checked={draft.assistantDock !== false}
          onCheckedChange={(checked) =>
            setDraft({ ...draft, assistantDock: checked })
          }
        />
      </div>
    </SettingsCard>
  );
}
