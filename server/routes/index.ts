import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { aiRoutes } from './itam/ai.js';
import { approvalRoutes } from './itam/approvals.js';
import { deviceRoutes } from './itam/devices.js';
import { auditRoutes } from './itam/audits.js';
import { disposalRoutes } from './itam/disposals.js';
import { repairRoutes } from './itam/repairs.js';
import { reportRoutes } from './itam/reports.js';
import { userDirectoryRoutes } from './itam/users.js';
import { workbenchRoutes } from './itam/workbench.js';
import {
  attachmentFileRoutes,
  attachmentLinkRoutes,
} from './itam/attachments.js';
import { dataRoutes } from './itam/data.js';
import { purchaseOrderRoutes } from './itam/purchase-orders.js';
import { entitlementRoutes } from './itam/entitlements.js';
import { stockRoutes } from './itam/stock.js';
import { masterDataRoutes } from './itam/master-data.js';
import { settingsRoutes } from './itam/settings.js';

const routes: readonly AppRouteContribution<Application>[] = [
  settingsRoutes,
  userDirectoryRoutes,
  workbenchRoutes,
  reportRoutes,
  aiRoutes,
  dataRoutes,
  masterDataRoutes,
  deviceRoutes,
  stockRoutes,
  entitlementRoutes,
  purchaseOrderRoutes,
  approvalRoutes,
  repairRoutes,
  auditRoutes,
  disposalRoutes,
  attachmentLinkRoutes,
  ...attachmentFileRoutes,
];

export default routes;
