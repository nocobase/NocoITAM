import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, RefreshCw } from 'lucide-react';
import { useContext, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import {
  useDismissReview,
  useInbox,
  useOtherFollowUps,
  type DeviceSyncRun,
} from '@/lib/itam/agents';
import {
  FollowUpFocusContext,
  followUpTitle,
} from '@/lib/itam/device-sync-followup';
import { useReferenceNames } from '@/lib/itam/references';
import { useApi } from '@/lib/itam/api';
import { relativeTime } from '@/lib/itam/format';
import { PLANS_PATH, type Plan } from '@/lib/itam/plans';

import { PlanCard, PlanDecision } from './plan-card.js';

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
  onReview = false,
}: {
  readonly run: DeviceSyncRun;
  readonly onDecided?: () => void;
  /** Shown on MDM 核对 itself, which needs no way to it. */
  readonly onReview?: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const dismiss = useDismissReview();
  const result = run.result;
  const plan = useRunPlan(run);
  const when = relativeTime(
    run.updatedAt,
    i18n.language,
    t('comments.justNow'),
  );
  const toReview = onReview ? null : (
    <Button
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
      {toReview || !decided ? (
        <div className='flex flex-wrap items-center gap-2'>
          {toReview}
          {!decided ? (
            <Button
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
      ) : null}
      {dismiss.error ? (
        <p className='text-destructive'>{dismiss.error.message}</p>
      ) : null}
    </div>
  );
}

/** The plan a run proposed, if it proposed one. */
function useRunPlan(run: DeviceSyncRun) {
  const api = useApi();
  const planId = run.result?.planId ?? null;
  return useQuery({
    queryKey: ['itam', PLANS_PATH, planId],
    queryFn: async () =>
      (
        await api.request<{ data: Plan }>({
          path: `${PLANS_PATH}/${encodeURIComponent(String(planId))}`,
        })
      ).data,
    enabled: Boolean(planId),
  });
}

/**
 * One follow-up on MDM 核对 (2026-10-21), folded to a line so the lists
 * stay in view: what it is about and how many steps wait, with the plan's
 * own 拒绝 / 确认执行 — declining it sets the follow-up aside too, so there
 * is no separate 忽略 then. Opened, the steps to tick and what is left to
 * look at. Without a plan, its notes show at once, with 忽略.
 */
function FollowUpReviewCard({
  run,
}: {
  readonly run: DeviceSyncRun;
}): ReactElement {
  const { t } = useTranslation();
  const dismiss = useDismissReview();
  const plan = useRunPlan(run);
  const [open, setOpen] = useState<boolean>();
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set());
  const notes = run.result?.notes ?? [];
  const pendingPlan = plan.data?.status === 'pending' ? plan.data : null;
  const decided = run.status !== 'pending';
  if (run.status === 'running' || run.status === 'failed')
    return (
      <div className='space-y-3 rounded-lg border bg-card p-4'>
        <h3 className='text-sm font-medium'>{followUpTitle(run, t)}</h3>
        <DeviceSyncRunCard run={run} onReview />
      </div>
    );
  const facts = [
    pendingPlan
      ? t('deviceSyncRun.stepsWaiting', { count: pendingPlan.steps.length })
      : null,
    !decided && notes.length
      ? t('deviceSyncRun.notesWaiting', { count: notes.length })
      : null,
    decided
      ? run.status === 'accepted'
        ? t('deviceSyncRun.accepted')
        : run.status === 'dismissed'
          ? t('review.dismissed')
          : t('review.superseded')
      : null,
  ].filter(Boolean);
  return (
    <Collapsible
      // Folded while a plan waits; its notes alone are shown at once.
      open={open ?? (!pendingPlan && !decided && notes.length > 0)}
      onOpenChange={setOpen}
      className='rounded-lg border bg-card'
    >
      <div className='flex flex-wrap items-center gap-2 px-4 py-2.5'>
        <CollapsibleTrigger className='group flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm'>
          <ChevronRight
            className='size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90'
            aria-hidden
          />
          <span className='font-medium'>{followUpTitle(run, t)}</span>
          {facts.length ? (
            <span className='text-muted-foreground'>· {facts.join(' · ')}</span>
          ) : null}
        </CollapsibleTrigger>
        <div className='flex items-center gap-2'>
          {pendingPlan ? (
            <PlanDecision plan={pendingPlan} skipped={skipped} />
          ) : !decided ? (
            <Button
              variant='ghost'
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(run)}
            >
              {t('review.dismiss')}
            </Button>
          ) : null}
        </div>
      </div>
      <CollapsibleContent className='space-y-3 border-t px-4 py-3 text-sm'>
        {plan.data ? (
          <PlanCard
            plan={plan.data}
            bare
            skipped={skipped}
            onSkippedChange={setSkipped}
          />
        ) : null}
        {notes.length ? (
          <section className='space-y-1'>
            <h4 className='text-xs text-muted-foreground'>
              {t('deviceSyncRun.notes')}
            </h4>
            <ul className='list-disc space-y-0.5 pl-5'>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </CollapsibleContent>
      {dismiss.error ? (
        <p className='px-4 pb-3 text-sm text-destructive'>
          {dismiss.error.message}
        </p>
      ) : null}
    </Collapsible>
  );
}

const isOpenRun = (run: { readonly status: string }) =>
  run.status === 'running' ||
  run.status === 'pending' ||
  run.status === 'failed';

/**
 * 等你决定 on MDM 核对 (2026-10-17), as on a request's page: the reader's
 * MDM 跟进 suggestions still open — their devices', and as an asset manager
 * the platform records' — newest first, each its card. One carried out or
 * set aside while the page was open stays, folded to how it ended; one a
 * newer run replaced goes. Beside a run in 收件箱, that run alone. For an
 * asset manager, the other people's open suggestions follow, to read.
 */
export function DeviceSyncFollowUpBlock(): ReactElement | null {
  const { t } = useTranslation();
  const focus = useContext(FollowUpFocusContext);
  const inbox = useInbox();
  const runs = [...(inbox.data?.open ?? []), ...(inbox.data?.handled ?? [])]
    .filter((run): run is DeviceSyncRun => run.agent === 'deviceSync')
    .filter((run) => !focus || run.id === focus)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // The runs open while the page was: once decided here they stay.
  const [shown, setShown] = useState<readonly string[]>([]);
  const opened = runs.filter(isOpenRun).map((run) => run.id);
  if (opened.some((id) => !shown.includes(id)))
    setShown([...new Set([...shown, ...opened])]);
  // Replaced by a newer run is gone, not decided: its card would offer a
  // plan nobody should carry out any more.
  const visible = runs.filter(
    (run) =>
      isOpenRun(run) ||
      (shown.includes(run.id) &&
        (run.status === 'accepted' || run.status === 'dismissed')),
  );
  return (
    <>
      {visible.length ? (
        <section className='space-y-2'>
          <h2 className='text-sm font-semibold'>{t('review.waiting')}</h2>
          {visible.map((run) => (
            <FollowUpReviewCard key={run.id} run={run} />
          ))}
        </section>
      ) : null}
      {focus ? null : <OthersFollowUps />}
    </>
  );
}

/**
 * The other people's open MDM 跟进, for an asset manager to read
 * (2026-10-17): whose devices, the suggestion, what its plan would do and
 * what is left to look at. Their person carries it out, so nothing here
 * acts. Nothing for anybody else.
 */
function OthersFollowUps(): ReactElement | null {
  const { t } = useTranslation();
  const others = useOtherFollowUps();
  const rows = others.data ?? [];
  const names = useReferenceNames([
    { collection: 'users', ids: rows.map((row) => row.deciderId) },
  ]);
  if (!rows.length) return null;
  return (
    <Collapsible className='space-y-2'>
      <CollapsibleTrigger className='group flex items-center gap-1 text-sm font-semibold'>
        <ChevronRight
          className='size-4 transition-transform group-data-[panel-open]:rotate-90'
          aria-hidden
        />
        {t('deviceSyncRun.others', { count: rows.length })}
        <span className='font-normal text-muted-foreground'>
          · {t('deviceSyncRun.othersHint')}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-2'>
        {rows.map((row) => (
          <article
            key={row.id}
            className='space-y-2 rounded-lg border bg-card p-4 text-sm'
          >
            <h3 className='font-medium'>
              {t('deviceSyncRun.otherTitle', {
                name: names.users?.get(row.deciderId) ?? '…',
                count: row.items.length,
              })}
            </h3>
            {row.status === 'running' ? (
              <p className='text-muted-foreground'>
                {t('deviceSyncRun.working')}
              </p>
            ) : row.status === 'failed' ? (
              <p className='text-muted-foreground'>
                {t(`review.failed.${row.failure ?? 'failed'}`, {
                  defaultValue: t('review.failed.failed'),
                })}
              </p>
            ) : (
              <>
                {row.summary ? <p>{row.summary}</p> : null}
                {row.steps.length ? (
                  <section className='space-y-1'>
                    <h4 className='text-xs text-muted-foreground'>
                      {t('deviceSyncRun.steps')}
                    </h4>
                    <ul className='list-disc space-y-0.5 pl-5'>
                      {row.steps.map((step, at) => (
                        <li key={`${String(at)}-${step}`}>{step}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {row.notes.length ? (
                  <section className='space-y-1'>
                    <h4 className='text-xs text-muted-foreground'>
                      {t('deviceSyncRun.notes')}
                    </h4>
                    <ul className='list-disc space-y-0.5 pl-5'>
                      {row.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </article>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
