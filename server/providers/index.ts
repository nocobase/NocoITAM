import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ItamProvider from './itam/index.js';
import ItamSchedulesProvider from './itam-schedules.js';
import ItamAgentsProvider from './itam-agents/index.js';

export {
  approvalServiceToken,
  deviceServiceToken,
  deviceSyncServiceToken,
  deviceReviewServiceToken,
  attachmentServiceToken,
  auditServiceToken,
  disposalServiceToken,
  repairServiceToken,
  demoServiceToken,
  historyServiceToken,
  importServiceToken,
  maintenanceServiceToken,
  procurementServiceToken,
  documentReaderToken,
  receiptRunServiceToken,
  reportServiceToken,
  entitlementServiceToken,
  stockServiceToken,
  masterDataServiceToken,
  numberingServiceToken,
  settingsServiceToken,
  workbenchServiceToken,
} from './itam/index.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ItamProvider,
  ItamSchedulesProvider,
  ItamAgentsProvider,
];

export default serviceProviders;
