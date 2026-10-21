import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ListChecks, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useApi } from '@/lib/itam/api';
import { errorMessage, formatDate } from '@/lib/itam/format';

/**
 * The plans the assistant proposes, as cards in its conversation (template
 * 1.0.0-beta.64, after NocoCRM's): every change Asset Steward asks for is one plan of
 * steps (`server/providers/itam/plans.ts`), and nothing is written until the
 * person it works for carries it out here — or declines it. Each step reads
 * as its own line; unticking one leaves it out. What became of the plan goes
 * back to the conversation (`plan-news.ts`), so Asset Steward reports it.
 */

import { PLANS_PATH, type Plan, type PlanStep } from '@/lib/itam/plans';

type StepField = NonNullable<PlanStep['check']>['fields'][number];

const STATUS_TONE: Readonly<
  Record<Plan['status'], 'secondary' | 'outline' | 'destructive'>
> = {
  pending: 'secondary',
  executing: 'secondary',
  executed: 'outline',
  failed: 'destructive',
  voided: 'outline',
  expired: 'outline',
};

/**
 * Carrying a plan out or declining it: the steps left unticked are skipped.
 * The card's own buttons, and MDM 核对's folded follow-up header's
 * (2026-10-21), which carries them without the steps in view.
 */
export function PlanDecision({
  plan,
  skipped = NONE,
}: {
  readonly plan: Plan;
  readonly skipped?: ReadonlySet<number>;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const client = useQueryClient();
  const toaster = useToaster();
  const decide = useMutation({
    mutationFn: async (decision: 'execute' | 'void') =>
      (
        await api.request<{ data: Plan }>({
          path: `${PLANS_PATH}/${encodeURIComponent(plan.id)}/${decision}`,
          method: 'POST',
          json:
            decision === 'execute'
              ? {
                  revision: plan.revision,
                  ...(skipped.size ? { skip: [...skipped] } : {}),
                }
              : { revision: plan.revision },
        })
      ).data,
    onSuccess: async (done) => {
      toaster.show({
        type: done.status === 'failed' ? 'error' : 'success',
        title: t(`ai.plans.toast.${done.status}`, { title: plan.title }),
      });
      // The steps may have changed any record the pages show.
      await client.invalidateQueries({ queryKey: ['itam'] });
    },
    onError: async (error) => {
      toaster.show({ type: 'error', title: errorMessage(error) });
      await client.invalidateQueries({ queryKey: ['itam', PLANS_PATH] });
    },
  });
  const left = plan.steps.filter((step) => !skipped.has(step.position)).length;
  return (
    <>
      <Button
        variant='ghost'
        disabled={decide.isPending}
        onClick={() => decide.mutate('void')}
      >
        {t('ai.plans.decline')}
      </Button>
      <Button
        disabled={decide.isPending || left === 0}
        onClick={() => decide.mutate('execute')}
      >
        {t('ai.plans.execute', { count: left })}
      </Button>
    </>
  );
}

const NONE: ReadonlySet<number> = new Set();

export function PlanCard({
  plan,
  bare = false,
  skipped: given,
  onSkippedChange,
  settled = NONE,
  settledLabel,
}: {
  readonly plan: Plan;
  /**
   * The steps alone, inside a card that says what the plan is and carries
   * its decision (MDM 核对's follow-up, 2026-10-21).
   */
  readonly bare?: boolean;
  /** The unticked steps, when the decision is outside the card. */
  readonly skipped?: ReadonlySet<number>;
  readonly onSkippedChange?: (skipped: ReadonlySet<number>) => void;
  /**
   * Steps already done some other way (MDM 核对's rows, 2026-10-21): shown
   * unticked and struck through with `settledLabel`, and not to be ticked.
   */
  readonly settled?: ReadonlySet<number>;
  readonly settledLabel?: string;
}): ReactElement {
  const { t } = useTranslation();
  const [own, setOwn] = useState<ReadonlySet<number>>(() => new Set());
  const skipped = given ?? own;
  const setSkipped = onSkippedChange ?? setOwn;
  // Each step's line already says what it does; the raw parameters behind it
  // (ids, references, JSON) stay folded until asked for (2026-10-16).
  const [showParams, setShowParams] = useState(false);
  const pending = plan.status === 'pending';
  const steps = plan.steps;
  const hasParams = steps.some((step) => step.check?.fields.length);
  // Not inside MDM 核对's follow-up (2026-10-21): each step's line says
  // enough there.
  const toggleParams =
    hasParams && !bare ? (
      <Button
        size='sm'
        variant='link'
        className='mr-auto h-auto px-0 text-xs text-muted-foreground'
        aria-expanded={showParams}
        onClick={() => setShowParams((shown) => !shown)}
      >
        {t(showParams ? 'ai.plans.hideParams' : 'ai.plans.showParams')}
      </Button>
    ) : null;
  return (
    <div
      className={
        bare
          ? 'text-sm'
          : 'my-2 rounded-lg border border-border bg-card p-3 text-sm'
      }
    >
      {bare ? null : (
        <div className='flex items-start gap-2'>
          <ListChecks
            className='mt-0.5 size-4 shrink-0 text-primary'
            aria-hidden='true'
          />
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium'>{plan.title}</span>
              <Badge variant={STATUS_TONE[plan.status]}>
                {t(`ai.plans.status.${plan.status}`)}
              </Badge>
            </div>
            {plan.summary ? (
              <p className='mt-1 text-muted-foreground'>{plan.summary}</p>
            ) : null}
          </div>
        </div>
      )}
      <ol className={bare ? 'space-y-2' : 'mt-3 space-y-2'}>
        {steps.map((step) => (
          <li key={step.id} className='flex items-start gap-2'>
            {pending && steps.length > 1 ? (
              <Checkbox
                className='mt-0.5'
                checked={
                  !skipped.has(step.position) && !settled.has(step.position)
                }
                disabled={settled.has(step.position)}
                aria-label={step.check?.title ?? step.op}
                onCheckedChange={(checked) => {
                  const next = new Set(skipped);
                  if (checked) next.delete(step.position);
                  else next.add(step.position);
                  setSkipped(next);
                }}
              />
            ) : (
              <StepMark status={step.status} />
            )}
            <div className='min-w-0 flex-1'>
              <div>
                <span
                  className={
                    step.status === 'removed' ||
                    skipped.has(step.position) ||
                    settled.has(step.position)
                      ? 'text-muted-foreground line-through'
                      : undefined
                  }
                >
                  {step.check?.title || t(`ai.plans.ops.${step.op}`)}
                </span>
                {/* At the end of the line, not struck through. */}
                {settled.has(step.position) && settledLabel ? (
                  <span className='ml-2 text-xs text-muted-foreground'>
                    {settledLabel}
                  </span>
                ) : null}
              </div>
              {showParams && step.check?.fields.length ? (
                <div className='mt-0.5 text-xs wrap-anywhere text-muted-foreground'>
                  {step.check.fields
                    .map((field) => `${field.field}: ${fieldText(field)}`)
                    .join(' · ')}
                </div>
              ) : null}
              {step.status === 'failed' && plan.failure ? (
                <div className='mt-0.5 text-xs text-destructive'>
                  {plan.failure.message || plan.failure.code}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {pending && !bare ? (
        <div className='mt-3 flex flex-wrap items-center justify-end gap-2'>
          {toggleParams}
          <PlanDecision plan={plan} skipped={skipped} />
        </div>
      ) : plan.decidedAt || toggleParams ? (
        <div className='mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground'>
          {toggleParams}
          {plan.decidedAt ? formatDate(plan.decidedAt, true) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepMark({
  status,
}: {
  readonly status: PlanStep['status'];
}): ReactElement {
  if (status === 'done')
    return (
      <Check
        className='mt-0.5 size-4 shrink-0 text-primary'
        aria-hidden='true'
      />
    );
  if (status === 'failed')
    return (
      <X
        className='mt-0.5 size-4 shrink-0 text-destructive'
        aria-hidden='true'
      />
    );
  return (
    <span
      className='mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40'
      aria-hidden='true'
    />
  );
}

/** A parameter as the card shows it: the record's name for an id. */
function fieldText(field: StepField): string {
  if (field.name) return field.name;
  const value = field.value;
  if (value === null || value === undefined) return '—';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value);
  const json = JSON.stringify(value) ?? '';
  return json.length > 120 ? `${json.slice(0, 117)}…` : json;
}
