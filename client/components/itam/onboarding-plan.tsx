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
import { errorMessage, formatDate, text, todayIso } from '@/lib/itam/format';
import {
  useOnboardingPlan,
  type OnboardingPlanLine,
  type PlanThing,
} from '@/lib/itam/onboarding';
import { STOCK_PATH } from '@/lib/itam/stock';

import { RecordLink } from './record-link.js';
import { ReferenceSelect } from './reference-select.js';

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
  // 更换: a device the person chose instead of the one proposed, by the
  // proposal's id. Every action takes the chosen one.
  const [chosen, setChosen] = useState<Readonly<Record<string, PlanThing>>>({});
  const effective = (thing: PlanThing): PlanThing => chosen[thing.id] ?? thing;
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
        json: {
          seats: [
            {
              holderType: 'person',
              holderId: personId,
              // A subscription seat is held under an account: their e-mail.
              ...(thing.account ? { account: thing.account } : {}),
            },
          ],
        },
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
  /**
   * Runs each proposal in turn; one that is refused does not stop the rest,
   * and is named with the service's reason. The toast counts what went
   * through, not what was asked.
   */
  const run = async (
    things: readonly PlanThing[],
    title: (done: number) => string,
  ) => {
    setBusy(true);
    setError(undefined);
    let done = 0;
    const failed: string[] = [];
    for (const thing of things) {
      try {
        await carryOut(thing);
        done += 1;
      } catch (caught) {
        failed.push(
          `${thing.label} — ${apiErrorBody(caught)?.message ?? errorMessage(caught)}`,
        );
      }
    }
    setBusy(false);
    if (failed.length > 0) setError(failed.join('\n'));
    if (done > 0) await announce(title(done), []);
  };
  /** A seat that needs an account it has none for waits for a person. */
  const runnable = (thing: PlanThing) => !thing.needsAccount || thing.account;
  const proposals = data.lines
    .flatMap((line) => line.proposals)
    .map(effective)
    .filter(runnable);
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
                void run(proposals, (done) =>
                  t('onboarding.done.all', { count: done }),
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
                {/* What is already being bought for them, and where. */}
                {data.orders.map((order) => (
                  <RecordLink
                    key={order.id}
                    to={`/procurement/${order.id}`}
                    className='hover:text-foreground'
                  >
                    {t('onboarding.order', {
                      orderNo: order.orderNo,
                      status: t(`enums.poStatus.${order.status}`, {
                        defaultValue: order.status,
                      }),
                    })}
                  </RecordLink>
                ))}
              </p>
            </div>
            <ul className='divide-y divide-border/60'>
              {data.lines.map((line) => (
                <PlanLine
                  key={`${line.target.type}:${line.target.id}`}
                  line={line}
                  busy={busy}
                  started={started}
                  effective={effective}
                  onChoose={(original, replacement) =>
                    setChosen((current) => ({
                      ...current,
                      [original.id]: replacement,
                    }))
                  }
                  onRun={(thing) => void run([thing], () => titleFor(thing))}
                />
              ))}
            </ul>
          </>
        )}
        {error ? (
          <p className='text-sm whitespace-pre-line text-destructive'>
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PlanLine({
  line,
  busy,
  started,
  effective,
  onChoose,
  onRun,
}: {
  readonly line: OnboardingPlanLine;
  readonly busy: boolean;
  readonly started: boolean;
  /** The proposal as it stands: the one chosen instead, if any. */
  readonly effective: (thing: PlanThing) => PlanThing;
  readonly onChoose: (original: PlanThing, replacement: PlanThing) => void;
  readonly onRun: (thing: PlanThing) => void;
}): ReactElement {
  const { t } = useTranslation();
  // The proposal whose device is being chosen again, if any.
  const [changing, setChanging] = useState<string>();
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
        {line.proposals.map((original) => {
          const thing = effective(original);
          if (changing === original.id)
            return (
              // 更换: any device of this model (or category) that is in
              // stock and held for nobody.
              <span key={`c:${original.id}`} className='w-56'>
                <ReferenceSelect
                  reference={{
                    collection: 'devices',
                    filter: {
                      view: 'available',
                      ...(line.target.type === 'model'
                        ? { modelId: line.target.id }
                        : { categoryId: line.target.id }),
                    },
                  }}
                  value={thing.id}
                  defaultOpen
                  onOpenChange={(open) => {
                    if (!open) setChanging(undefined);
                  }}
                  onChange={(id, record) => {
                    if (id && record)
                      onChoose(original, {
                        type: 'device',
                        id,
                        label: `${text(record.deviceNo)} / ${text(record.name)}`,
                      });
                    setChanging(undefined);
                  }}
                />
              </span>
            );
          return (
            <span
              key={`o:${original.type}:${original.id}`}
              className='inline-flex items-center gap-1'
            >
              <Button
                size='sm'
                variant='outline'
                disabled={busy || (thing.needsAccount && !thing.account)}
                title={
                  thing.needsAccount && !thing.account
                    ? t('onboarding.needsAccount')
                    : undefined
                }
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
              {thing.type === 'device' ? (
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => setChanging(original.id)}
                >
                  {t('onboarding.change')}
                </Button>
              ) : null}
            </span>
          );
        })}
        {line.onOrder > 0 ? (
          <span className='text-xs text-muted-foreground'>
            {t('onboarding.onOrder', { count: line.onOrder })}
          </span>
        ) : null}
        {line.shortfall > 0 ? (
          <span className='text-xs text-destructive'>
            {t('onboarding.shortfall', { count: line.shortfall })}
          </span>
        ) : null}
      </span>
    </li>
  );
}
