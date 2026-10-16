import { useTranslation } from '@nocobase/i18n/client';
import {
  Check,
  ChevronRight,
  Info,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { changeText, runFailure } from '@/lib/itam/agent-run-view';
import {
  useAcceptSuggestion,
  useAskReview,
  useDismissReview,
  useLatestRun,
  useRunPlan,
  type SuggestingAgent,
  type SuggestionResult,
  type SuggestionRun,
} from '@/lib/itam/agents';
import { useDiscuss } from '@/lib/itam/ask';
import { relativeTime } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';
import type { Plan } from '@/lib/itam/plans';

import { AiShortcut } from './ai-shortcut.js';

/**
 * The card of a work agent that suggests (2026-10-17, plan "Work agents",
 * step 2: 授权续费; `frontend-standard.md` §S2.3, §S4.5): what
 * it suggests in one line, the changes it proposes each with a tick and its
 * reason, what it leaves to people and its risks folded away; 执行 carries
 * out the ticked changes as a plan, the ticks being the confirmation, then
 * 忽略, 讨论 and redoing it in the decider's words. Once accepted it shows
 * what each step did. Shown in 收件箱 and on the entitlement's page
 * (`SuggestionBlock`).
 */
export function SuggestionCard({
  run,
  onDecided,
}: {
  readonly run: SuggestionRun;
  /** After it is accepted or set aside (the inbox moves on). */
  readonly onDecided?: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const accept = useAcceptSuggestion();
  const dismiss = useDismissReview();
  const ask = useAskReview();
  const discuss = useDiscuss();
  const result = run.result;
  // Every change ticked once the result arrives, also on a card shown while
  // the agent was still at work.
  const [kept, setKept] = useState<ReadonlySet<number>>(() => allOf(result));
  const [keptFor, setKeptFor] = useState(result ? run.id : null);
  if (result && keptFor !== run.id) {
    setKeptFor(run.id);
    setKept(allOf(result));
  }
  const [redoing, setRedoing] = useState(false);
  const [instruction, setInstruction] = useState('');
  const busy = accept.isPending || dismiss.isPending || ask.isPending;
  const error = accept.error ?? dismiss.error ?? ask.error;
  const when = relativeTime(
    run.updatedAt,
    i18n.language,
    t('comments.justNow'),
  );
  const subject = { subjectType: run.subjectType, subjectId: run.subjectId };
  const again = () => ask.mutate({ agent: run.agent, ...subject });

  if (run.status === 'accepted' || run.status === 'dismissed')
    return <Decided run={run} when={when} />;

  return (
    <section
      aria-label={t(`suggestion.agents.${run.agent}`)}
      className='rounded-lg border border-l-4 border-l-(--status-warning) bg-card p-4 text-sm'
    >
      <header className='flex flex-wrap items-center gap-2'>
        <Sparkles className='size-4 text-primary' aria-hidden />
        <span className='font-medium'>
          {t(`suggestion.agents.${run.agent}`)}
        </span>
        {result?.recommendation ? (
          <StatusBadge tone='warning' size='sm'>
            {t(`suggestion.recommendation.${result.recommendation}`)}
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
          {t('suggestion.working')}
        </p>
      ) : run.status === 'failed' ? (
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <p className='text-destructive'>{runFailure(run, t)}</p>
          <Button variant='outline' size='sm' disabled={busy} onClick={again}>
            <RotateCcw />
            {t('suggestion.askAgain')}
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
          {result.saving ? (
            <p>
              <span className='text-muted-foreground'>
                {t('suggestion.saving')}
              </span>{' '}
              {result.saving}
            </p>
          ) : null}
          {result.changes.length ? (
            <fieldset className='space-y-1'>
              <legend className='mb-1 text-xs text-muted-foreground'>
                {t('suggestion.changes')}
              </legend>
              {result.changes.map((change, index) => (
                <label
                  key={`${change.op}-${String(index)}`}
                  className='flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-hover'
                >
                  <Checkbox
                    className='mt-0.5'
                    checked={kept.has(index)}
                    disabled={busy}
                    onCheckedChange={(on) =>
                      setKept((before) => {
                        const next = new Set(before);
                        if (on) next.add(index);
                        else next.delete(index);
                        return next;
                      })
                    }
                  />
                  <span className='min-w-0 space-y-0.5'>
                    <span className='block'>{changeText(change, t)}</span>
                    {change.reason ? (
                      <span className='block text-xs text-muted-foreground'>
                        {change.reason}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className='text-muted-foreground'>
              {t('suggestion.nothingToChange')}
            </p>
          )}
          <Basis result={result} />
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              disabled={busy || (result.changes.length > 0 && !kept.size)}
              onClick={() =>
                accept.mutate(
                  { run, keep: [...kept] },
                  { onSuccess: () => onDecided?.() },
                )
              }
            >
              {result.changes.length
                ? t('suggestion.execute', { count: kept.size })
                : t('suggestion.agree')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={busy}
              onClick={() =>
                dismiss.mutate(run, { onSuccess: () => onDecided?.() })
              }
            >
              {t('review.dismiss')}
            </Button>
            <AiShortcut
              className='ml-auto'
              onClick={() =>
                discuss([
                  {
                    kind: run.subjectType,
                    id: run.subjectId,
                    label: run.title ?? run.subjectId,
                  },
                ])
              }
            >
              {t('review.discuss')}
            </AiShortcut>
            <AiShortcut onClick={() => setRedoing((open) => !open)}>
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
                    agent: run.agent,
                    ...subject,
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
                placeholder={t(`suggestion.redoPlaceholder.${run.agent}`)}
                rows={2}
                maxLength={1000}
                autoFocus
              />
              <div>
                <Button
                  size='sm'
                  type='submit'
                  disabled={busy || !instruction.trim()}
                >
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

const allOf = (result: SuggestionResult | null): ReadonlySet<number> =>
  new Set(result?.changes.map((_change, index) => index) ?? []);

/** Accepted or set aside: one line, and once accepted what each step did. */
function Decided({
  run,
  when,
}: {
  readonly run: SuggestionRun;
  readonly when: string;
}): ReactElement {
  const { t } = useTranslation();
  const plan = useRunPlan(run);
  return (
    <div className='space-y-2'>
      <p className='flex items-center gap-2 text-sm text-muted-foreground opacity-55'>
        <Check className='size-4 text-(--status-success)' aria-hidden />
        {run.status === 'accepted'
          ? t('suggestion.accepted')
          : t('review.dismissed')}
        <span className='tabular-nums'>· {when}</span>
      </p>
      {plan.data ? <Outcome plan={plan.data} /> : null}
    </div>
  );
}

/** The plan's steps: done, refused, or never reached. */
function Outcome({ plan }: { readonly plan: Plan }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-1 text-sm'>
      <ul className='space-y-1'>
        {plan.steps.map((step) => (
          <li key={step.id} className='flex items-start gap-2'>
            {step.status === 'done' ? (
              <Check
                className='mt-0.5 size-4 shrink-0 text-primary'
                aria-hidden
              />
            ) : step.status === 'failed' ? (
              <X
                className='mt-0.5 size-4 shrink-0 text-destructive'
                aria-hidden
              />
            ) : (
              <span
                className='mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40'
                aria-hidden
              />
            )}
            <span>{step.check?.title ?? step.op}</span>
          </li>
        ))}
      </ul>
      {plan.failure ? (
        <p className='text-destructive'>
          {t('suggestion.stoppedAt', {
            position: plan.failure.position + 1,
            message: plan.failure.message,
          })}
        </p>
      ) : null}
    </div>
  );
}

/** What it leaves to people, its risks and (授权续费) its reasons, folded away. */
function Basis({
  result,
}: {
  readonly result: SuggestionResult;
}): ReactElement | null {
  const { t } = useTranslation();
  const groups = [
    ['reasons', result.reasons ?? []],
    ['notes', result.notes],
    ['risks', result.risks],
  ] as const;
  if (!groups.some(([, items]) => items.length)) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className='group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'>
        <ChevronRight
          className='size-3.5 transition-transform group-data-[panel-open]:rotate-90'
          aria-hidden
        />
        {t('suggestion.basis')}
      </CollapsibleTrigger>
      <CollapsibleContent className='mt-2 space-y-3'>
        {groups.map(([key, items]) =>
          items.length ? (
            <div key={key} className='space-y-0.5'>
              <p className='text-xs text-muted-foreground'>
                {t(`suggestion.${key}`)}
              </p>
              <ul className='list-disc space-y-0.5 pl-5'>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * 等你决定 on an entitlement's page (`frontend-standard.md`
 * §S3.2): the reader's newest suggestion under the title while it waits,
 * and once accepted here what it did. With none open, one line offers to
 * ask for one when `offer` says the record calls for it (an entitlement
 * the reader answers for, due soon).
 */
export function SuggestionBlock({
  agent,
  subjectType,
  subjectId,
  offer,
  offerText,
}: {
  readonly agent: SuggestingAgent;
  readonly subjectType: 'entitlements';
  readonly subjectId: string;
  readonly offer: boolean;
  readonly offerText: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const me = useCurrentUserId();
  const latest = useLatestRun<SuggestionRun>(agent, subjectType, subjectId);
  const ask = useAskReview();
  const run = latest.data;
  const mine = run && run.deciderId === me;
  const open =
    mine &&
    (run.status === 'running' ||
      run.status === 'pending' ||
      run.status === 'failed');
  const [shownId, setShownId] = useState<string | null>(null);
  if (open && run.id !== shownId) setShownId(run.id);
  const decidedHere =
    mine &&
    run.id === shownId &&
    (run.status === 'accepted' || run.status === 'dismissed');
  if (latest.isLoading) return null;
  if (open || decidedHere)
    return (
      <section className='space-y-2'>
        <h2 className='text-sm font-semibold'>{t('review.waiting')}</h2>
        <SuggestionCard key={run.id} run={run} />
      </section>
    );
  if (!offer) return null;
  return (
    <p className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
      <Info className='size-4' aria-hidden />
      {offerText}
      <AiShortcut
        disabled={ask.isPending}
        onClick={() => ask.mutate({ agent, subjectType, subjectId })}
      >
        {t(`suggestion.ask.${agent}`)}
      </AiShortcut>
      {ask.error ? (
        <span className='text-destructive'>{ask.error.message}</span>
      ) : null}
    </p>
  );
}
