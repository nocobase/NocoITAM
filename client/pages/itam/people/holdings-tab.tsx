import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { OnboardingPlanCard } from '@/components/itam/onboarding-plan';
import { PersonBelongings } from '@/components/itam/person-belongings';
import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';
import { addDays, text, todayIso } from '@/lib/itam/format';
import { isJoiner } from '@/lib/itam/onboarding';

/**
 * 归属: everything in this person's name.
 *
 * It used to be three plain lists — devices, stock, seats — with nothing to
 * do to any of them, and a 待回收 card above once the person had left. The
 * card was the better shape, and nothing about it was really about leaving:
 * taking a device back from whoever holds it is the same act either way, and
 * it was offered only on each device's own page. So the card is the tab, for
 * everybody, and leaving adds a line rather than a second list.
 */
export default function PersonHoldingsTab(): ReactElement {
  const { id = '' } = useParams();
  const api = useApi();
  const path = masterDataPath('people');
  const person = useQuery({
    queryKey: ['itam', path, id],
    enabled: Boolean(id),
    queryFn: async () =>
      (await api.request<{ data: ItamRecord }>({ path: `${path}/${id}` })).data,
  });
  // 入职配备 for a joiner (2026-10-06): somebody still here who was entered
  // around their first day rather than long after it (`isJoiner`). Staff
  // entered after the fact are not measured against a kit they never had;
  // the card itself steps aside once a joiner is equipped and a month in.
  // Without the creation stamp to read, the joining month decides.
  const hireDate = text(person.data?.hireDate);
  const entered = text(person.data?.createdAt);
  const joining =
    person.data?.employmentStatus !== 'left' &&
    Boolean(hireDate) &&
    (entered
      ? isJoiner(hireDate, entered)
      : hireDate >= addDays(todayIso(), -30));
  return (
    <div className='space-y-4'>
      {joining ? (
        <OnboardingPlanCard
          personId={id}
          personName={text(person.data?.name)}
          ownerId={text(person.data?.onboardingOwnerId) || undefined}
        />
      ) : null}
      <PersonBelongings personId={id} personName={text(person.data?.name)} />
    </div>
  );
}
