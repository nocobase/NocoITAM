import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { useSubtree } from '@/lib/itam/tree';

/**
 * A department's devices, its sub-departments' included (2026-10-21), with
 * each one's department when there are several.
 */
export default function DepartmentDevicesTab(): ReactElement | null {
  const { id = '' } = useParams();
  const ids = useSubtree('departments', id);
  if (!ids) return null;
  return (
    <DeviceListEmbed
      filter={{ departmentId: ids }}
      // As a location's (2026-10-21): who holds each over since when.
      omit={['assignedAt']}
      show={[
        'noAndName',
        ...(ids.length > 1 ? (['department'] as const) : []),
        'serialNo',
        'assignee',
      ]}
    />
  );
}
