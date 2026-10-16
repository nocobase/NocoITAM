import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';

import { useApi, type ItamRecord } from '@/lib/itam/api';
import { useCurrentUserId } from '@/lib/itam/permissions';

import { ApprovalReviewBlock } from './approval-review.js';

/**
 * A request page's 等你决定 (`DomainConfig.Decisions`): the review block,
 * told whether the request waits on the reader from the approval trail the
 * page's actions already read (same query, so no second request).
 */
export function createApprovalDecisions(
  subjectType: 'purchaseOrders' | 'disposals',
  path: string,
): ComponentType<{ readonly record: ItamRecord }> {
  return function ApprovalDecisions({ record }) {
    const api = useApi();
    const me = useCurrentUserId();
    const id =
      typeof record.id === 'string' ? record.id : String(record.id ?? '');
    const pending = record.status === 'pendingApproval';
    const trail = useQuery({
      queryKey: ['itam', path, 'approvals', id],
      queryFn: async () =>
        (
          await api.request<{ data: ItamRecord[] }>({
            path: `${path}/${id}/approvals`,
          })
        ).data,
      enabled: pending,
    });
    const asked = trail.data?.find((entry) => entry.status === 'pending');
    const waitingOnReader =
      pending &&
      me !== undefined &&
      Array.isArray(asked?.approverIds) &&
      (asked.approverIds as unknown[]).includes(me);
    return (
      <ApprovalReviewBlock
        subjectType={subjectType}
        subjectId={id}
        waitingOnReader={waitingOnReader}
      />
    );
  };
}
