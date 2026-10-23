import { useTranslation } from '@nocobase/i18n/client';
import { Package } from 'lucide-react';
import type { ReactElement } from 'react';

import { DraftOrdersButton } from '@/components/itam/draft-orders-button';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { LineOutlook } from '@/components/itam/onboarding-plan';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { daysOverdue, formatDate, todayIso } from '@/lib/itam/format';
import {
  TARGET_ROUTES,
  useOnboardingSupply,
  type OnboardingPlanLine,
  type OnboardingSupply,
} from '@/lib/itam/onboarding';

/**
 * 入职供需 (2026-10-06): every joiner still being equipped, worked out
 * together on the server (`allocate` in `onboarding.ts`) — the earliest
 * first day first, from stock, then open purchase orders, then what people
 * leaving hand back — and what must still be bought across all of them, each
 * with the last day to order it. It reads; every act stays on the joiner's
 * own 入职配备 card, which each name opens. Reached from the workbench's
 * 入职准备 column, so it has no menu entry and checks no page grant: the
 * endpoint answers only a reader that column is for.
 *
 * Since 2026-10-22 one row per joiner — when, how far along, how much is
 * short, on its way or coming back — and under it only the items not taken
 * straight from stock: short, each with its last day to order and 起草采购单,
 * or coming on an order or back from a leaver. 起草采购单 at the top drafts
 * for every shortage. A 需要采购 card above it listed the shortages again,
 * across joiners, for the day; listing every item repeated each joiner's
 * 入职配备 card, which is a click away.
 */
export default function OnboardingSupplyPage(): ReactElement {
  const { t } = useTranslation();
  const supply = useOnboardingSupply();
  return (
    <Page>
      {/* The way back as the detail pages and MDM 核对 have it, an arrow
          beside the title (2026-10-22: a 返回 link above it until then). */}
      <PageHeader
        back
        title={t('onboarding.supply.title')}
        description={t('onboarding.supply.description')}
        // Orders for every shortage, a dialog each.
        actions={
          supply.data && anyShort(supply.data.joiners) ? (
            <DraftOrdersButton />
          ) : undefined
        }
      />
      {supply.isLoading ? (
        <Skeleton className='h-40 w-full rounded-xl' />
      ) : supply.data ? (
        <Joiners joiners={supply.data.joiners} />
      ) : null}
    </Page>
  );
}

/** An item's asset type as its tag: software is always 授权. */
function ItemTag({
  kind,
  itemType,
}: {
  readonly kind: OnboardingPlanLine['kind'];
  readonly itemType: string | null;
}): ReactElement {
  const value = kind === 'entitlement' ? 'entitlement' : itemType;
  return value ? (
    <AssetTypeBadge value={value} className='shrink-0' />
  ) : (
    <Package
      aria-hidden='true'
      className='size-4 shrink-0 text-muted-foreground'
    />
  );
}

/** A kit item's name, opening its model, category or product. */
function TargetLink({
  target,
}: {
  readonly target: OnboardingPlanLine['target'];
}): ReactElement {
  return (
    <RecordLink
      to={`/${TARGET_ROUTES[target.type]}/${target.id}`}
      className='truncate transition-colors hover:text-primary'
    >
      {target.name}
    </RecordLink>
  );
}

/** ×N only when more than one. */
function Quantity({ count }: { readonly count: number }): ReactElement | null {
  return count > 1 ? (
    <span className='shrink-0 text-muted-foreground tabular-nums'>
      ×{count}
    </span>
  ) : null;
}

/** Whether any joiner is short of something: 起草采购单 for all of it. */
const anyShort = (joiners: OnboardingSupply['joiners']) =>
  joiners.some((joiner) =>
    joiner.plan.lines.some((line) => !line.waived && line.shortfall > 0),
  );

/** A card per joiner (2026-10-22; rows of one card until then). */
function Joiners({
  joiners,
}: {
  readonly joiners: OnboardingSupply['joiners'];
}): ReactElement {
  const { t } = useTranslation();
  if (joiners.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('onboarding.supply.empty')}
      </p>
    );
  return (
    <div className='space-y-3'>
      {joiners.map((joiner) => (
        <JoinerCard key={joiner.id} joiner={joiner} />
      ))}
    </div>
  );
}

function JoinerCard({
  joiner,
}: {
  readonly joiner: OnboardingSupply['joiners'][number];
}): ReactElement {
  const { t } = useTranslation();
  const plan = joiner.plan;
  const lines = plan.lines.filter((line) => !line.waived);
  const short = lines.reduce((sum, line) => sum + line.shortfall, 0);
  // Red once a last day to order has passed, orange before, as the lines.
  const today = todayIso();
  const late = lines.some(
    (line) => line.shortfall > 0 && (!line.orderBy || line.orderBy < today),
  );
  const ordered = lines.reduce((sum, line) => sum + line.onOrder, 0);
  const returning = lines.reduce((sum, line) => sum + line.returning, 0);
  // What only this page says: the items not taken straight from stock.
  const special = lines.filter(
    (line) => line.shortfall > 0 || line.planned.length > 0,
  );
  const since = daysOverdue(joiner.hireDate);
  const ratio = plan.required > 0 ? plan.prepared / plan.required : 0;
  return (
    <Card className='py-0'>
      <CardContent className='space-y-2 p-4 text-sm'>
        <div
          className={cn(
            'flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1',
            // Ruled off only from something under it.
            (special.length > 0 || !plan.kit) &&
              'border-b border-border/60 pb-2',
          )}
        >
          <span className='flex min-w-0 flex-1 items-baseline gap-2'>
            <RecordLink
              to={`/people/${joiner.id}/holdings`}
              className='shrink-0 font-medium transition-colors hover:text-primary'
            >
              {joiner.name}
            </RecordLink>
            <span className='truncate text-xs text-muted-foreground'>
              {[joiner.department, joiner.position].filter(Boolean).join(' · ')}
            </span>
          </span>
          {joiner.hireDate ? (
            <span className='text-xs text-muted-foreground tabular-nums'>
              {t('workbench.work.joinsOn', {
                date: formatDate(joiner.hireDate),
              })}{' '}
              <span className='font-medium text-foreground'>
                {since < 0
                  ? t('workbench.work.joinsIn', { count: -since })
                  : since === 0
                    ? t('workbench.work.joinsToday')
                    : t('workbench.work.joinedAgo', { count: since })}
              </span>
            </span>
          ) : null}
          {/* How far along, as on their card: the count and a short bar. */}
          <span className='flex items-center gap-2 text-xs text-muted-foreground tabular-nums'>
            {t('onboarding.progress', {
              done: plan.prepared,
              total: plan.required,
            })}
            <span
              aria-hidden='true'
              className='h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted'
            >
              <span
                className='block h-full rounded-full bg-primary'
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </span>
          </span>
          {short > 0 ? (
            <Badge
              className={
                late
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-warning/15 text-warning-foreground'
              }
            >
              {t('onboarding.shortfall', { count: short })}
            </Badge>
          ) : null}
          {ordered > 0 ? (
            <Badge variant='outline'>
              {t('onboarding.supply.onOrder', { count: ordered })}
            </Badge>
          ) : null}
          {returning > 0 ? (
            <Badge variant='outline'>
              {t('onboarding.supply.returning', { count: returning })}
            </Badge>
          ) : null}
        </div>
        {!plan.kit ? (
          <p className='text-xs text-muted-foreground'>
            {t('onboarding.noKit')}
          </p>
        ) : special.length > 0 ? (
          // A line between items, on the card's white: on a grey box the
          // outlined tags read as part of the ground (2026-10-22).
          <ul className='divide-y divide-border/60'>
            {special.map((line) => (
              <li
                key={line.key}
                className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2 last:pb-0'
              >
                {/* At least 10rem for the item, so on a narrow screen what it
                  comes from takes the next line rather than covering it. */}
                <span className='flex min-w-0 flex-1 basis-40 items-center gap-2'>
                  <ItemTag kind={line.kind} itemType={line.itemType} />
                  <TargetLink target={line.target} />
                  <Quantity count={line.required} />
                </span>
                <span className='flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5'>
                  <LineOutlook line={line} />
                  {/* This item for this joiner, in the create dialog. */}
                  {line.shortfall > 0 ? (
                    <DraftOrdersButton
                      personId={joiner.id}
                      keys={[line.key]}
                      className='text-xs [&_svg]:size-3.5'
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
