import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ListChecks, X } from 'lucide-react';
import { Fragment, useState, type ReactElement } from 'react';

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

import {
  PLANS_PATH,
  type Plan,
  type PlanStep,
  type StepField,
} from '@/lib/itam/plans';

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
  declineLabel,
}: {
  readonly plan: Plan;
  readonly skipped?: ReadonlySet<number>;
  /** In place of 拒绝: MDM 跟进's 暂不处理 (2026-10-22). */
  readonly declineLabel?: string;
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
      {/* A text button among others: its padding taken back, so its word
          sits the row's gap from its neighbours (2026-10-22). */}
      <Button
        variant='ghost'
        className='-mx-2.5'
        disabled={decide.isPending}
        onClick={() => decide.mutate('void')}
      >
        {declineLabel ?? t('ai.plans.decline')}
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
  tickable = NONE,
  doneSince = NONE,
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
  /**
   * Steps of a plan carried out that left them out, to tick again as at
   * first (MDM 核对's follow-up, 2026-10-22); carried out from outside.
   */
  readonly tickable?: ReadonlySet<number>;
  /** Steps left out and carried out later, shown done (2026-10-22). */
  readonly doneSince?: ReadonlySet<number>;
}): ReactElement {
  const { t } = useTranslation();
  const [own, setOwn] = useState<ReadonlySet<number>>(() => new Set());
  const skipped = given ?? own;
  const setSkipped = onSkippedChange ?? setOwn;
  // Each step's line already says what it does; the raw parameters behind it
  // (ids, references, JSON) stay folded until asked for (2026-10-16).
  const [showParams, setShowParams] = useState(false);
  const pending = plan.status === 'pending';
  const steps = plan.steps.map((step) =>
    doneSince.has(step.position) ? { ...step, status: 'done' as const } : step,
  );
  const hasParams = steps.some((step) => step.check?.fields.length);
  // Inside MDM 核对's follow-up too (2026-10-22; left out from 2026-10-21
  // while the details read as one blurred line).
  const toggleParams = hasParams ? (
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
            {(pending && steps.length > 1) || tickable.has(step.position) ? (
              <Checkbox
                className='mt-0.5'
                checked={
                  !skipped.has(step.position) && !settled.has(step.position)
                }
                disabled={settled.has(step.position)}
                aria-label={step.check?.title || t(`ai.plans.ops.${step.op}`)}
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
                {/* Left out — unticked, settled elsewhere, or not run — it
                    is muted, never struck through (2026-10-22). */}
                <span
                  className={
                    (pending &&
                      (skipped.has(step.position) ||
                        settled.has(step.position))) ||
                    (step.status === 'removed' &&
                      (!tickable.has(step.position) ||
                        skipped.has(step.position))) ||
                    // Done, inside a follow-up: what is left reads first.
                    (bare && step.status === 'done')
                      ? 'text-muted-foreground'
                      : undefined
                  }
                >
                  {step.check?.title || t(`ai.plans.ops.${step.op}`)}
                </span>
                {/* At the end of the line, not struck through. */}
                {/* Not run then and settled since: 已处理 (2026-10-22). */}
                {(pending || step.status === 'removed') &&
                settled.has(step.position) &&
                settledLabel ? (
                  <Badge variant='secondary' className='ml-2 align-[1px]'>
                    {settledLabel}
                  </Badge>
                ) : !pending &&
                  step.status === 'removed' &&
                  // Tickable again, its checkbox says it (2026-10-22).
                  !tickable.has(step.position) ? (
                  <Badge variant='secondary' className='ml-2 align-[1px]'>
                    {t('ai.plans.notRun')}
                  </Badge>
                ) : bare && step.status === 'done' ? (
                  // Inside a follow-up, with no status of the plan's own to
                  // say it (2026-10-22).
                  <Badge variant='secondary' className='ml-2 align-[1px]'>
                    {t('ai.plans.stepDone')}
                  </Badge>
                ) : null}
              </div>
              {showParams && step.check?.fields.length ? (
                <StepParams fields={step.check.fields} />
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
      ) : (plan.decidedAt && !bare) || toggleParams ? (
        <div className='mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground'>
          {toggleParams}
          {/* Bare, the card's tag says when (2026-10-22). */}
          {plan.decidedAt && !bare ? formatDate(plan.decidedAt, true) : null}
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

/**
 * A step's parameters as the pages word them (2026-10-22; field keys, ids
 * and raw JSON until then): each field by its label, a record by its name,
 * a state as the pages say it, and a list's entries a line each. A type
 * beside a named record and an id nothing names are left out: the name, or
 * the step's own line, already says it.
 */
function StepParams({
  fields,
}: {
  readonly fields: readonly StepField[];
}): ReactElement | null {
  const { t } = useTranslation();
  const label = (field: string) =>
    t(`ai.plans.params.${field}`, {
      defaultValue: t(`fields.${field.replace(/Ids?$/, '')}`, {
        defaultValue: t(`fields.${field}`, { defaultValue: field }),
      }),
    });
  const value = (field: StepField): string | undefined => {
    if (field.name) return field.name;
    const raw = field.value;
    if (raw === null || raw === undefined || raw === '') return undefined;
    if (typeof raw === 'boolean') return t(raw ? 'common.yes' : 'common.no');
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') {
      // An id nothing could name says nothing to the reader.
      if (/Ids?$/.test(field.field)) return undefined;
      if (field.field === 'nextStatus' || field.field === 'status')
        return t(`enums.deviceStatus.${raw}`, { defaultValue: raw });
      if (field.field === 'ownership')
        return t(`enums.ownership.${raw}`, { defaultValue: raw });
      return raw;
    }
    const json = JSON.stringify(raw) ?? '';
    return json.length > 120 ? `${json.slice(0, 117)}…` : json;
  };
  // Each field a row of its own, its name then its value (2026-10-22: one
  // line joined by dots read as a blur).
  const rowsOf = (row: readonly StepField[]) =>
    row
      .filter(
        (field) =>
          // The holder's or target's kind: its name says it.
          !/Type$/.test(field.field) && !field.items,
      )
      .flatMap((field) => {
        const text = value(field);
        return text === undefined
          ? []
          : [{ key: field.field, label: label(field.field), value: text }];
      });
  const table = (rows: ReturnType<typeof rowsOf>, key?: number) =>
    rows.length ? (
      <dl
        key={key}
        className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5'
      >
        {rows.map((row) => (
          <Fragment key={row.key}>
            <dt className='whitespace-nowrap text-muted-foreground'>
              {row.label}
            </dt>
            <dd className='wrap-anywhere'>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    ) : null;
  // A list in a plan proposed before its entries were named: their fields
  // as they are, ids left out.
  const entriesOf = (field: StepField): readonly (readonly StepField[])[] =>
    field.items ??
    (Array.isArray(field.value) &&
    field.value.length > 0 &&
    field.value.every((entry) => entry && typeof entry === 'object')
      ? (field.value as Record<string, unknown>[]).map((entry) =>
          Object.entries(entry).map(([key, value]) => ({ field: key, value })),
        )
      : []);
  const own = rowsOf(fields.filter((field) => !entriesOf(field).length));
  const lists = fields.flatMap(entriesOf).map(rowsOf);
  if (!own.length && !lists.some((rows) => rows.length)) return null;
  // On a light panel under the step, an entry of a list below a rule.
  return (
    <div className='mt-1 grid gap-1.5 divide-y divide-border rounded-md bg-muted/60 px-2.5 py-1.5 text-xs [&>*:not(:first-child)]:pt-1.5'>
      {table(own)}
      {lists.map((rows, index) =>
        // Positional: an entry has no id of its own.
        table(rows, index),
      )}
    </div>
  );
}
