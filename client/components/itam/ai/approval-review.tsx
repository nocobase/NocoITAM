import { useTranslation } from '@nocobase/i18n/client';
import { Check, ChevronRight, Info, RotateCcw, Sparkles } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import {
  useAskReview,
  useDecideReview,
  useDismissReview,
  useLatestReview,
  type ApprovalReviewRun,
  type ApprovalReviewResult,
} from '@/lib/itam/agents';
import { relativeTime } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';

import { AiShortcut } from './ai-shortcut.js';

/**
 * 审批审阅's card (2026-10-16, plan "Work agents", step 1): a decision card for the approver —
 * an amber edge, what the review recommends in one line, what is asked,
 * and the basis folded away; the decision comment ready to edit; the
 * recommended decision as the one solid button, the other beside it, then
 * 忽略, 讨论 and redoing it in the approver's words. While the agent works it
 * says so; when it could not finish it says why and offers to try again;
 * once decided it folds to one line. Shown in 收件箱 and on the request's
 * own page (`ApprovalReviewBlock`).
 */
export function ApprovalReviewCard({
  run,
  onDecided,
}: {
  readonly run: ApprovalReviewRun;
  /** After a decision or a dismissal (the inbox moves on). */
  readonly onDecided?: () => void;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  const decide = useDecideReview();
  const dismiss = useDismissReview();
  const ask = useAskReview();
  const result = run.result;
  const [comment, setComment] = useState(result?.comment ?? '');
  // The comment the review drafted, once its result arrives on a card
  // shown while it was still at work.
  const [draftedFor, setDraftedFor] = useState(result ? run.id : null);
  if (result && draftedFor !== run.id) {
    setDraftedFor(run.id);
    setComment(result.comment);
  }
  const [redoing, setRedoing] = useState(false);
  const [instruction, setInstruction] = useState('');
  const busy = decide.isPending || dismiss.isPending || ask.isPending;
  const error = decide.error ?? dismiss.error ?? ask.error;
  const when = relativeTime(
    run.updatedAt,
    i18n.language,
    t('comments.justNow'),
  );
  const again = () =>
    ask.mutate({ subjectType: run.subjectType, subjectId: run.subjectId });

  if (run.status === 'accepted' || run.status === 'dismissed')
    return (
      <p className='flex items-center gap-2 text-sm text-muted-foreground opacity-55'>
        <Check className='size-4 text-(--status-success)' aria-hidden />
        {run.status === 'accepted'
          ? t(`review.decided.${run.decision ?? 'approved'}`)
          : t('review.dismissed')}
        <span className='tabular-nums'>· {when}</span>
      </p>
    );

  return (
    // The brand's blue-green, as every AI entry (2026-10-23; amber before).
    <section
      aria-label={t('review.title')}
      className='rounded-lg border border-l-4 border-l-primary bg-card p-4 text-sm'
    >
      <header className='flex flex-wrap items-center gap-2'>
        <Sparkles className='size-4 text-primary' aria-hidden />
        <span className='font-medium'>{t('review.title')}</span>
        {result ? (
          <StatusBadge tone='warning' size='sm'>
            {t(`review.recommendation.${result.recommendation}`)}
          </StatusBadge>
        ) : null}
        <span className='ml-auto text-xs text-muted-foreground tabular-nums'>
          {when}
        </span>
      </header>

      {run.status === 'running' ? (
        <p
          role='status'
          className='mt-3 flex items-center gap-2 text-muted-foreground'
        >
          <Spinner />
          {t('review.working')}
        </p>
      ) : run.status === 'failed' ? (
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <p className='text-destructive'>
            {t(`review.failed.${run.failure ?? 'failed'}`, {
              defaultValue: t('review.failed.failed'),
            })}
          </p>
          <Button variant='outline' disabled={busy} onClick={again}>
            <RotateCcw />
            {t('review.askAgain')}
          </Button>
        </div>
      ) : result ? (
        <div className='mt-3 space-y-3'>
          <p className='font-medium'>{result.summary}</p>
          {run.instruction ? (
            <p className='text-xs text-muted-foreground'>
              {t('review.revised', { text: run.instruction })}
            </p>
          ) : null}
          <Field label={t('review.asked')}>{result.asked}</Field>
          {result.conditions ? (
            <Field label={t('review.conditions')}>{result.conditions}</Field>
          ) : null}
          <Basis result={result} />
          <label className='block space-y-1.5'>
            <span className='text-xs text-muted-foreground'>
              {t('review.comment')}
            </span>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </label>
          <div className='flex flex-wrap items-center gap-2'>
            {decisionButtons(result.recommendation).map(
              ({ decision, solid }) => (
                <Button
                  key={decision}
                  variant={
                    decision === 'rejected'
                      ? 'destructive'
                      : solid
                        ? 'default'
                        : 'outline'
                  }
                  disabled={busy}
                  onClick={() =>
                    decide.mutate(
                      { run, decision, comment },
                      { onSuccess: () => onDecided?.() },
                    )
                  }
                >
                  {t(
                    decision === 'approved'
                      ? 'review.approve'
                      : 'review.reject',
                  )}
                </Button>
              ),
            )}
            <Button
              variant='ghost'
              disabled={busy}
              onClick={() =>
                dismiss.mutate(run, { onSuccess: () => onDecided?.() })
              }
            >
              {t('review.dismiss')}
            </Button>
            {/* 修改 alone (2026-10-16): 讨论, a conversation about the
                request, went — the review is changed here, in words. */}
            <AiShortcut
              className='ml-auto'
              onClick={() => setRedoing((open) => !open)}
            >
              {t('review.redo')}
            </AiShortcut>
          </div>
          {redoing ? (
            <form
              className='flex flex-col gap-2'
              onSubmit={(event) => {
                event.preventDefault();
                if (!instruction.trim()) return;
                ask.mutate(
                  {
                    subjectType: run.subjectType,
                    subjectId: run.subjectId,
                    revise: { runId: run.id, instruction: instruction.trim() },
                  },
                  {
                    onSuccess: () => {
                      setRedoing(false);
                      setInstruction('');
                    },
                  },
                );
              }}
            >
              <Textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t('review.redoPlaceholder')}
                rows={2}
                maxLength={1000}
                autoFocus
              />
              <div>
                {/* An AI action, so its sparkle (2026-10-23). */}
                <Button type='submit' disabled={busy || !instruction.trim()}>
                  <Sparkles data-icon='inline-start' />
                  {t('review.redoSend')}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className='mt-2 text-sm text-destructive'>{error.message}</p>
      ) : null}
    </section>
  );
}

/** The recommended decision first and solid; the other beside it. */
/**
 * The one decision the review drafted its comment for (2026-10-23): 批准
 * for approve or conditional, 拒绝 for reject or need-more (there is no
 * 退回补充; the comment says what to add). Deciding the other way is the
 * request's own 审批, after 忽略 — the drafted comment argues for this one.
 */
function decisionButtons(
  recommendation: ApprovalReviewResult['recommendation'],
): { readonly decision: 'approved' | 'rejected'; readonly solid: boolean }[] {
  return recommendation === 'approve' || recommendation === 'conditional'
    ? [{ decision: 'approved', solid: true }]
    : [{ decision: 'rejected', solid: true }];
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='space-y-0.5'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='whitespace-pre-wrap'>{children}</p>
    </div>
  );
}

/** The basis, folded away: reasons, what could serve instead, precedents, risks, what is missing. */
function Basis({
  result,
}: {
  readonly result: ApprovalReviewResult;
}): ReactElement {
  const { t } = useTranslation();
  const list = (items: readonly string[]) =>
    items.length ? (
      <ul className='list-disc space-y-0.5 pl-5'>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : null;
  return (
    <Collapsible>
      <CollapsibleTrigger className='group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'>
        <ChevronRight
          className='size-3.5 transition-transform group-data-[panel-open]:rotate-90'
          aria-hidden
        />
        {t('review.basis')}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2 space-y-3'>
        {result.reasons.length ? (
          <Field label={t('review.reasons')}>{list(result.reasons)}</Field>
        ) : null}
        {result.alternatives ? (
          <Field label={t('review.alternatives')}>{result.alternatives}</Field>
        ) : null}
        <Field label={t('review.precedents')}>{result.precedents}</Field>
        {result.risks.length ? (
          <Field label={t('review.risks')}>{list(result.risks)}</Field>
        ) : null}
        {result.missing.length ? (
          <Field label={t('review.missing')}>{list(result.missing)}</Field>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * 等你决定 on a purchase order's or a disposal's page: the newest review, for the approver alone, under the title. While
 * the request waits on the reader and no review is open, one line offers
 * to ask for one. Nothing for anybody else, or once nothing waits.
 */
export function ApprovalReviewBlock({
  subjectType,
  subjectId,
  waitingOnReader,
}: {
  readonly subjectType: 'purchaseOrders' | 'disposals';
  readonly subjectId: string;
  /** The request is pending and names the reader as its approver. */
  readonly waitingOnReader: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const me = useCurrentUserId();
  const latest = useLatestReview(subjectType, subjectId);
  const ask = useAskReview();
  const run = latest.data;
  const mine = run && run.deciderId === me;
  const open =
    mine &&
    (run.status === 'running' ||
      run.status === 'pending' ||
      run.status === 'failed');
  // The review open while the page was: once decided here it stays,
  // folded to its line under the heading.
  const [shownId, setShownId] = useState<string | null>(null);
  if (open && run.id !== shownId) setShownId(run.id);
  const decidedHere =
    mine &&
    run.id === shownId &&
    (run.status === 'accepted' || run.status === 'dismissed');
  if (latest.isLoading) return null;
  if (!open && !decidedHere && !waitingOnReader) return null;
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-semibold'>{t('review.waiting')}</h2>
      {open || decidedHere ? (
        <ApprovalReviewCard key={run.id} run={run} />
      ) : (
        <p className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
          <Info className='size-4' aria-hidden />
          {t('review.waitingNoReview')}
          <AiShortcut
            disabled={ask.isPending}
            onClick={() => ask.mutate({ subjectType, subjectId })}
          >
            {t('review.ask')}
          </AiShortcut>
          {ask.error ? (
            <span className='text-destructive'>{ask.error.message}</span>
          ) : null}
        </p>
      )}
    </section>
  );
}
