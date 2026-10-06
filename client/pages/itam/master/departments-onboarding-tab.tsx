import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DepartmentKits } from '@/components/itam/department-kits';

/** 入职配置: the department's default kit and its positions. */
export default function Tab(): ReactElement | null {
  const { id = '' } = useParams();
  return id ? <DepartmentKits departmentId={id} /> : null;
}
