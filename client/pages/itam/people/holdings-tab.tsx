import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { OnboardingPlanCard } from '@/components/itam/onboarding-plan';
import { PersonBelongings } from '@/components/itam/person-belongings';
import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';
import { addDays, text, todayIso } from '@/lib/itam/format';

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
  // 入职配备 for a joiner: somebody still here whose 入职日期 is ahead or
  // within the last month. Long-standing staff are not measured against
  // a kit that may have changed since they joined.
  const hireDate = text(person.data?.hireDate);
  const joining =
    person.data?.employmentStatus !== 'left' &&
    Boolean(hireDate) &&
    hireDate >= addDays(todayIso(), -30);
  return (
    <div className='space-y-4'>
      {joining ? <OnboardingPlanCard personId={id} /> : null}
      <PersonBelongings personId={id} personName={text(person.data?.name)} />
    </div>
  );
}
