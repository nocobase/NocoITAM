import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Package,
  PackageCheck,
  Sparkles,
  Truck,
  Undo2,
} from 'lucide-react';
import { Fragment, useState, type ReactElement, type ReactNode } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAiPageContext } from '@/lib/itam/ai-chat';
import { useItemFacts, type ItemOwner } from '@/lib/itam/kit-items';
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
  TARGET_ROUTES,
  useOnboardingPlan,
  type OnboardingPlan,
  type OnboardingPlanLine,
  type PlanThing,
} from '@/lib/itam/onboarding';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { STOCK_PATH, STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';

import { ItemOwners } from './item-owners.js';
import { CollapsibleText } from './collapsible-text.js';
import { RecordLink } from './record-link.js';
import { ReferenceSelect } from './reference-select.js';
import { TEXT_BUTTON } from '@/lib/itam/text-button';

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
 * Which device of several is Asset Steward's to suggest (2026-10-06): it chooses in
 * the background as the joiner's 入职负责人 (`onboarding-advisor.ts`), its
 * picks come first with the reason beneath, and the strip under the heading
 * says how that run went. The buttons stay the person's.
 */

/**
 * Why a proposal cannot be carried out yet, as a translation key: a seat
 * that needs an account it has none for waits for a person; one that needs
 * a device of theirs waits for the device (2026-10-28).
 */
function waitingFor(thing: PlanThing): string | undefined {
  if (thing.needsAccount && !thing.account) return 'onboarding.needsAccount';
  if (thing.needsDevice && !thing.holder) return 'onboarding.needsDevice';
  return undefined;
}

/**
 * A proposal's identity on the card: the thing it proposes, and for a
 * per-device licence asked for more than once, which of its seats — the
 * same entitlement may be proposed for two devices.
 */
function proposalKey(thing: PlanThing): string {
  return thing.slot === undefined ? thing.id : `${thing.id}#${thing.slot}`;
}

/**
 * A button that waits says why on hover (2026-10-28). A disabled button
 * takes no pointer events, so a `title` on it never shows: the tooltip
 * hangs on a wrapper instead.
 */
function WhyDisabled({
  reason,
  children,
}: {
  readonly reason: string | undefined;
  readonly children: ReactElement;
}): ReactElement {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className='inline-flex' />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

/** A proposal's other actions (更换, 不需要) behind ⋯ (2026-10-28). */
function MoreMenu({
  disabled,
  children,
}: {
  readonly disabled: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type='button'
            size='icon-sm'
            variant='ghost'
            className='-mx-1.5 text-muted-foreground'
            aria-label={t('common.more')}
            disabled={disabled}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-auto min-w-32'>
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function OnboardingPlanCard({
  personId,
  personName,
  ownerId,
}: {
  readonly personId: string;
  readonly personName: string;
  /** The joiner's 入职负责人, who alone may ask Asset Steward again. */
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
  const effective = (thing: PlanThing): PlanThing =>
    chosen[proposalKey(thing)] ?? thing;
  const data = plan.data;
  // Each item's category and maker, read the way the kit reads them.
  const { detailOf } = useItemFacts(
    (data?.lines ?? []).map((line) => ({
      type: line.target.type,
      id: line.target.id,
      quantity: line.required,
    })),
  );
  // The person goes along as page context, so Asset Steward asked about
  // them in the chat reads this very plan (`itam onboarding plan`).
  const { available: aiAvailable } = useAiPageContext({
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
  const waive = async (
    key: string,
    // The whole item, or how many of its quantity (2026-10-28).
    change: { readonly waived: boolean } | { readonly fewer: number },
  ) => {
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: `${masterDataPath('people')}/${personId}/onboarding/waive`,
        method: 'POST',
        json: { key, ...change },
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
            // A per-device licence's seat goes to their device.
            thing.holder
              ? { holderType: 'device', holderId: thing.holder.id }
              : {
                  holderType: 'person',
                  holderId: personId,
                  // A subscription seat is held under an account: their
                  // e-mail.
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
  const runnable = (thing: PlanThing) => waitingFor(thing) === undefined;
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
          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <PackageCheck
              aria-hidden='true'
              className='size-4 shrink-0 text-muted-foreground'
            />
            <h2 className='shrink-0 font-heading text-sm font-semibold whitespace-nowrap'>
              {t('onboarding.title')}
            </h2>
            {data.kit ? (
              <RecordLink
                to={`/departments/${data.kit.departmentId}/onboarding`}
                className='truncate text-sm text-muted-foreground'
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
          {/* No AI shortcut here since 2026-10-22: its plan was what 全部执行
              does, and 重新挑选 below is where Asset Steward chooses. What
              it alone could do — draft the order for a shortfall — sits by
              the shortfall. */}
          <div className='ml-auto flex shrink-0 items-center gap-3'>
            {proposals.length > 0 ? (
              <Button
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
              <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums'>
                <span>
                  {t('onboarding.progress', {
                    done: data.prepared,
                    total: data.required,
                  })}
                </span>
                {/* A short bar on the count's own line (2026-10-22): full
                    width under the AI strip, an empty one read as a thick
                    divider. */}
                <span
                  aria-hidden='true'
                  className='h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted'
                >
                  <span
                    className='block h-full rounded-full bg-primary'
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
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
                  <RecordLink key={order.id} to={`/procurement/${order.id}`}>
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
            <ul className='divide-y divide-border/60 border-t border-border/60'>
              {data.lines.map((line) => (
                <PlanLine
                  key={`${line.target.type}:${line.target.id}`}
                  line={line}
                  detail={detailOf({
                    type: line.target.type,
                    id: line.target.id,
                    quantity: line.required,
                  })}
                  busy={busy}
                  started={started}
                  effective={effective}
                  onChoose={(original, replacement) =>
                    setChosen((current) => ({
                      ...current,
                      [proposalKey(original)]: replacement,
                    }))
                  }
                  onRun={(thing) => void run([thing], () => titleFor(thing))}
                  onWaive={(waived) => void waive(line.key, { waived })}
                  onWaiveSome={(fewer, keep = []) => {
                    // What the person keeps stays chosen once the plan
                    // proposes one fewer.
                    if (keep.length > 0)
                      setChosen((current) => ({
                        ...current,
                        ...Object.fromEntries(keep),
                      }));
                    void waive(line.key, { fewer });
                  }}
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
  detail,
  busy,
  started,
  effective,
  onChoose,
  onRun,
  onWaive,
  onWaiveSome,
}: {
  readonly line: OnboardingPlanLine;
  /** Its category and maker, as the kit shows them. */
  readonly detail: readonly ItemOwner[];
  readonly busy: boolean;
  readonly started: boolean;
  /** The proposal as it stands: the one chosen instead, if any. */
  readonly effective: (thing: PlanThing) => PlanThing;
  readonly onChoose: (original: PlanThing, replacement: PlanThing) => void;
  readonly onRun: (thing: PlanThing) => void;
  /** Marks the item 不需要 for this person, or takes the mark back. */
  readonly onWaive: (waived: boolean) => void;
  /**
   * Marks how many of its quantity are 不需要 for this person; `keep` is
   * what each remaining proposal should stay, by its key once there is one
   * fewer.
   */
  readonly onWaiveSome: (
    fewer: number,
    keep?: readonly (readonly [string, PlanThing])[],
  ) => void;
}): ReactElement {
  const { t } = useTranslation();
  const translated = (key: string | undefined) => (key ? t(key) : undefined);
  // The proposal whose device is being chosen again, if any.
  const [changing, setChanging] = useState<string>();
  // The item's asset type leads its row, as on the kit it comes from:
  // software is 授权 whatever kind of entitlement, the rest follow their
  // category (设备, 配件, 耗材, 组件).
  const kind =
    line.kind === 'entitlement' ? 'entitlement' : (line.itemType ?? undefined);
  // Where a thing's own record is: what is already theirs opens it
  // (2026-10-22), as a related record does anywhere else.
  const recordOf = (thing: PlanThing) =>
    thing.type === 'device'
      ? `/devices/${thing.id}`
      : thing.type === 'seat'
        ? `/entitlements/${thing.id}`
        : `/${STOCK_ROUTES[line.itemType as StockKind] ?? 'accessories'}/${thing.id}`;
  const tag = kind ? (
    <AssetTypeBadge value={kind} className='shrink-0' />
  ) : (
    <Package
      aria-hidden='true'
      className='size-4 shrink-0 text-muted-foreground'
    />
  );
  // Asset Steward's reasons, for the picks still standing: one replaced by 更换 is
  // the person's choice now, and its reason no longer applies.
  const reasons = line.proposals.filter(
    (thing) => thing.reason && effective(thing) === thing,
  );
  // Asked for more than once (2026-10-28): each thing on a line of its
  // own, each with its own 不需要, which takes one off the quantity.
  const several = line.required > 1;
  /**
   * 不需要 on one of several (2026-10-28): the plan then proposes one fewer,
   * from the first, so the things left are kept as they stood — taking the
   * first laptop off leaves the second, not the first again.
   */
  const waiveOne = (index: number) => {
    const left = line.required - 1;
    const rest = line.proposals
      .filter((_, at) => at !== index)
      .map((thing) => effective(thing));
    const keep = rest.flatMap((thing, at) => {
      const original = line.proposals[at];
      if (!original || thing === original) return [];
      const key =
        original.slot === undefined || left <= 1
          ? original.id
          : `${original.id}#${String(at)}`;
      return [[key, thing] as const];
    });
    onWaiveSome(line.fewer + 1, keep);
  };
  const chooseHolder = (
    original: PlanThing,
    choice: NonNullable<PlanThing['holderChoices']>[number],
  ) =>
    onChoose(original, {
      ...original,
      holder: { type: 'device', ...choice },
      needsDevice: undefined,
    });
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
          variant='ghost'
          className={`-mx-2.5 ${TEXT_BUTTON}`}
          disabled={busy}
          onClick={() => onWaive(false)}
        >
          {t('onboarding.restore')}
        </Button>
      </li>
    );
  return (
    <li className='py-2 text-sm'>
      {/* Several things start level with the name (2026-10-28), a line
          each, rather than the name floating between them. */}
      <div
        className={cn(
          'flex flex-wrap gap-x-3 gap-y-1.5',
          several ? 'items-start' : 'items-center',
        )}
      >
        <span className='flex min-w-0 flex-1 items-center gap-2'>
          {tag}
          <span className='flex min-w-0 flex-col'>
            <span className='flex min-w-0 items-center gap-2'>
              {/* The kit's item opens its record too: the model, the
                  category or the software product (2026-10-22). */}
              <RecordLink
                to={`/${TARGET_ROUTES[line.target.type]}/${line.target.id}`}
                className='truncate'
              >
                {line.target.name}
              </RecordLink>
              {line.target.type === 'category' ? (
                <span className='shrink-0 text-xs text-muted-foreground'>
                  {t('onboardingKits.anyModel')}
                </span>
              ) : null}
              <span className='shrink-0 text-muted-foreground tabular-nums'>
                ×{line.required}
              </span>
              {/* Some of the kit's quantity not needed (2026-10-28), with
                  the way to need it again. */}
              {line.fewer > 0 ? (
                <span className='inline-flex shrink-0 items-center gap-3 text-muted-foreground'>
                  {t('onboarding.fewer', { count: line.fewer })}
                  <Button
                    variant='ghost'
                    className={`-mx-2.5 ${TEXT_BUTTON}`}
                    disabled={busy}
                    onClick={() => onWaiveSome(0)}
                  >
                    {t('onboarding.restore')}
                  </Button>
                </span>
              ) : null}
            </span>
            {/* Its category and maker (2026-10-28), under the name: the
                row's width is the proposals'. */}
            <ItemOwners owners={detail} className='text-xs' />
          </span>
        </span>
        {/* One even gap between every word on the row (2026-10-22): the
            text buttons (更换, 不需要) take back their padding with a
            negative margin, so their words sit a gap from their
            neighbours like the name and the outlined button do. */}
        <span className='flex max-w-full min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1.5'>
          {/* An item asked for more than once lists each thing on its own
              line (2026-10-28): two laptops side by side ran into each
              other. One thing stays in the row. */}
          <span
            className={
              several
                ? 'flex max-w-full min-w-0 flex-col items-end gap-1.5'
                : 'contents'
            }
          >
            {line.prepared.map((thing) => (
              <RecordLink
                key={`p:${thing.type}:${thing.id}`}
                to={recordOf(thing)}
                // The tag does not underline; its name does (2026-10-28),
                // nearer the text than elsewhere, as the tag's own edge
                // would clip it.
                className='group max-w-full hover:no-underline'
              >
                <Badge variant='secondary' className='max-w-full'>
                  <Check className='size-3' />
                  <span className='-mb-1 truncate pb-1'>
                    <span className='underline-offset-2 group-hover:underline'>
                      {thing.label}
                    </span>
                    {thing.type === 'device'
                      ? ` · ${t(`onboarding.state.${thing.state ?? 'assigned'}`)}`
                      : null}
                  </span>
                </Badge>
              </RecordLink>
            ))}
            {line.proposals.map((original, index) => {
              const thing = effective(original);
              if (changing === proposalKey(original))
                return (
                  // 更换: any device of this model (or category) that is in
                  // stock and held for nobody.
                  <span key={`c:${proposalKey(original)}`} className='w-56'>
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
                  key={`o:${original.type}:${proposalKey(original)}`}
                  className='inline-flex max-w-full min-w-0 items-center gap-3'
                >
                  {/* What is proposed opens its record, to be looked at
                    before it is reserved; the button beside it only acts
                    (2026-10-22: the label was inside the button). */}
                  <RecordLink to={recordOf(thing)} className='min-w-0 truncate'>
                    {thing.label}
                  </RecordLink>
                  {/* A per-device licence's seat names the device it goes to
                    (2026-10-28); with another device of theirs to choose,
                    the name itself opens the choice. */}
                  {thing.holder &&
                  (original.holderChoices ?? []).some(
                    (choice) => choice.id !== thing.holder?.id,
                  ) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type='button'
                            variant='ghost'
                            className={`-mx-2.5 min-w-0 gap-1 text-muted-foreground hover:text-muted-foreground aria-expanded:text-muted-foreground ${TEXT_BUTTON}`}
                            disabled={busy}
                          />
                        }
                      >
                        <span className='truncate'>
                          {t('onboarding.onDevice', {
                            label: thing.holder.label,
                          })}
                        </span>
                        <ChevronDown />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align='end'
                        className='w-auto min-w-32'
                      >
                        <DropdownMenuGroup>
                          {(original.holderChoices ?? []).map((choice) => (
                            <DropdownMenuItem
                              key={choice.id}
                              disabled={choice.id === thing.holder?.id}
                              onClick={() => chooseHolder(original, choice)}
                            >
                              {choice.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : thing.holder ? (
                    <span className='min-w-0 truncate text-muted-foreground'>
                      {t('onboarding.onDevice', { label: thing.holder.label })}
                    </span>
                  ) : null}
                  {/* Words like 更换 and 不需要 beside it (2026-10-22), the
                    action in the brand colour so it still leads; the
                    padding taken back like theirs. */}
                  <WhyDisabled reason={translated(waitingFor(thing))}>
                    <Button
                      variant='ghost'
                      className={`-mx-2.5 text-primary hover:text-primary ${TEXT_BUTTON}`}
                      disabled={busy || waitingFor(thing) !== undefined}
                      onClick={() => onRun(thing)}
                    >
                      {thing.type === 'device'
                        ? t(
                            started
                              ? 'onboarding.assign'
                              : 'onboarding.reserve',
                          )
                        : thing.type === 'stock'
                          ? // ×N only when more than one.
                            (thing.quantity ?? 1) > 1
                            ? t('onboarding.issueMany', {
                                count: thing.quantity,
                              })
                            : t('onboarding.issue')
                          : t('onboarding.seat')}
                    </Button>
                  </WhyDisabled>
                  {/* 更换 and 不需要 in a menu (2026-10-28): the action
                      that carries the item out stays in sight, the rest
                      keep the row short. */}
                  <MoreMenu disabled={busy}>
                    {thing.type === 'device' ? (
                      <DropdownMenuItem
                        onClick={() => setChanging(proposalKey(original))}
                      >
                        {t('onboarding.change')}
                      </DropdownMenuItem>
                    ) : null}
                    {/* 更换 for a per-device seat: another device of
                        theirs, when there is one to choose. */}
                    {thing.type === 'seat' &&
                    (original.holderChoices ?? []).some(
                      (choice) => choice.id !== thing.holder?.id,
                    ) ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          {t('onboarding.change')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className='w-auto min-w-40'>
                          {(original.holderChoices ?? []).map((choice) => (
                            <DropdownMenuItem
                              key={choice.id}
                              disabled={choice.id === thing.holder?.id}
                              onClick={() => chooseHolder(original, choice)}
                            >
                              {choice.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    <DropdownMenuItem
                      onClick={() =>
                        several ? waiveOne(index) : onWaive(true)
                      }
                    >
                      {t('onboarding.waive')}
                    </DropdownMenuItem>
                  </MoreMenu>
                </span>
              );
            })}
          </span>
          {/* What is short is bought on 供需分析 (2026-10-23; 创建采购单
              on this row until then), weighed against what else wants it. */}
          <LineOutlook line={line} />
          {/* Something they will not be given — their own monitor, another
              laptop — is marked rather than left outstanding for ever. */}
          {/* Each proposal has its own 不需要 in its menu; the item's own
              shows only while nothing is proposed for it. */}
          {line.preparedCount < line.required && line.proposals.length === 0 ? (
            <MoreMenu disabled={busy}>
              <DropdownMenuItem onClick={() => onWaive(true)}>
                {t('onboarding.waive')}
              </DropdownMenuItem>
            </MoreMenu>
          ) : null}
        </span>
      </div>
      {reasons.length > 0 ? (
        // In a light box like the strip above (2026-10-22), each with the
        // device the rule would have proposed when it chose another — or,
        // with several, the rule's whole choice once at the end.
        <ul className='mt-1.5 space-y-1.5 rounded-md bg-accent px-3 py-2 text-xs text-muted-foreground'>
          {reasons.map((thing) => (
            <li key={`r:${thing.id}`} className='flex gap-1.5'>
              {/* Marked as Asset Steward's (2026-10-22). */}
              <Sparkles
                aria-hidden='true'
                className='mt-0.5 size-3.5 shrink-0 text-primary'
              />
              <div className='min-w-0 space-y-0.5'>
                <p>
                  {reasons.length > 1 ? (
                    <span className='text-foreground'>{`${thing.label}：`}</span>
                  ) : null}
                  <CollapsibleText text={thing.reason ?? ''} lines={2} />
                </p>
                {thing.instead ? (
                  <p>
                    {t('onboarding.instead')}
                    <RecordLink
                      to={`/devices/${thing.instead.id}`}
                      className='text-foreground'
                    >
                      {thing.instead.label}
                    </RecordLink>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
          {line.ruleChoice && line.ruleChoice.length > 0 ? (
            <li className='pl-5'>
              {t('onboarding.instead')}
              {line.ruleChoice.map((row, index) => (
                <Fragment key={row.id}>
                  {index > 0 ? '、' : null}
                  <RecordLink
                    to={`/devices/${row.id}`}
                    className='text-foreground'
                  >
                    {row.label}
                  </RecordLink>
                </Fragment>
              ))}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * What a line expects rather than has in stock (2026-10-06): an open order
 * or somebody leaving, each with the day it can be handed over — nothing to
 * press, since it is not here yet — and what is still short, with the last
 * day to order it.
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
        // Red once its last day to order has passed, orange before
        // (2026-10-22), as the workbench's joiner cards say it; the row's
        // own size, as the item and its actions (2026-10-23).
        <span
          className={cn(
            'text-sm',
            line.orderBy && line.orderBy >= today
              ? 'text-warning-foreground'
              : 'text-destructive',
          )}
        >
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
 * How Asset Steward's background choice stands: choosing, chosen (with its summary
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
  const queryClient = useQueryClient();
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
      // Read the plan again at once, so the strip says it is choosing and
      // looks again until it has (2026-10-22: without this the press
      // seemed to do nothing until the page was reloaded).
      else
        await queryClient.invalidateQueries({
          queryKey: ['itam', masterDataPath('people'), 'onboarding', personId],
        });
    },
  });
  // Nothing to say: Asset Steward has not run and the reader cannot ask it to.
  if (!advice && !(isOwner && aiAvailable)) return null;
  const shortcut = (
    <AiShortcut
      className='text-xs'
      disabled={advise.isPending}
      onClick={() => advise.mutate()}
    >
      {t(advice ? 'onboarding.advice.again' : 'onboarding.advice.first')}
    </AiShortcut>
  );
  // 重新挑选 says on hover what it replaces, in the app's tooltip (the
  // browser's own title did not show in every browser); 挑选 needs none,
  // the text beside it saying what it adds (2026-10-22).
  const again =
    isOwner && aiAvailable && advice?.status !== 'running' ? (
      advice ? (
        <Tooltip>
          <TooltipTrigger render={<span className='inline-flex' />}>
            {shortcut}
          </TooltipTrigger>
          <TooltipContent className='max-w-64'>
            {t('onboarding.advice.againHint')}
          </TooltipContent>
        </Tooltip>
      ) : (
        shortcut
      )
    ) : null;
  return (
    <div className='flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md bg-accent px-3 py-2 text-xs'>
      {/* At least 15rem of text before the button takes a line of its
          own, rather than the text going down a word at a time. */}
      {/* No sparkle of its own (2026-10-22): the button beside it has one. */}
      <span className='flex min-w-0 flex-1 basis-60'>
        <span className='min-w-0 text-muted-foreground'>
          {!advice ? (
            t('onboarding.advice.none')
          ) : advice.status === 'running' ? (
            // The app's own spinner while it chooses (2026-10-22).
            <span className='inline-flex items-center gap-1.5'>
              <Spinner className='size-3.5 shrink-0' />
              {t('onboarding.advice.running')}
            </span>
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
      {/* -my-1 takes back the shortcut's own padding, so its words sit on
          the first line of the text rather than below it. */}
      <span className='-my-1 flex shrink-0 items-center gap-3'>{again}</span>
    </div>
  );
}
