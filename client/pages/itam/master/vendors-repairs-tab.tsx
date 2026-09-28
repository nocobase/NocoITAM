import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { RepairsList } from '@/components/itam/repairs-list';

export default function Tab(): ReactElement {
  const { id = '' } = useParams();
  return <RepairsList vendorId={id} />;
}
