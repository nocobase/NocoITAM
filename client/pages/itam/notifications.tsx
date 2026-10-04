import { NotificationInAppInbox } from '@nocobase/app-plugin-notification-in-app/client';
import type { ReactElement } from 'react';

import { Page } from '@/components/itam/page-header';

/**
 * 通知: the first place the in-app channel can be read at all.
 *
 * The register has been sending to it since it started — an overdue loan, a
 * leaver's recovery — into an inbox the application mounted nowhere, since
 * the plugin registers only a development page of its own. Its component
 * brings its own heading and needs `NotificationInAppProvider` above it,
 * which `client/react-providers.ts` mounts for the whole application; without
 * it the component throws rather than degrading.
 */
export default function NotificationsPage(): ReactElement {
  return (
    <Page>
      <NotificationInAppInbox />
    </Page>
  );
}
