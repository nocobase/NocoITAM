import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Page, PageHeader } from '@/components/itam/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useItamSettings, type ItamSettings } from '@/lib/itam/api';

import { useSave } from './settings/use-settings-save.js';

/**
 * 业务说明 (2026-10-16, after NocoCRM's Business guidance page): what Asset Steward
 * reads at the start of every conversation and every work agent's run —
 * who the organisation is, its standard equipment, its budgets, when
 * something needs approval. It is the `ai.businessNotes` setting, moved
 * here from 设置 → AI into the AI section of the menu, saved on its own.
 */
export default function GuidancePage(): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  if (!settings.data)
    return (
      <Page>
        <PageHeader title={t('guidance.title')} />
        {settings.error ? (
          <p className='text-sm text-destructive'>{settings.error.message}</p>
        ) : (
          <Skeleton className='h-96 w-full max-w-4xl rounded-lg' />
        )}
      </Page>
    );
  return <GuidanceForm ai={settings.data.ai} />;
}

function GuidanceForm({
  ai,
}: {
  readonly ai: ItamSettings['ai'];
}): ReactElement {
  const { t } = useTranslation();
  const save = useSave('ai');
  const [notes, setNotes] = useState(ai.businessNotes);
  const changed = notes !== ai.businessNotes;
  return (
    <Page>
      <PageHeader
        title={t('guidance.title')}
        description={t('guidance.description')}
        actions={
          <Button
            disabled={save.isPending || !changed}
            onClick={() => save.mutate({ ...ai, businessNotes: notes })}
          >
            {t(save.isPending ? 'guidance.saving' : 'guidance.save')}
          </Button>
        }
      />
      {save.error ? (
        <p className='text-sm text-destructive'>{save.error.message}</p>
      ) : save.isSuccess && !changed ? (
        <p role='status' className='rounded-lg bg-primary/10 p-3 text-sm'>
          {t('guidance.saved')}
        </p>
      ) : null}
      <div className='max-w-4xl space-y-2'>
        <Textarea
          aria-label={t('guidance.title')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('guidance.placeholder')}
          maxLength={20_000}
          // Grows with the text up to most of the screen, then scrolls.
          className='max-h-[70vh] min-h-96 overflow-y-auto bg-card font-mono text-xs leading-relaxed md:text-xs'
        />
        <p className='text-xs text-muted-foreground'>{t('guidance.hint')}</p>
      </div>
    </Page>
  );
}
