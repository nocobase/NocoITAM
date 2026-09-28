import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { masterDataPath, useApi } from '@/lib/itam/api';

import { StatCards } from './stat-cards.js';

interface PeopleStats {
  readonly leftHolding: number;
  readonly hiredThisMonth: number;
}

/** The cards above the people list; each opens a matching filter. */
export function PeopleStatCards({
  active,
  onFilter,
}: {
  /** The list's current URL params, to mark the active card. */
  readonly active: Readonly<Record<string, string | undefined>>;
  readonly onFilter: (updates: Record<string, string | undefined>) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const stats = useQuery({
    queryKey: ['itam', masterDataPath('people'), 'stats'],
    queryFn: async () =>
      (
        await api.request<{ data: PeopleStats }>({
          path: `${masterDataPath('people')}/stats`,
        })
      ).data,
  });
  if (!stats.data) return null;
  const clear = {
    employmentStatus: undefined,
    sort: undefined,
    order: undefined,
    page: undefined,
  };
  return (
    <StatCards
      cards={[
        {
          key: 'leftHolding',
          label: t('people.stats.leftHolding'),
          caption: t('people.stats.leftHoldingCaption'),
          value: stats.data.leftHolding,
          tone: stats.data.leftHolding > 0 ? 'destructive' : undefined,
          active: active.employmentStatus === 'left',
          onClick: () =>
            onFilter({
              ...clear,
              employmentStatus:
                active.employmentStatus === 'left' ? undefined : 'left',
            }),
        },
        {
          key: 'hiredThisMonth',
          label: t('people.stats.hiredThisMonth'),
          caption: t('people.stats.hiredThisMonthCaption'),
          value: stats.data.hiredThisMonth,
          active: active.sort === 'hireDate',
          onClick: () =>
            onFilter(
              active.sort === 'hireDate'
                ? clear
                : { ...clear, sort: 'hireDate', order: 'desc' },
            ),
        },
      ]}
    />
  );
}
