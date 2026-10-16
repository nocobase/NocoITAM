import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

/**
 * 通知 moved into 收件箱 (2026-10-16, plan "Work agents"): its second tab,
 * beside 待我决定. The bell in the header and every link written before
 * still lead here, and on to it.
 */
export default function NotificationsPage(): ReactElement {
  return <Navigate to='/inbox?tab=notifications' replace />;
}
