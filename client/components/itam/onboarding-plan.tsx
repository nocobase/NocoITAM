import { useTranslation } from '@nocobase/i18n/client';
import { AppWindow, Check, Package, PackageCheck } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAiPageContext } from '@/lib/itam/ai-context';
import { useAnnounce } from '@/lib/itam/announce';
import { apiErrorBody, useApi } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import { errorMessage, formatDate, todayIso } from '@/lib/itam/format';
import {
  useOnboardingPlan,
  type OnboardingPlanLine,
  type PlanThing,
} from '@/lib/itam/onboarding';
import { STOCK_PATH } from '@/lib/itam/stock';

import { RecordLink } from './record-link.js';

/**
 * 入职配备 on a joiner's 归属 tab (2026-10-05): their kit, what they already
 * have of it, and — for the rest — the very device, stock item or seat the
 * register would give them, each one button away. The plan is computed on the
 * server (`onboarding.ts`), so this lists rather than chooses; every button
 * is the existing operation (reserve or assign, issue, assign a seat) under
 * the reader's own grants, and 全部执行 runs them in order. A device is
 * reserved until the joining date while they have not started, and
 * assigned once they have. What stock cannot cover is the shortfall.
 */
export function OnboardingPlanCard({
  personId,
  personName,
}: {
  readonly personId: string;
  readonly personName: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const announce = useAnnounce();
  const plan = useOnboardingPlan(personId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const data = plan.data;
  // The plan goes along as page context, so Noco presents and carries out
  // this very plan (the onboarding skill) — and drafts the purchase order
  // for the shortfall, which needs a vendor the card does not ask for.
  const {
    ref: contextRef,
    available: aiAvailable,
    ask,
  } = useAiPageContext({
    id: 'itam-onboarding',
    title: t('onboarding.title'),
    kind: 'onboarding',
    getContext: () => ({ personId, name: personName, plan: data }),
  });
  if (!data) return null;
  const started = !data.hireDate || data.hireDate <= todayIso();

  /** Carries out one proposal through its own operation. */
  const carryOut = async (thing: PlanThing) => {
    if (thing.type === 'device')
      await api.request(
        started
          ? {
              path: `${DEVICES_PATH}/${thing.id}/assign`,
              method: 'POST',
              json: { targetType: 'person', targetId: personId },
            }
          : {
              path: `${DEVICES_PATH}/${thing.id}/reserve`,
              method: 'POST',
              json: {
                reservedForType: 'person',
                reservedForId: personId,
                reservedUntil: data.hireDate,
              },
            },
      );
    else if (thing.type === 'stock')
      await api.request({
        path: `${STOCK_PATH}/${thing.id}/issue`,
        method: 'POST',
        json: {
          holderType: 'person',
          holderId: personId,
          quantity: thing.quantity ?? 1,
        },
      });
    else
      await api.request({
        path: `${ENTITLEMENTS_PATH}/${thing.id}/assign-seats`,
        method: 'POST',
        json: { seats: [{ holderType: 'person', holderId: personId }] },
      });
  };
  const titleFor = (thing: PlanThing) =>
    thing.type === 'device'
      ? t(started ? 'onboarding.done.assigned' : 'onboarding.done.reserved', {
          label: thing.label,
        })
      : thing.type === 'stock'
        ? t('onboarding.done.issued', {
            label: thing.label,
            count: thing.quantity ?? 1,
          })
        : t('onboarding.done.seat', { label: thing.label });
  const run = async (things: readonly PlanThing[], title: string) => {
    setBusy(true);
    setError(undefined);
    let done = 0;
    try {
      for (const thing of things) {
        await carryOut(thing);
        done += 1;
      }
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setBusy(false);
      if (done > 0) await announce(title, []);
    }
  };
  const proposals = data.lines.flatMap((line) => line.proposals);
  const shortfall = data.lines.reduce((sum, line) => sum + line.shortfall, 0);
  const ratio = data.required > 0 ? data.prepared / data.required : 0;

  return (
    <Card className='py-0'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-2'>
          <div className='flex min-w-0 items-center gap-2'>
            <PackageCheck
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
            />
            <h2 className='font-heading text-sm font-semibold'>
              {t('onboarding.title')}
            </h2>
            {data.kit ? (
              <RecordLink
                to={`/onboarding-kits/${data.kit.id}`}
                className='truncate text-sm text-muted-foreground hover:text-foreground'
              >
                {data.kit.name}
              </RecordLink>
            ) : null}
            {data.hireDate ? (
              <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                {t('onboarding.joins', { date: formatDate(data.hireDate) })}
              </span>
            ) : null}
          </div>
          <span ref={contextRef} hidden />
          {aiAvailable && data.kit ? (
            <AiShortcut
              onClick={() =>
                ask(t('ai.prompts.onboarding', { name: personName }))
              }
            >
              {t('onboarding.askAi')}
            </AiShortcut>
          ) : null}
          {proposals.length > 0 ? (
            <Button
              size='sm'
              disabled={busy}
              onClick={() =>
                void run(
                  proposals,
                  t('onboarding.done.all', { count: proposals.length }),
                )
              }
            >
              {t('onboarding.runAll', { count: proposals.length })}
            </Button>
          ) : null}
        </div>

        {!data.kit ? (
          <p className='text-sm text-muted-foreground'>
            {t('onboarding.noKit')}
          </p>
        ) : (
          <>
            <div>
              <div
                aria-hidden='true'
                className='h-1.5 overflow-hidden rounded-full bg-muted'
              >
                <div
                  className='h-full rounded-full bg-primary'
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <p className='mt-1.5 flex items-center gap-2 text-xs text-muted-foreground tabular-nums'>
                <span>
                  {t('onboarding.progress', {
                    done: data.prepared,
                    total: data.required,
                  })}
                </span>
                {shortfall > 0 ? (
                  <span className='text-destructive'>
                    {t('onboarding.shortfallTotal', { count: shortfall })}
                  </span>
                ) : null}
              </p>
            </div>
            <ul className='divide-y divide-border/60'>
              {data.lines.map((line) => (
                <PlanLine
                  key={`${line.target.type}:${line.target.id}`}
                  line={line}
                  busy={busy}
                  started={started}
                  onRun={(thing) => void run([thing], titleFor(thing))}
                />
              ))}
            </ul>
          </>
        )}
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function PlanLine({
  line,
  busy,
  started,
  onRun,
}: {
  readonly line: OnboardingPlanLine;
  readonly busy: boolean;
  readonly started: boolean;
  readonly onRun: (thing: PlanThing) => void;
}): ReactElement {
  const { t } = useTranslation();
  const Icon = line.kind === 'entitlement' ? AppWindow : Package;
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm'>
      <span className='flex min-w-0 flex-1 items-center gap-2'>
        <Icon
          aria-hidden='true'
          className='size-4 shrink-0 text-muted-foreground'
        />
        <span className='truncate'>{line.target.name}</span>
        {line.target.type === 'category' ? (
          <span className='shrink-0 text-xs text-muted-foreground'>
            {t('onboardingKits.anyModel')}
          </span>
        ) : null}
        <span className='shrink-0 text-muted-foreground tabular-nums'>
          ×{line.required}
        </span>
      </span>
      <span className='flex flex-wrap items-center justify-end gap-1.5'>
        {line.prepared.map((thing) => (
          <Badge key={`p:${thing.type}:${thing.id}`} variant='secondary'>
            <Check className='size-3' />
            {thing.type === 'device'
              ? `${thing.label} · ${t(`onboarding.state.${thing.state ?? 'assigned'}`)}`
              : thing.label}
          </Badge>
        ))}
        {line.proposals.map((thing) => (
          <Button
            key={`o:${thing.type}:${thing.id}`}
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => onRun(thing)}
          >
            {thing.type === 'device'
              ? t(started ? 'onboarding.assign' : 'onboarding.reserve', {
                  label: thing.label,
                })
              : thing.type === 'stock'
                ? t('onboarding.issue', {
                    label: thing.label,
                    count: thing.quantity ?? 1,
                  })
                : t('onboarding.seat', { label: thing.label })}
          </Button>
        ))}
        {line.shortfall > 0 ? (
          <span className='text-xs text-destructive'>
            {t('onboarding.shortfall', { count: line.shortfall })}
          </span>
        ) : null}
      </span>
    </li>
  );
}
