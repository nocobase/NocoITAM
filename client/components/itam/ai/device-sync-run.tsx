import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Check, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useDismissReview, type DeviceSyncRun } from '@/lib/itam/agents';
import { useApi } from '@/lib/itam/api';
import { relativeTime } from '@/lib/itam/format';
import { PLANS_PATH, type Plan } from '@/lib/itam/plans';

import { PlanCard } from './plan-card.js';

/**
 * MDM 跟进's card (2026-10-17): what a device sync left for the reader —
 * the differences counted in one line, the plan Asset Steward proposed for
 * those a plan can settle (the plan's own card: tick, carry out, withdraw),
 * and a line for each it leaves to the reader, with the way to MDM 核对.
 * 忽略 sets it aside and withdraws its plan. Carried out or withdrawn on
 * the plan card, the suggestion goes with it.
 */
export function DeviceSyncRunCard({
  run,
  onDecided,
}: {
  readonly run: DeviceSyncRun;
  readonly onDecided?: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const dismiss = useDismissReview();
  const result = run.result;
  const planId = result?.planId ?? null;
  const plan = useQuery({
    queryKey: ['itam', PLANS_PATH, planId],
    queryFn: async () =>
      (
        await api.request<{ data: Plan }>({
          path: `${PLANS_PATH}/${encodeURIComponent(String(planId))}`,
        })
      ).data,
    enabled: Boolean(planId),
  });
  const when = relativeTime(
    run.updatedAt,
    i18n.language,
    t('comments.justNow'),
  );
  const toReview = (
    <Button
      size='sm'
      variant='outline'
      render={<Link to='/device-sync' />}
      nativeButton={false}
    >
      <RefreshCw data-icon='inline-start' />
      {t('deviceSyncRun.openReview')}
    </Button>
  );

  if (run.status === 'running')
    return (
      <p
        role='status'
        className='flex items-center gap-2 text-sm text-muted-foreground'
      >
        <Spinner />
        {t('deviceSyncRun.working')}
      </p>
    );
  if (run.status === 'failed')
    return (
      <div className='space-y-3 text-sm'>
        <p className='text-destructive'>
          {t(`review.failed.${run.failure ?? 'failed'}`, {
            defaultValue: t('review.failed.failed'),
          })}
        </p>
        <p className='text-muted-foreground'>{t('deviceSyncRun.failedHint')}</p>
        {toReview}
      </div>
    );
  const decided = run.status !== 'pending';
  return (
    <div className='space-y-4 text-sm'>
      {decided ? (
        <p className='flex items-center gap-2 text-muted-foreground'>
          <Check className='size-4 text-(--status-success)' aria-hidden />
          {run.status === 'accepted'
            ? t('deviceSyncRun.accepted')
            : run.status === 'dismissed'
              ? t('review.dismissed')
              : t('review.superseded')}
          <span className='tabular-nums'>· {when}</span>
        </p>
      ) : null}
      {result?.summary ? <p className='font-medium'>{result.summary}</p> : null}
      {plan.data ? <PlanCard plan={plan.data} /> : null}
      {result?.notes.length ? (
        <section className='space-y-1'>
          <h3 className='text-xs text-muted-foreground'>
            {t('deviceSyncRun.notes')}
          </h3>
          <ul className='list-disc space-y-0.5 pl-5'>
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className='flex flex-wrap items-center gap-2'>
        {toReview}
        {!decided ? (
          <Button
            size='sm'
            variant='ghost'
            disabled={dismiss.isPending}
            onClick={() =>
              dismiss.mutate(run, { onSuccess: () => onDecided?.() })
            }
          >
            {t('review.dismiss')}
          </Button>
        ) : null}
      </div>
      {dismiss.error ? (
        <p className='text-destructive'>{dismiss.error.message}</p>
      ) : null}
    </div>
  );
}
