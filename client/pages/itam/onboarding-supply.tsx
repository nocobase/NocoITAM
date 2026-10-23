import { useTranslation } from '@nocobase/i18n/client';
import { Package } from 'lucide-react';
import { Fragment, type ReactElement } from 'react';

import { DraftOrdersButton } from '@/components/itam/draft-orders-button';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { LineOutlook } from '@/components/itam/onboarding-plan';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
 * The buying view since 2026-10-22: 需要采购 first, with Asset Steward to
 * draft one order for all of it; then one row per joiner — when, how far
 * along, how much is short, on its way or coming back — and under it only
 * the items not taken straight from stock. Listing every item repeated each
 * joiner's 入职配备 card, which is a click away.
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
      />
      {supply.isLoading ? (
        <Skeleton className='h-40 w-full rounded-xl' />
      ) : supply.data ? (
        <>
          <Shortages shortages={supply.data.shortages} />
          <Joiners joiners={supply.data.joiners} />
        </>
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

function Shortages({
  shortages,
}: {
  readonly shortages: OnboardingSupply['shortages'];
}): ReactElement {
  const { t } = useTranslation();
  const today = todayIso();
  // The most pressing first: the earliest last day to order.
  const sorted = [...shortages].sort((a, b) =>
    (a.orderBy ?? '9999').localeCompare(b.orderBy ?? '9999'),
  );
  // All of it, or one row (2026-10-22): drafted straight away, an order
  // per vendor and joiner, the first opened to check (`DraftOrdersButton`;
  // asked of Asset Steward in the chat until then).
  return (
    <Card className='py-0'>
      <CardContent className='space-y-2 p-4'>
        <div className='flex min-h-8 items-center gap-3 border-b border-border/60 pb-2'>
          <h2 className='font-heading text-sm font-semibold'>
            {t('onboarding.supply.shortages')}
          </h2>
          {sorted.length > 0 ? (
            <DraftOrdersButton className='ml-auto' />
          ) : null}
        </div>
        {sorted.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('onboarding.supply.noShortages')}
          </p>
        ) : (
          <ul className='divide-y divide-border/60 text-sm'>
            {sorted.map((entry) => (
              <li
                key={entry.key}
                className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'
              >
                <span className='flex min-w-0 flex-1 basis-40 items-center gap-2'>
                  <ItemTag kind={entry.kind} itemType={entry.itemType} />
                  <TargetLink target={entry.target} />
                  <Quantity count={entry.quantity} />
                </span>
                {/* Whom it is for, each opening their 入职配备. */}
                <span className='min-w-0 truncate text-xs text-muted-foreground'>
                  {entry.people.map((person, index) => (
                    <Fragment key={person.id}>
                      {index > 0 ? t('common.listSeparator') : null}
                      <RecordLink
                        to={`/people/${person.id}/holdings`}
                        className='transition-colors hover:text-primary'
                      >
                        {person.name}
                      </RecordLink>
                    </Fragment>
                  ))}
                </span>
                {entry.orderBy ? (
                  <span
                    className={
                      entry.orderBy < today
                        ? 'shrink-0 text-xs font-medium text-destructive tabular-nums'
                        : 'shrink-0 text-xs text-muted-foreground tabular-nums'
                    }
                  >
                    {entry.orderBy < today
                      ? t('onboarding.orderNow')
                      : t('onboarding.orderBy', {
                          date: formatDate(entry.orderBy),
                        })}
                  </span>
                ) : null}
                {/* One item on its own; with a single row the heading's
                    button is the same thing. */}
                {sorted.length > 1 ? (
                  <DraftOrdersButton
                    keys={[entry.key]}
                    icon={false}
                    className='-mx-1 h-auto px-1 py-0.5 text-xs'
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Joiners({
  joiners,
}: {
  readonly joiners: OnboardingSupply['joiners'];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card className='py-0'>
      <CardContent className='space-y-2 p-4'>
        <h2 className='border-b border-border/60 pb-2 font-heading text-sm font-semibold'>
          {t('onboarding.supply.joiners')}
        </h2>
        {joiners.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('onboarding.supply.empty')}
          </p>
        ) : (
          <ul className='divide-y divide-border/60'>
            {joiners.map((joiner) => (
              <JoinerRow key={joiner.id} joiner={joiner} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function JoinerRow({
  joiner,
}: {
  readonly joiner: OnboardingSupply['joiners'][number];
}): ReactElement {
  const { t } = useTranslation();
  const plan = joiner.plan;
  const lines = plan.lines.filter((line) => !line.waived);
  const short = lines.reduce((sum, line) => sum + line.shortfall, 0);
  const ordered = lines.reduce((sum, line) => sum + line.onOrder, 0);
  const returning = lines.reduce((sum, line) => sum + line.returning, 0);
  // What only this page says: the items not taken straight from stock.
  const special = lines.filter(
    (line) => line.shortfall > 0 || line.planned.length > 0,
  );
  const since = daysOverdue(joiner.hireDate);
  const ratio = plan.required > 0 ? plan.prepared / plan.required : 0;
  return (
    <li className='space-y-1.5 py-3 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
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
          <Badge className='bg-destructive/10 text-destructive'>
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
        <p className='text-xs text-muted-foreground'>{t('onboarding.noKit')}</p>
      ) : special.length > 0 ? (
        // In a hairline frame on white, a line between items (2026-10-22):
        // on a grey box the outlined tags read as part of the ground.
        <ul className='divide-y divide-border/60 rounded-md border border-border/60 px-3'>
          {special.map((line) => (
            <li
              key={line.key}
              className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'
            >
              {/* At least 10rem for the item, so on a narrow screen what it
                  comes from takes the next line rather than covering it. */}
              <span className='flex min-w-0 flex-1 basis-40 items-center gap-2'>
                <ItemTag kind={line.kind} itemType={line.itemType} />
                <TargetLink target={line.target} />
                <Quantity count={line.required} />
              </span>
              <span className='flex flex-wrap items-center justify-end gap-1.5'>
                <LineOutlook line={line} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
