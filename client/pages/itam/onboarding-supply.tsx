import { useTranslation } from '@nocobase/i18n/client';
import { Check, Package } from 'lucide-react';
import type { ReactElement } from 'react';

import { BackButton } from '@/components/back-button';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { LineOutlook } from '@/components/itam/onboarding-plan';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { daysOverdue, formatDate, todayIso } from '@/lib/itam/format';
import {
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
 */
export default function OnboardingSupplyPage(): ReactElement {
  const { t } = useTranslation();
  const supply = useOnboardingSupply();
  return (
    <Page>
      <BackButton to='/' />
      <PageHeader
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

function Shortages({
  shortages,
}: {
  readonly shortages: OnboardingSupply['shortages'];
}): ReactElement {
  const { t } = useTranslation();
  const today = todayIso();
  return (
    <Card className='py-0'>
      <CardContent className='space-y-2 p-4'>
        <h2 className='font-heading text-sm font-semibold'>
          {t('onboarding.supply.shortages')}
        </h2>
        {shortages.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('onboarding.supply.noShortages')}
          </p>
        ) : (
          <ul className='divide-y divide-border/60 text-sm'>
            {shortages.map((entry) => (
              <li
                key={entry.key}
                className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2'
              >
                <span className='flex min-w-0 flex-1 items-center gap-2'>
                  <ItemTag kind={entry.kind} itemType={entry.itemType} />
                  <span className='truncate'>{entry.target.name}</span>
                  <span className='shrink-0 text-muted-foreground tabular-nums'>
                    ×{entry.quantity}
                  </span>
                </span>
                <span className='min-w-0 truncate text-xs text-muted-foreground'>
                  {entry.people
                    .map((person) => person.name)
                    .join(t('common.listSeparator'))}
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
  if (joiners.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('onboarding.supply.empty')}
      </p>
    );
  return (
    <div className='space-y-3'>
      {joiners.map((joiner) => {
        const since = daysOverdue(joiner.hireDate);
        return (
          <Card key={joiner.id} className='py-0'>
            <CardContent className='space-y-2 p-4'>
              <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/60 pb-2'>
                <RecordLink
                  to={`/people/${joiner.id}/holdings`}
                  className='font-heading text-sm font-semibold hover:underline'
                >
                  {joiner.name}
                </RecordLink>
                <span className='text-xs text-muted-foreground'>
                  {[joiner.department, joiner.position]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className='flex-1' />
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
                <span className='text-xs text-muted-foreground tabular-nums'>
                  {t('onboarding.progress', {
                    done: joiner.plan.prepared,
                    total: joiner.plan.required,
                  })}
                </span>
              </div>
              {joiner.plan.kit ? (
                <ul className='divide-y divide-border/60 text-sm'>
                  {joiner.plan.lines
                    .filter((line) => !line.waived)
                    .map((line) => (
                      <SupplyLine key={line.key} line={line} />
                    ))}
                </ul>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('onboarding.noKit')}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** One item: what they have, what stock gives, what is planned or short. */
function SupplyLine({
  line,
}: {
  readonly line: OnboardingPlanLine;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <li className='flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2'>
      <span className='flex min-w-0 flex-1 items-center gap-2'>
        <ItemTag kind={line.kind} itemType={line.itemType} />
        <span className='truncate'>{line.target.name}</span>
        <span className='shrink-0 text-muted-foreground tabular-nums'>
          ×{line.required}
        </span>
      </span>
      <span className='flex flex-wrap items-center justify-end gap-1.5'>
        {line.prepared.map((thing) => (
          <Badge key={`p:${thing.type}:${thing.id}`} variant='secondary'>
            <Check className='size-3' />
            {thing.label}
          </Badge>
        ))}
        {line.proposals.map((thing) => (
          <Badge key={`s:${thing.type}:${thing.id}`} variant='outline'>
            {/* A seat is not stock: it is a free seat of an entitlement. */}
            {t(
              thing.type === 'seat'
                ? 'onboarding.supply.fromSeats'
                : 'onboarding.supply.fromStock',
              { label: thing.label },
            )}
          </Badge>
        ))}
        <LineOutlook line={line} />
      </span>
    </li>
  );
}
