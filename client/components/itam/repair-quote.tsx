import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement, type ReactNode } from 'react';

import { DocumentReading } from '@/components/itam/ai/document-reading';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { ReviewMark } from '@/components/itam/review-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import {
  useApi,
  useItamRecord,
  useItamSettings,
  type ItamRecord,
} from '@/lib/itam/api';
import { CURRENCIES } from '@/lib/itam/currencies';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { formatMoney, text, todayIso } from '@/lib/itam/format';
import { REPAIRS_PATH, REPAIR_RECOMMENDATIONS } from '@/lib/itam/operations';

type Recommendation = (typeof REPAIR_RECOMMENDATIONS)[number];

interface Advice {
  readonly recommendation: Recommendation;
  readonly reasons: readonly string[];
  /** The amount and currency it was given for. */
  readonly for: string;
}

const adviceKey = (amount: unknown, currency: unknown) =>
  `${String(amount)} ${String(currency)}`;

/** A filled tag, as a status is: amber for replace, calm blue otherwise. */
function RecommendationBadge({
  recommendation,
}: {
  readonly recommendation: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge
      variant='secondary'
      className={
        recommendation === 'replace'
          ? 'bg-warning text-warning-foreground'
          : 'bg-info text-info-foreground'
      }
    >
      {t(`repairs.triage.recommendation.${recommendation}`)}
    </Badge>
  );
}

/**
 * 记录报价 (2026-10-23): the vendor's quote while the device is away. The
 * quote is pasted or uploaded and read (`repairQuote`), or its amount is
 * typed; either way Asset Steward weighs the amount against the device —
 * its book value, age, replacement date and repairs — before it is saved,
 * so the repair keeps the advice it was given and why. A new quote clears
 * what was decided on the last one.
 */
export function RepairQuoteDialog({
  repair,
  onClose,
}: {
  readonly repair: ItamRecord;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const ai = useItamAi();
  const read = useAiReading();
  const queryClient = useQueryClient();
  const settings = useItamSettings();
  const id = text(repair.id);
  const [amount, setAmount] = useState<{
    amount?: unknown;
    currency?: unknown;
  }>(() => ({
    amount: repair.quoteAmount ?? null,
    currency: repair.currency ?? settings.data?.general.currency ?? null,
  }));
  const [work, setWork] = useState(() => text(repair.quoteNotes));
  const [advice, setAdvice] = useState<Advice>();
  const [review, setReview] = useState<ReadonlySet<string>>(() => new Set());
  const [judging, setJudging] = useState(false);
  const checked = (key: string) =>
    setReview((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  const adviceFrom = (
    reading: Record<string, unknown>,
    forKey: string,
  ): Advice | undefined => {
    const recommendation = REPAIR_RECOMMENDATIONS.find(
      (value) => value === reading.recommendation,
    );
    if (!recommendation) return undefined;
    return {
      recommendation,
      reasons: (Array.isArray(reading.reasons) ? reading.reasons : [])
        .map((reason) => text(reason))
        .filter(Boolean)
        .slice(0, 3),
      for: forKey,
    };
  };

  const applyQuote = (reading: Record<string, unknown>): ReactNode => {
    const value = Number(reading.amount);
    const next = {
      amount:
        reading.amount !== null && reading.amount !== undefined && value >= 0
          ? value
          : amount.amount,
      currency: CURRENCIES.includes(text(reading.currency))
        ? text(reading.currency)
        : amount.currency,
    };
    setAmount(next);
    if (typeof reading.work === 'string' && reading.work.trim())
      setWork(reading.work.trim());
    setReview(
      new Set(
        (Array.isArray(reading.uncertain) ? reading.uncertain : []).map((key) =>
          text(key),
        ),
      ),
    );
    const given = adviceFrom(reading, adviceKey(next.amount, next.currency));
    setAdvice(given);
    return (
      <>
        {reading.serialMatches === false ? (
          <p className='text-warning-foreground'>
            {t('repairs.report.serialMismatch', {
              printed: text(reading.serialNo),
              serialNo: text(reading.deviceSerialNo),
            })}
          </p>
        ) : null}
        {given ? <AdviceBody advice={given} /> : null}
      </>
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      const value = amount.amount;
      if (typeof value !== 'number') return;
      let given = advice;
      // A typed amount, or one changed after reading, is weighed as typed.
      if (ai.available && given?.for !== adviceKey(value, amount.currency)) {
        setJudging(true);
        try {
          const answer = await read({
            task: 'repairQuote',
            material: t('repairs.quote.typed', {
              amount: formatMoney(value, text(amount.currency)),
              work: work.trim() || '—',
            }),
            context: { repairId: id },
          });
          given = answer.reading
            ? adviceFrom(answer.reading, adviceKey(value, amount.currency))
            : undefined;
        } catch {
          // The quote is kept without advice rather than lost.
          given = undefined;
        } finally {
          setJudging(false);
        }
      }
      await api.request({
        path: `${REPAIRS_PATH}/${id}`,
        method: 'PATCH',
        json: {
          quoteAmount: value,
          ...(amount.currency ? { currency: text(amount.currency) } : {}),
          quoteNotes: work.trim() || null,
          quotedAt: todayIso(),
          quoteRecommendation: given?.recommendation ?? null,
          quoteReasons: given?.reasons.join('\n') || null,
          quoteDecision: null,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('repairs.quote.title')}
      description={t('repairs.quote.description')}
      busy={save.isPending}
      error={save.error}
      disabled={typeof amount.amount !== 'number'}
      confirmLabel={judging ? t('repairs.quote.judging') : t('actions.save')}
      onConfirm={() => save.mutate()}
    >
      <DocumentReading
        ownerType='repairs'
        ownerId={id}
        task='repairQuote'
        context={{ repairId: id }}
        placeholder={t('repairs.quote.placeholder')}
        onRead={applyQuote}
      />
      <div className='grid gap-1.5'>
        <Label htmlFor='quote-amount'>
          {t('fields.quoteAmount')}
          <span className='text-destructive'> *</span>
          {review.has('amount') ? <ReviewMark /> : null}
        </Label>
        <FieldInput
          id='quote-amount'
          field={{
            key: 'quoteAmount',
            label: 'fields.quoteAmount',
            type: 'money',
            currencyField: 'currency',
          }}
          value={amount}
          onChange={(value) => {
            checked('amount');
            setAmount(value ?? {});
          }}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='quote-work'>
          {t('fields.quoteNotes')}
          {review.has('work') ? <ReviewMark /> : null}
        </Label>
        <Textarea
          id='quote-work'
          rows={2}
          value={work}
          onChange={(event) => {
            checked('work');
            setWork(event.target.value);
          }}
        />
      </div>
      {judging ? (
        <p
          role='status'
          className='flex items-center gap-2 text-sm text-muted-foreground'
        >
          <Spinner />
          {t('repairs.quote.judging')}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function AdviceBody({ advice }: { readonly advice: Advice }): ReactElement {
  return (
    <div className='space-y-1.5'>
      <RecommendationBadge recommendation={advice.recommendation} />
      {advice.reasons.length ? (
        <ul className='list-disc space-y-0.5 pl-5'>
          {advice.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 修还是换 on the repair page: the advice given on the quote, the share of
 * the device's book value it asks, and — while the repair is in progress
 * and nothing is decided — 继续维修 or 改为报废.
 */
export function QuoteAdvice({
  repair,
  canDecide,
  onReplace,
}: {
  readonly repair: ItamRecord;
  /** The person may finish this repair: its 负责人 or a supervisor. */
  readonly canDecide: boolean;
  readonly onReplace: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const device = useItamRecord(DEVICES_PATH, text(repair.deviceId));
  const recommendation = text(repair.quoteRecommendation);
  const reasons = text(repair.quoteReasons)
    .split('\n')
    .map((reason) => reason.trim())
    .filter(Boolean);
  const decision = text(repair.quoteDecision);
  const amount = Number(repair.quoteAmount);
  const bookValue = Number(device.data?.bookValue);
  // The rule beside the advice: the share of what the device is still
  // worth, amber from half (2026-10-23). Left out when the reader may not
  // see the book value, or there is none.
  const share =
    device.data?.bookValue !== undefined &&
    device.data?.bookValue !== null &&
    bookValue > 0 &&
    Number.isFinite(amount)
      ? Math.round((amount / bookValue) * 100)
      : undefined;
  const pastReplacement =
    typeof device.data?.plannedReplacementDate === 'string' &&
    device.data.plannedReplacementDate.slice(0, 10) <= todayIso();
  const decide = useMutation({
    mutationFn: async (next: 'repair') =>
      api.request({
        path: `${REPAIRS_PATH}/${text(repair.id)}`,
        method: 'PATCH',
        json: { quoteDecision: next },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itam'] }),
  });
  const open = repair.result === 'inProgress' && !decision;
  return (
    <div className='space-y-1.5 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        {recommendation ? (
          <RecommendationBadge recommendation={recommendation} />
        ) : (
          <span className='text-muted-foreground'>
            {t('repairs.quote.noAdvice')}
          </span>
        )}
        {decision ? (
          <span className='text-muted-foreground'>
            {t(`repairs.quote.decided.${decision}`)}
          </span>
        ) : null}
      </div>
      {share !== undefined || pastReplacement ? (
        <p
          className={
            (share !== undefined && share >= 50) || pastReplacement
              ? 'text-warning-foreground'
              : 'text-muted-foreground'
          }
        >
          {[
            share !== undefined
              ? t('repairs.quote.share', {
                  share,
                  bookValue: formatMoney(
                    bookValue,
                    text(device.data?.currency),
                  ),
                })
              : '',
            pastReplacement ? t('repairs.quote.pastReplacement') : '',
          ]
            .filter(Boolean)
            .join('；')}
        </p>
      ) : null}
      {reasons.length ? (
        <ul className='list-disc space-y-0.5 pl-5'>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {open && canDecide ? (
        <div className='flex flex-wrap gap-2 pt-1'>
          <Button
            variant='outline'
            size='sm'
            disabled={decide.isPending}
            onClick={() => decide.mutate('repair')}
          >
            {t('repairs.quote.keepRepairing')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={decide.isPending}
            onClick={onReplace}
          >
            {t('repairs.quote.replace')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
