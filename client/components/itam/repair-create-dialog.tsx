import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import {
  initialFormValues,
  RecordFormDialog,
} from '@/components/itam/record-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import {
  useItamList,
  useItamMutations,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import {
  errorMessage,
  formatDate,
  formatMoney,
  text,
  todayIso,
} from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';
import {
  REPAIR_CREATE_FIELDS,
  REPAIR_FAULT_CATEGORIES,
  REPAIR_FIELDS,
  REPAIR_METHODS,
  REPAIRS_PATH,
} from '@/lib/itam/operations';

const fieldsOf = (keys: readonly string[]) =>
  keys.map((key) => REPAIR_FIELDS.find((field) => field.key === key)!);

const RECOMMENDATIONS = ['repair', 'replace', 'inspect'] as const;
type Recommendation = (typeof RECOMMENDATIONS)[number];

interface Triage {
  readonly recommendation: Recommendation;
  readonly reasons: readonly string[];
  readonly said: string;
}

/**
 * A new repair: the sending side only (method, vendor, fault, its kind,
 * dates); cost and notes come with completion. From a device's page the
 * device is fixed; from the repairs list it is the first field.
 *
 * 维修单整理 (2026-10-17). What a rule can say is said without a model:
 * above the fields, the device's warranty, age, book value and how often it
 * was repaired, and a device still under warranty starts as a warranty
 * repair to its own vendor. What takes judgement is asked of Asset Steward
 * (`POST /itam/ai/read`, task `repairTriage`, the device read on the server
 * as the person): the kind of fault, filled and marked 请核对, and whether to
 * repair it, replace it or look first, with its reasons, under the fault
 * the form starts with (2026-10-20); told to replace, the caller may turn
 * it into a disposal instead. The person decides; nothing is saved until
 * they save.
 */
export function RepairCreateDialog({
  deviceId,
  open,
  onOpenChange,
  onCreated,
  onReplace,
}: {
  /** The device, when the dialog is opened from its page. */
  readonly deviceId?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (record: ItamRecord) => void;
  /**
   * When Asset Steward advises replacing rather than repairing (2026-10-20):
   * the caller opens a disposal for the device instead, with the fault.
   */
  readonly onReplace?: (input: {
    readonly deviceId: string;
    readonly description: string;
  }) => void;
}): ReactElement {
  const mutations = useItamMutations<ItamRecord>(REPAIRS_PATH);
  return (
    <RepairForm
      key={open ? 'create' : 'closed'}
      deviceId={deviceId}
      open={open}
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onReplace={onReplace}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutations.create.reset();
      }}
      onSubmit={async (values) => {
        const created = await mutations.create.mutateAsync(values);
        onOpenChange(false);
        onCreated?.(created);
      }}
    />
  );
}

function RepairForm({
  deviceId,
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit,
  onReplace,
}: {
  readonly deviceId?: string;
  readonly open: boolean;
  readonly submitting: boolean;
  readonly error: unknown;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: Record<string, unknown>) => Promise<void>;
  readonly onReplace?: (input: {
    readonly deviceId: string;
    readonly description: string;
  }) => void;
}): ReactElement {
  const { t } = useTranslation();
  const currentUserId = useCurrentUserId();
  // The device leads the form either way (2026-10-20); opened from its
  // page it is shown, fixed, rather than left out.
  const fields = fieldsOf(['deviceId', ...REPAIR_CREATE_FIELDS]).map((field) =>
    field.key === 'deviceId'
      ? {
          ...field,
          // As wide as the fault under it.
          wide: true,
          ...(deviceId
            ? {
                readonlyWhen: () => true,
                readonlyHint: 'repairs.deviceFixed',
              }
            : {}),
        }
      : field,
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialFormValues(fields, {
      ...(deviceId ? { deviceId } : {}),
      sentAt: todayIso(),
      // Whoever files it follows it through until they name someone else.
      ...(currentUserId ? { ownerId: currentUserId } : {}),
    }),
  );
  const chosen = deviceId ?? (text(values.deviceId) || undefined);
  const device = useItamRecord(DEVICES_PATH, chosen);
  // A device still under warranty goes back under it, to its own vendor:
  // the method starts there once the device is known, unless already set.
  const [startedFor, setStartedFor] = useState<string | null>(null);
  if (device.data && chosen && startedFor !== chosen) {
    setStartedFor(chosen);
    if (!values.method && underWarranty(device.data))
      setValues((before) => ({
        ...before,
        method: 'vendorWarranty',
        vendorId: before.vendorId ?? device.data?.vendorId ?? null,
      }));
  }
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <RecordFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('repairs.new')}
      fields={fields}
      values={values}
      onValuesChange={(next, key) => {
        setValues(next);
        // A field the person sets is theirs, no longer Asset Steward's to check.
        if (marks.has(key))
          setMarks((before) => new Set([...before].filter((k) => k !== key)));
      }}
      marks={marks}
      prelude={
        chosen && device.data ? (
          <DeviceFacts device={device.data} deviceId={chosen} />
        ) : undefined
      }
      // 诊断 right under the fault it reads (2026-10-20), where the form
      // starts, rather than in a column beside it.
      autoFocusField={chosen ? 'faultDescription' : undefined}
      fieldFooters={{
        faultDescription: (
          <TriagePanel
            deviceId={chosen}
            fault={text(values.faultDescription)}
            onReading={({ category, method }) => {
              // The kind always; the method only while nobody — the
              // warranty rule or the person — has chosen one (2026-10-20),
              // with the vendor following it as it does by hand.
              const fillMethod = Boolean(method) && !values.method;
              setValues((before) => ({
                ...before,
                ...(category ? { faultCategory: category } : {}),
                ...(fillMethod
                  ? {
                      method,
                      vendorId:
                        method === 'internal'
                          ? null
                          : (before.vendorId ?? device.data?.vendorId ?? null),
                    }
                  : {}),
              }));
              setMarks(
                (before) =>
                  new Set([
                    ...before,
                    ...(category ? ['faultCategory'] : []),
                    ...(fillMethod ? ['method'] : []),
                  ]),
              );
            }}
            onReplace={
              onReplace && chosen
                ? () =>
                    onReplace({
                      deviceId: chosen,
                      description: text(values.faultDescription),
                    })
                : undefined
            }
          />
        ),
      }}
      // The vendor follows the method: the device's own vendor once a
      // warranty or send-out repair is chosen, none for an internal one.
      derive={({ key, value }, current) =>
        key === 'method'
          ? {
              vendorId:
                value === 'internal'
                  ? null
                  : (current.vendorId ?? device.data?.vendorId ?? null),
            }
          : undefined
      }
      submitting={submitting}
      error={error}
      onSubmit={async (submitted) => {
        await onSubmit(deviceId ? { ...submitted, deviceId } : submitted);
      }}
    />
  );
}

const underWarranty = (device: ItamRecord): boolean => {
  const end = text(device.warrantyEndDate).slice(0, 10);
  return Boolean(end) && end >= todayIso();
};

/** Whole months from a YYYY-MM-DD date to today. */
function monthsSince(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const now = new Date();
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (now.getDate() < d) months -= 1;
  return Math.max(0, months);
}

/**
 * The facts a repair is weighed on, as the register has them — no model:
 * the warranty and whether it still holds, the device's age, its book value
 * and how many times it was repaired.
 */
function DeviceFacts({
  device,
  deviceId,
}: {
  readonly device: ItamRecord;
  readonly deviceId: string;
}): ReactElement {
  const { t } = useTranslation();
  const repairs = useItamList(REPAIRS_PATH, {
    filter: { deviceId },
    pageSize: 1,
  });
  const end = text(device.warrantyEndDate).slice(0, 10);
  const months = monthsSince(text(device.purchaseDate));
  const facts = [
    end
      ? t(
          underWarranty(device)
            ? 'repairs.facts.warranty'
            : 'repairs.facts.warrantyEnded',
          { date: formatDate(end) },
        )
      : t('repairs.facts.noWarranty'),
    months === null
      ? null
      : months >= 12
        ? t('repairs.facts.ageYears', {
            years: Math.floor(months / 12),
            months: months % 12,
          })
        : t('repairs.facts.ageMonths', { count: months }),
    device.bookValue === undefined || device.bookValue === null
      ? null
      : t('repairs.facts.bookValue', {
          value: formatMoney(device.bookValue, text(device.currency) || null),
        }),
    repairs.data
      ? t('repairs.facts.repairs', { count: repairs.data.total })
      : null,
  ].filter(Boolean);
  return (
    <p className='rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground'>
      {facts.join(' · ')}
    </p>
  );
}

/** Under the fault: asking Asset Steward, and what it recommends. */
function TriagePanel({
  deviceId,
  fault,
  onReading,
  onReplace,
}: {
  readonly deviceId: string | undefined;
  readonly fault: string;
  /** What the reading fills: the kind of fault and how to repair it. */
  readonly onReading: (reading: {
    readonly category?: string;
    readonly method?: string;
  }) => void;
  /** Turns the request into a disposal, when Asset Steward says replace. */
  readonly onReplace?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const read = useAiReading();
  const [busy, setBusy] = useState(false);
  const [triage, setTriage] = useState<Triage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  if (!ai.available) return null;
  const ready = Boolean(deviceId && fault.trim());
  const ask = async () => {
    if (!deviceId) return;
    setBusy(true);
    setFailure(null);
    try {
      const answer = await read({
        task: 'repairTriage',
        material: fault,
        context: { deviceId },
      });
      const reading = answer.reading;
      const recommendation = RECOMMENDATIONS.find(
        (value) => value === reading?.recommendation,
      );
      if (!reading || !recommendation) {
        setFailure(answer.said || t('repairs.triage.nothing'));
        return;
      }
      const category = REPAIR_FAULT_CATEGORIES.find(
        (value) => value === reading.faultCategory,
      );
      const method = REPAIR_METHODS.find((value) => value === reading.method);
      onReading({ category, method });
      setTriage({
        recommendation,
        reasons: (Array.isArray(reading.reasons) ? reading.reasons : [])
          .map((reason) => text(reason))
          .filter(Boolean)
          .slice(0, 3),
        said: answer.said,
      });
    } catch (caught) {
      setFailure(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='space-y-2 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <AiShortcut disabled={!ready || busy} onClick={() => void ask()}>
          {/* 诊断 (2026-10-20; it was 看看), and once answered, again — for
              a description changed since. */}
          {t(triage ? 'repairs.triage.again' : 'repairs.triage.ask')}
        </AiShortcut>
        {/* Until it has answered, it says what it does: how to start it,
            then — the fault written — to run it first (2026-10-20). */}
        {!triage && !busy ? (
          <span className='text-xs text-muted-foreground'>
            {t(ready ? 'repairs.triage.nudge' : 'repairs.triage.hint')}
          </span>
        ) : null}
        {busy ? (
          <span
            role='status'
            className='flex items-center gap-2 text-muted-foreground'
          >
            <Spinner />
            {t('repairs.triage.working')}
          </span>
        ) : null}
      </div>
      {failure ? <p className='text-destructive'>{failure}</p> : null}
      {triage && !busy ? (
        <div className='space-y-2 rounded-md bg-muted/50 px-3 py-2'>
          <div className='flex flex-wrap items-center gap-2'>
            {/* A filled tag, as a status is: amber for replace, the calm
                blue for repair or look first. */}
            <Badge
              variant='secondary'
              className={
                triage.recommendation === 'replace'
                  ? 'bg-warning text-warning-foreground'
                  : 'bg-info text-info-foreground'
              }
            >
              {t(`repairs.triage.recommendation.${triage.recommendation}`)}
            </Badge>
            {triage.recommendation === 'replace' && onReplace ? (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto px-0'
                onClick={onReplace}
              >
                {t('repairs.triage.toDisposal')}
              </Button>
            ) : null}
          </div>
          {triage.reasons.length ? (
            <ul className='list-disc space-y-0.5 pl-5'>
              {triage.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {triage.said ? (
            <p className='text-muted-foreground'>{triage.said}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
