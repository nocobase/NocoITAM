import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { DocumentReading } from '@/components/itam/ai/document-reading';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { LongTextPreview } from '@/components/itam/long-text-field';
import { ReviewMark } from '@/components/itam/review-mark';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { errorMessage, formatMoney, text, todayIso } from '@/lib/itam/format';
import { REPAIRS_PATH, REPAIR_RECOMMENDATIONS } from '@/lib/itam/operations';

type Recommendation = (typeof REPAIR_RECOMMENDATIONS)[number];

interface Advice {
  readonly recommendation: Recommendation;
  readonly reasons: readonly string[];
  /** The amount and currency it was given for. */
  readonly for: string;
}

/** What advice was given for: any change to these asks for it again. */
const adviceKey = (amount: unknown, currency: unknown, work: string) =>
  `${String(amount)} ${String(currency)} ${work.trim()}`;

/**
 * 单据上的设备不是这台 (2026-10-23): a repair report or quote that names
 * another device, by its serial or its make and model — most likely a
 * document meant for another repair. Null when it is this device, or when
 * the document does not say.
 */
export function DeviceMismatch({
  reading,
}: {
  readonly reading: Record<string, unknown>;
}): ReactElement | null {
  const { t } = useTranslation();
  if (reading.deviceMatches !== false) return null;
  return (
    <Alert className='border-warning-foreground/25 bg-warning text-warning-foreground'>
      <TriangleAlert />
      <AlertTitle>{t('repairs.report.otherDevice')}</AlertTitle>
      <AlertDescription className='text-warning-foreground'>
        {t('repairs.report.otherDeviceDetail', {
          printed: text(reading.otherDevice) || '—',
          device: text(reading.deviceLabel) || '—',
        })}
      </AlertDescription>
    </Alert>
  );
}

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
      {/* The sparkle says the advice is AI's (2026-10-23). Its own words
          on a quote: 先核对报价 where the triage says 先检测. */}
      <Sparkles data-icon='inline-start' />
      {t(`enums.repairRecommendation.${recommendation}`)}
    </Badge>
  );
}

/**
 * 记录报价 (2026-10-23): the vendor's quote while the device is away, by
 * AI 整理 or 表单录入. AI 整理 reads the pasted or uploaded quote
 * (`repairQuote`) and weighs it against the device — its book value, age,
 * replacement date and repairs — in the same call, then shows the form it
 * filled; a typed quote is weighed with 评估修还是换. The repair keeps the
 * advice given for the quote as saved, and why; a new quote clears what
 * was decided on the last one.
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
  const [judgeFailure, setJudgeFailure] = useState<string>();
  const key = adviceKey(amount.amount, amount.currency, work);
  // The advice shown is the one for the quote as it stands now.
  const current = advice?.for === key ? advice : undefined;
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
    const nextWork =
      typeof reading.work === 'string' && reading.work.trim()
        ? reading.work.trim()
        : work;
    setAdvice(
      adviceFrom(reading, adviceKey(next.amount, next.currency, nextWork)),
    );
    setJudgeFailure(undefined);
    return <DeviceMismatch reading={reading} />;
  };

  // 评估修还是换: the quote as typed, weighed against the device.
  const judge = async (): Promise<Advice | undefined> => {
    const value = amount.amount;
    if (typeof value !== 'number') return undefined;
    setJudging(true);
    setJudgeFailure(undefined);
    try {
      const answer = await read({
        task: 'repairQuote',
        material: t('repairs.quote.typed', {
          amount: formatMoney(value, text(amount.currency)),
          work: work.trim() || '—',
        }),
        context: { repairId: id },
      });
      const given = answer.reading
        ? adviceFrom(answer.reading, key)
        : undefined;
      setAdvice(given);
      if (!given) setJudgeFailure(answer.said || t('repairs.quote.noAdvice'));
      return given;
    } catch (caught) {
      setJudgeFailure(errorMessage(caught));
      return undefined;
    } finally {
      setJudging(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const value = amount.amount;
      if (typeof value !== 'number') return;
      // Saved with the advice given for it as it stands, if any: a typed
      // quote is weighed only when asked.
      const given = current;
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
      confirmLabel={t('actions.save')}
      onConfirm={() => save.mutate()}
    >
      {/* As 完成维修 (2026-10-23): the document's box above the form it
          fills; reading it weighs the quote too, and a typed one is
          weighed with 评估修还是换 under the fields. */}
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
      {ai.available ? (
        <div className='space-y-1.5 text-sm'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <AiShortcut
              disabled={typeof amount.amount !== 'number' || judging}
              onClick={() => void judge()}
            >
              {t(current ? 'repairs.quote.judgeAgain' : 'repairs.quote.judge')}
            </AiShortcut>
            {judging ? (
              <span
                role='status'
                className='flex items-center gap-2 text-muted-foreground'
              >
                <Spinner />
                {t('repairs.quote.judging')}
              </span>
            ) : null}
          </div>
          {judgeFailure && !judging ? (
            <p className='text-muted-foreground'>{judgeFailure}</p>
          ) : null}
          {current && !judging ? (
            <div className='rounded-md bg-muted/50 px-3 py-2'>
              <AdviceBody advice={current} />
            </div>
          ) : null}
        </div>
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
      {/* The rule stands in for the reasons when there are none: the
          advice's reasons already give the share and the dates. */}
      {!reasons.length && (share !== undefined || pastReplacement) ? (
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
      {/* Folded as every long field is (2026-10-23): three lines that
          fade, the whole on a click. */}
      {reasons.length ? (
        <LongTextPreview
          label={t('fields.quoteRecommendation')}
          text={reasons.map((reason) => `• ${reason}`).join('\n')}
        />
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
