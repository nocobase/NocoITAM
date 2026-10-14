import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Package,
  PackageCheck,
  Sparkles,
  Truck,
  Undo2,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAiPageContext } from '@/lib/itam/ai-chat';
import { useAnnounce } from '@/lib/itam/announce';
import { apiErrorBody, masterDataPath, useApi } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import {
  addDays,
  errorMessage,
  formatDate,
  text,
  todayIso,
} from '@/lib/itam/format';
import {
  isPrepared,
  useOnboardingPlan,
  type OnboardingPlan,
  type OnboardingPlanLine,
  type PlanThing,
} from '@/lib/itam/onboarding';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { STOCK_PATH } from '@/lib/itam/stock';

import { CollapsibleText } from './collapsible-text.js';
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
 *
 * Which device of several is Noco's to suggest (2026-10-06): it chooses in
 * the background as the joiner's 入职负责人 (`onboarding-advisor.ts`), its
 * picks come first with the reason beneath, and the strip under the heading
 * says how that run went. The buttons stay the person's.
 */
export function OnboardingPlanCard({
  personId,
  personName,
  ownerId,
}: {
  readonly personId: string;
  readonly personName: string;
  /** The joiner's 入职负责人, who alone may ask Noco again. */
  readonly ownerId?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const announce = useAnnounce();
  const plan = useOnboardingPlan(personId);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // 更换: a device the person chose instead of the one proposed, by the
  // proposal's id. Every action takes the chosen one.
  const [chosen, setChosen] = useState<Readonly<Record<string, PlanThing>>>({});
  const effective = (thing: PlanThing): PlanThing => chosen[thing.id] ?? thing;
  const data = plan.data;
  // The person goes along as page context, so Noco reads this very plan
  // (`itam onboarding plan`) and proposes it as a plan of its own (the
  // onboarding skill) — with the purchase order for the shortfall, which
  // needs a vendor the card does not ask for.
  const { available: aiAvailable, ask } = useAiPageContext({
    kind: 'people',
    id: personId,
    label: personName,
  });
  if (!data) return null;
  // Equipped and a month in: onboarding is over, and the 归属 tab below
  // says what they hold.
  if (
    isPrepared(data) &&
    data.hireDate &&
    data.hireDate < addDays(todayIso(), -30)
  )
    return null;
  const started = !data.hireDate || data.hireDate <= todayIso();

  /** Marks an item 不需要 for this person, or takes the mark back. */
  const waive = async (key: string, waived: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `${masterDataPath('people')}/${personId}/onboarding/waive`,
        method: 'POST',
        json: { key, waived },
      });
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

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
                to={`/departments/${data.kit.departmentId}/onboarding`}
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

        {data.kit ? (
          <AdviceStrip
            personId={personId}
            plan={data}
            ownerId={ownerId}
            aiAvailable={aiAvailable}
          />
        ) : null}

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
                {data.waived > 0 ? (
                  <span>
                    {t('onboarding.waivedTotal', { count: data.waived })}
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
                  onWaive={(waived) => void waive(line.key, waived)}
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
  onWaive,
}: {
  readonly line: OnboardingPlanLine;
  readonly busy: boolean;
  readonly started: boolean;
  /** The proposal as it stands: the one chosen instead, if any. */
  readonly effective: (thing: PlanThing) => PlanThing;
  readonly onChoose: (original: PlanThing, replacement: PlanThing) => void;
  readonly onRun: (thing: PlanThing) => void;
  /** Marks the item 不需要 for this person, or takes the mark back. */
  readonly onWaive: (waived: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  // The proposal whose device is being chosen again, if any.
  const [changing, setChanging] = useState<string>();
  // The item's asset type leads its row, as on the kit it comes from:
  // software is 授权 whatever kind of entitlement, the rest follow their
  // category (设备, 配件, 耗材, 组件).
  const kind =
    line.kind === 'entitlement' ? 'entitlement' : (line.itemType ?? undefined);
  const tag = kind ? (
    <AssetTypeBadge value={kind} className='shrink-0' />
  ) : (
    <Package
      aria-hidden='true'
      className='size-4 shrink-0 text-muted-foreground'
    />
  );
  // Noco's reasons, for the picks still standing: one replaced by 更换 is
  // the person's choice now, and its reason no longer applies.
  const reasons = line.proposals.filter(
    (thing) => thing.reason && effective(thing) === thing,
  );
  // Marked 不需要: the item stays in the list, dimmed, so the mark can be
  // seen and taken back, with nothing offered for it.
  if (line.waived)
    return (
      <li className='flex items-center gap-3 py-2 text-sm text-muted-foreground'>
        <span className='flex min-w-0 flex-1 items-center gap-2'>
          {tag}
          <span className='truncate line-through'>{line.target.name}</span>
          <span className='shrink-0 tabular-nums'>×{line.required}</span>
        </span>
        <Badge variant='secondary'>{t('onboarding.waived')}</Badge>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy}
          onClick={() => onWaive(false)}
        >
          {t('onboarding.restore')}
        </Button>
      </li>
    );
  return (
    <li className='py-2 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
        <span className='flex min-w-0 flex-1 items-center gap-2'>
          {tag}
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
          <LineOutlook line={line} />
          {/* Something they will not be given — their own monitor, another
              laptop — is marked rather than left outstanding for ever. */}
          {line.preparedCount < line.required ? (
            <Button
              size='sm'
              variant='ghost'
              className='text-muted-foreground'
              disabled={busy}
              onClick={() => onWaive(true)}
            >
              {t('onboarding.waive')}
            </Button>
          ) : null}
        </span>
      </div>
      {reasons.length > 0 ? (
        <ul className='mt-1 space-y-0.5 pl-6'>
          {reasons.map((thing) => (
            <li
              key={`r:${thing.id}`}
              className='flex gap-1.5 text-xs text-muted-foreground'
            >
              <Sparkles
                aria-hidden='true'
                className='mt-0.5 size-3 shrink-0 text-primary'
              />
              <span className='min-w-0'>
                {reasons.length > 1 ? `${thing.label}：` : null}
                <CollapsibleText text={thing.reason ?? ''} lines={2} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * What a line expects rather than has in stock (2026-10-06): an open order
 * or somebody leaving, each with the day it can be handed over — nothing to
 * press, since it is not here yet — and what is still short, with the last
 * day to order it. Shared by the card and 入职供需.
 */
export function LineOutlook({
  line,
}: {
  readonly line: OnboardingPlanLine;
}): ReactElement {
  const { t } = useTranslation();
  const today = todayIso();
  return (
    <>
      {line.planned.map((thing) => {
        const supply = thing.supply;
        if (!supply) return null;
        const key = `l:${supply.kind}:${thing.id}`;
        if (supply.kind === 'return')
          return (
            <Badge key={key} variant='outline'>
              <Undo2 className='size-3' />
              {t('onboarding.planned.return', {
                name: supply.fromName ?? '',
                label: thing.label,
                date: formatDate(supply.availableOn),
              })}
            </Badge>
          );
        const count = thing.quantity ?? 1;
        return (
          <RecordLink key={key} to={`/procurement/${supply.orderId ?? ''}`}>
            <Badge variant='outline'>
              <Truck className='size-3' />
              {supply.availableOn
                ? t('onboarding.planned.order', {
                    orderNo: supply.orderNo ?? '',
                    date: formatDate(supply.availableOn),
                    count,
                  })
                : t('onboarding.planned.orderOpen', {
                    orderNo: supply.orderNo ?? '',
                    status: t(`enums.poStatus.${supply.orderStatus ?? ''}`, {
                      defaultValue: supply.orderStatus ?? '',
                    }),
                    count,
                  })}
            </Badge>
          </RecordLink>
        );
      })}
      {line.shortfall > 0 ? (
        <span className='text-xs text-destructive'>
          {t('onboarding.shortfall', { count: line.shortfall })}
          {line.orderBy
            ? ` · ${
                line.orderBy < today
                  ? t('onboarding.orderNow')
                  : t('onboarding.orderBy', { date: formatDate(line.orderBy) })
              }`
            : null}
        </span>
      ) : null}
    </>
  );
}

/**
 * How Noco's background choice stands: choosing, chosen (with its summary
 * and the conversation it ran in, which is the 入职负责人's), or failed.
 * The 入职负责人 may ask again, since the run is made as them.
 */
function AdviceStrip({
  personId,
  plan,
  ownerId,
  aiAvailable,
}: {
  readonly personId: string;
  readonly plan: OnboardingPlan;
  readonly ownerId?: string;
  readonly aiAvailable: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const me = useCurrentUserId();
  const announce = useAnnounce();
  const advice = plan.advice;
  const isOwner = Boolean(me) && me === ownerId;
  const advise = useMutation({
    mutationFn: async () =>
      (
        await api.request<{
          data: { started: boolean; reason?: string };
        }>({
          path: `${masterDataPath('people')}/${personId}/onboarding/advise`,
          method: 'POST',
        })
      ).data,
    onSuccess: async (result) => {
      if (!result.started)
        await announce(
          t(`onboarding.advice.notStarted.${result.reason ?? 'unavailable'}`),
          [],
        );
    },
  });
  // Nothing to say: Noco has not run and the reader cannot ask it to.
  if (!advice && !(isOwner && aiAvailable)) return null;
  const again =
    isOwner && aiAvailable && advice?.status !== 'running' ? (
      <AiShortcut
        className='text-xs'
        disabled={advise.isPending}
        onClick={() => advise.mutate()}
      >
        {t(advice ? 'onboarding.advice.again' : 'onboarding.advice.first')}
      </AiShortcut>
    ) : null;
  return (
    <div className='flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md bg-accent px-3 py-2 text-xs'>
      <span className='flex min-w-0 flex-1 gap-1.5'>
        <Sparkles
          aria-hidden='true'
          className='mt-0.5 size-3.5 shrink-0 text-primary'
        />
        <span className='min-w-0 text-muted-foreground'>
          {!advice ? (
            t('onboarding.advice.none')
          ) : advice.status === 'running' ? (
            t('onboarding.advice.running')
          ) : advice.status === 'failed' ? (
            <span className='text-destructive'>
              {t('onboarding.advice.failed')}
              {advice.failure ? ` ${advice.failure}` : null}
            </span>
          ) : (
            <>
              <span className='font-medium text-foreground'>
                {t('onboarding.advice.ready', {
                  date: formatDate(advice.finishedAt ?? advice.createdAt),
                })}
              </span>{' '}
              {advice.summary ? (
                <CollapsibleText text={advice.summary} lines={3} />
              ) : null}
            </>
          )}
        </span>
      </span>
      <span className='flex shrink-0 items-center gap-3'>{again}</span>
    </div>
  );
}
