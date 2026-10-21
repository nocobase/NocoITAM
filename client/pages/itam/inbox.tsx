import { useTranslation } from '@nocobase/i18n/client';
import { Check } from 'lucide-react';
import { lazy, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ApprovalReviewCard } from '@/components/itam/ai/approval-review';
import { DeviceSyncRunCard } from '@/components/itam/ai/device-sync-run';
import {
  FollowUpFocusContext,
  followUpTitle,
} from '@/lib/itam/device-sync-followup';
import {
  itamInboxSource,
  itamNoticeRenderer,
} from '@/components/itam/inbox-notices';
import { noticePath } from '@/lib/itam/inbox-notices';
import { PagePane, RecordPane } from '@/components/itam/record-drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useInbox, type AgentRun } from '@/lib/itam/agents';
import { relativeTime } from '@/lib/itam/format';
import { cn } from '@/lib/utils';
import { InboxPage as InboxBlock } from '#extensions/nocobase-inbox/inbox-page';
import type {
  InboxEntry,
  InboxCollectionCategory,
  InboxCollectionInput,
  InboxCollectionState,
} from '#extensions/nocobase-inbox/model';
import {
  infoCategory,
  type InboxRegistry,
} from '#extensions/nocobase-inbox/registry';

/**
 * 收件箱 (2026-10-16, plan "Work agents", step 1, after NocoCRM's
 * `pages/inbox.tsx`): the UI Library's inbox block
 * over the in-app notification plugin, first in the menu, its count the
 * runs waiting on the reader. Its two views are AI 建议 (first, the
 * default, shown only while there is one) and 通知 — the block's To do and
 * All, relabelled — with NocoCRM's application changes to the block. Application change: its registry adds the
 * work agents' suggestions waiting on the reader — 审批审阅's reviews — to
 * the To do view, as a collection category read from ITAM's API, listed
 * waiting first and then those handled lately, decided on the right with
 * the same card as on the request's page. The template's own decision
 * category is left out: nothing in ITAM sends a notice of kind decision.
 * `/notifications`, where the bell led, opens here. ITAM's own
 * notifications show the record they are about beside the list, at the
 * comment they concern (`inbox-notices.ts`, 2026-10-16, after NocoCRM's).
 */

const REVIEWS_CATEGORY = 'itam-reviews';
const REVIEW_PARAM = 'review';

export default function InboxPage(): ReactElement {
  const { t } = useTranslation();
  const label = t('agentInbox.category');
  const navigate = useNavigate();
  const registry = useMemo<InboxRegistry>(
    () => ({
      renderers: [itamNoticeRenderer],
      feeds: [],
      categories: [reviewsCategory(label), infoCategory],
    }),
    [label],
  );
  // On a phone, whose list and pane take turns, a notification opens the
  // record's own page, at the comment it is about.
  const selectParams = (entry: InboxEntry): void => {
    const path = noticePath(entry);
    if (!path || !window.matchMedia?.('(max-width: 767px)').matches) return;
    setTimeout(() => void navigate(path));
  };
  // No line under the heading, as NocoCRM's inbox has none.
  return (
    <InboxBlock
      registry={registry}
      source={itamInboxSource}
      selectParams={selectParams}
      description=''
    />
  );
}

function reviewsCategory(label: string): InboxCollectionCategory {
  return {
    type: 'collection',
    id: REVIEWS_CATEGORY,
    label: () => label,
    param: REVIEW_PARAM,
    params: [],
    // Only To do: in All the group would follow every notification loaded.
    views: ['todo'],
    useCollection: useReviewsCollection,
    Detail: ReviewDetail,
  };
}

// MDM 核对, shown beside an MDM 跟进: loaded when one is opened.
const DeviceSyncReviewPage = lazy(() => import('./device-sync.js'));

/**
 * An MDM 跟进 a newer one for the same person replaced is left out
 * (2026-10-17): each MDM 跟进 brings the reader's differences again, so the
 * old one only repeated the new one as 已在别处处理. One settled by another
 * asset manager stays: that is news.
 */
function withoutReplaced(runs: readonly AgentRun[]): AgentRun[] {
  const newest = new Map<string, string>();
  for (const run of runs)
    if (run.agent === 'deviceSync') {
      const seen = newest.get(run.subjectId);
      if (!seen || run.createdAt > seen)
        newest.set(run.subjectId, run.createdAt);
    }
  return runs.filter(
    (run) =>
      run.agent !== 'deviceSync' ||
      run.status !== 'superseded' ||
      newest.get(run.subjectId) === run.createdAt,
  );
}

const isOpen = (run: AgentRun): boolean =>
  run.status === 'pending' ||
  run.status === 'running' ||
  run.status === 'failed';

function useReviewsCollection({
  filter,
  selectedId,
  onSelect,
  params,
}: InboxCollectionInput): InboxCollectionState {
  const inbox = useInbox();
  const items = useMemo(
    () =>
      withoutReplaced([
        ...(inbox.data?.open ?? []),
        ...(inbox.data?.handled ?? []),
      ]),
    [inbox.data],
  );
  const chosen = filter.kind === REVIEWS_CATEGORY;
  // Beside the list on a wide screen, the first suggestion stands open
  // before any pick, as the inbox's first item does; narrow, the list and
  // the entry take turns, so nothing opens by itself.
  const first = (chosen ? items : items.filter(isOpen))[0]?.id;
  const nothingOpen =
    filter.view === 'todo' && !selectedId && !params.get('item');
  // onSelect is a new function on every render of the inbox.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  });
  useEffect(() => {
    if (!nothingOpen || !first) return;
    if (!window.matchMedia?.('(min-width: 64rem)').matches) return;
    selectRef.current(first);
  }, [nothingOpen, first]);
  const list = (
    <ReviewList
      items={items}
      selectedId={selectedId}
      onSelect={onSelect}
      loading={inbox.isLoading}
      error={inbox.error}
    />
  );
  return {
    // Shown while there is any, handled or not, so the way to the handled
    // ones stays in reach when nothing waits.
    count: items.length,
    loaded: !inbox.isLoading,
    // What waits on the reader, counted on the AI 建议 tab.
    waiting: items.filter((run) => run.status === 'pending').length,
    group: list,
    list,
  };
}

function ReviewList({
  items,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  readonly items: readonly AgentRun[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly loading: boolean;
  readonly error: Error | null;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  if (loading) return <Skeleton className='h-16 w-full rounded-lg' />;
  if (error)
    return <p className='px-3 text-sm text-destructive'>{error.message}</p>;
  if (!items.length) return null;
  // A review the reader redid is replaced, not handled elsewhere.
  const redone = new Set(items.map((run) => run.revisesId).filter(Boolean));
  // The handled ones follow the waiting ones under 已处理 (2026-10-21).
  const firstHandled = items.find((run) => !isOpen(run))?.id;
  return (
    <ul className='flex flex-col gap-0.5' aria-label={t('agentInbox.category')}>
      {items.map((run) => {
        const open = isOpen(run);
        return (
          <li key={run.id}>
            {run.id === firstHandled ? (
              <h3 className='px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground'>
                {t('agentInbox.handled')}
              </h3>
            ) : null}
            <button
              type='button'
              data-decision-item=''
              aria-current={run.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(run.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors',
                run.id === selectedId
                  ? 'border-l-primary bg-accent'
                  : open
                    ? 'border-l-(--status-warning) hover:bg-hover'
                    : 'border-l-transparent hover:bg-hover',
                !open && 'opacity-55',
              )}
            >
              <span className='flex items-center gap-2 text-xs text-muted-foreground'>
                {open ? null : (
                  <Check
                    className='size-3.5 text-(--status-success)'
                    aria-hidden
                  />
                )}
                {run.agent === 'deviceSync'
                  ? t('deviceSyncRun.title')
                  : t('review.title')}
                <span className='ml-auto tabular-nums'>
                  {relativeTime(
                    run.updatedAt,
                    i18n.language,
                    t('comments.justNow'),
                  )}
                </span>
              </span>
              <span className='truncate font-medium'>{titleOf(run, t)}</span>
              <span className='truncate text-xs text-muted-foreground'>
                {redone.has(run.id) ? t('review.redone') : lineOf(run, t)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** What a run is about: the request, or the differences a sync left. */
function titleOf(run: AgentRun, t: Translate): string {
  if (run.agent === 'deviceSync') return followUpTitle(run, t);
  return run.title ?? run.subjectId;
}

/** One line saying where a run stands. */
function lineOf(run: AgentRun, t: Translate): string {
  if (run.agent === 'deviceSync') {
    if (run.status === 'running') return t('deviceSyncRun.working');
    if (run.status === 'accepted') return t('deviceSyncRun.accepted');
    if (run.status === 'pending') return run.result?.summary ?? '';
  }
  if (run.status === 'running') return t('review.working');
  if (run.status === 'failed')
    return t(`review.failed.${run.failure ?? 'failed'}`, {
      defaultValue: t('review.failed.failed'),
    });
  if (run.status === 'accepted')
    return t(`review.decided.${run.decision ?? 'approved'}`);
  if (run.status === 'dismissed') return t('review.dismissed');
  if (run.status === 'superseded') return t('review.superseded');
  return run.agent === 'approvalReview' && run.result
    ? `${t(`review.recommendation.${run.result.recommendation}`)} · ${run.result.summary}`
    : '';
}

function ReviewDetail({
  id,
}: {
  readonly id: string | null;
  readonly onBack: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inbox = useInbox();
  const run = [
    ...(inbox.data?.open ?? []),
    ...(inbox.data?.handled ?? []),
  ].find((item) => item.id === id);
  if (!run)
    return (
      <p className='p-6 text-sm text-muted-foreground'>
        {t('agentInbox.nothingPicked')}
      </p>
    );
  // MDM 核对 itself (2026-10-17), as a review shows its request: the page's
  // 等你决定 carries the suggestion while it is open. One already handled
  // is no longer on the page, so its card, folded, sits above it.
  if (run.agent === 'deviceSync')
    return (
      <div className='min-w-0'>
        {isOpen(run) ? null : (
          <div className='px-6 pt-6'>
            <DeviceSyncRunCard key={run.id} run={run} />
          </div>
        )}
        {/* The page's 等你决定 shows the picked run alone. */}
        <FollowUpFocusContext.Provider value={run.id}>
          <PagePane
            key={run.id}
            to='/device-sync'
            page={DeviceSyncReviewPage}
            onLeave={(path) => void navigate(path)}
          />
        </FollowUpFocusContext.Provider>
      </div>
    );
  // The request itself, as a notification shows its record (2026-10-16):
  // its own page, whose 等你决定 carries the review while it waits on the
  // reader. One already handled is no longer on the page, so its card,
  // folded to how it ended, sits above it.
  return (
    <div className='min-w-0'>
      {isOpen(run) ? null : (
        <div className='px-6 pt-6'>
          <ApprovalReviewCard key={run.id} run={run} />
        </div>
      )}
      <RecordPane
        key={run.id}
        to={`${run.subjectType === 'purchaseOrders' ? '/procurement' : '/disposals'}/${encodeURIComponent(run.subjectId)}`}
        onLeave={(path) => void navigate(path)}
        fallback={
          <p className='p-6 text-sm text-muted-foreground'>
            {t('common.notFound')}
          </p>
        }
      />
    </div>
  );
}
