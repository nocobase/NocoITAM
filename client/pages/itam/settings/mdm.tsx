import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { MultiReferenceInput } from '@/components/itam/multi-reference';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useItamSettings, type ItamSettings } from '@/lib/itam/api';

import { DeviceSyncCard } from './device-sync-card';
import { NumberField, SettingsCard } from './settings-parts';
import { useSave } from './use-settings-save';

/** 设置 → MDM: the platforms' connections, and when a difference is raised. */
export default function MdmSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  return (
    <PageContainer>
      <PageHeader title={t('settings.deviceSync.title')} />
      <div className='flex max-w-4xl flex-col gap-4'>
        <DeviceSyncCard />
        {settings.data ? (
          <DeviceSyncRulesCard value={settings.data.deviceSync} />
        ) : null}
      </div>
    </PageContainer>
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
    </SettingsCard>
  );
}
