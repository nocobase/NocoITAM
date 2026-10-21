import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import { errorMessage, text } from '@/lib/itam/format';
import {
  DATA_WIPE_OPTIONS,
  DISPOSAL_METHODS,
  DISPOSAL_REASONS,
} from '@/lib/itam/operations';

const ADVICE = ['dispose', 'reconsider'] as const;
type Advice = (typeof ADVICE)[number];

interface Diagnosis {
  readonly advice: Advice;
  readonly concerns: readonly { deviceNo: string; note: string }[];
  readonly said: string;
}

/** What the diagnosis fills, each only when one of its values. */
export interface DisposalReading {
  readonly reason?: string;
  readonly method?: string;
  readonly dataWipe?: string;
}

const oneOf = (values: readonly string[], value: unknown) =>
  values.find((entry) => entry === value);

/**
 * 报废诊断 (2026-10-20), under a new disposal's description as 诊断 is
 * under a repair's fault: Asset Steward reads the description with each
 * device as the register has it (`POST /itam/ai/read`, task
 * `disposalTriage`), fills the reason, method and data wipe — marked
 * 请核对 by the form — and says whether to go ahead or think again, naming
 * the devices that should not be disposed of yet: still under warranty,
 * much book value left, leased, still held. Nothing is saved until the
 * person saves; the approval review weighs the request again for the
 * approver.
 */
export function DisposalTriage({
  deviceIds,
  description,
  onReading,
}: {
  readonly deviceIds: readonly string[];
  readonly description: string;
  readonly onReading: (reading: DisposalReading) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const read = useAiReading();
  const [busy, setBusy] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  if (!ai.available) return null;
  const ready = deviceIds.length > 0 && Boolean(description.trim());
  const ask = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const answer = await read({
        task: 'disposalTriage',
        material: description,
        context: { deviceIds },
      });
      const reading = answer.reading;
      const advice = ADVICE.find((value) => value === reading?.advice);
      if (!reading || !advice) {
        setFailure(answer.said || t('disposals.triage.nothing'));
        return;
      }
      onReading({
        reason: oneOf(DISPOSAL_REASONS, reading.reason),
        method: oneOf(DISPOSAL_METHODS, reading.method),
        dataWipe: oneOf(DATA_WIPE_OPTIONS, reading.dataWipe),
      });
      setDiagnosis({
        advice,
        concerns: (Array.isArray(reading.concerns) ? reading.concerns : [])
          .map((entry) => ({
            deviceNo: text((entry as { deviceNo?: unknown }).deviceNo),
            note: text((entry as { note?: unknown }).note),
          }))
          .filter((entry) => entry.note)
          .slice(0, 5),
        said: answer.said,
      });
    } catch (caught) {
      setFailure(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='space-y-1.5 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <AiShortcut disabled={!ready || busy} onClick={() => void ask()}>
          {t(diagnosis ? 'disposals.triage.again' : 'disposals.triage.ask')}
        </AiShortcut>
        {busy ? (
          <span
            role='status'
            className='flex items-center gap-2 text-muted-foreground'
          >
            <Spinner />
            {t('disposals.triage.working')}
          </span>
        ) : null}
      </div>
      {/* On a line of its own under the button, with room under it
          before the fields (2026-10-20). */}
      {!diagnosis && !busy ? (
        <p className='pb-2 text-xs text-muted-foreground'>
          {t('disposals.triage.hint')}
        </p>
      ) : null}
      {failure ? <p className='text-destructive'>{failure}</p> : null}
      {diagnosis && !busy ? (
        <div className='space-y-2 rounded-md bg-muted/50 px-3 py-2'>
          {/* A filled tag, as a status is: amber to think again, the calm
              blue to go ahead. */}
          <Badge
            variant='secondary'
            className={
              diagnosis.advice === 'reconsider'
                ? 'bg-warning text-warning-foreground'
                : 'bg-info text-info-foreground'
            }
          >
            {t(`disposals.triage.advice.${diagnosis.advice}`)}
          </Badge>
          {diagnosis.concerns.length ? (
            <ul className='list-disc space-y-0.5 pl-5'>
              {diagnosis.concerns.map((concern) => (
                <li key={`${concern.deviceNo}:${concern.note}`}>
                  {concern.deviceNo
                    ? t('disposals.triage.concern', concern)
                    : concern.note}
                </li>
              ))}
            </ul>
          ) : null}
          {diagnosis.said ? (
            <p className='text-muted-foreground'>{diagnosis.said}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
