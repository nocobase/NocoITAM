import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

/**
 * 通知 moved into 收件箱 (2026-10-16): its 通知 tab,
 * beside AI 建议. The bell in the header and every link written before
 * still lead here, and on to it.
 */
export default function NotificationsPage(): ReactElement {
  return <Navigate to='/inbox?view=all' replace />;
}
