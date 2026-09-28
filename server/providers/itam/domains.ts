import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { ServiceContainer } from '@nocobase/service-provider';

import { deviceServiceToken } from './devices.js';
import { auditServiceToken } from './audits.js';
import type { ListOptions, ListResult, Row } from './collection-query.js';
import { MASTER_DATA_COLLECTIONS } from './collections.js';
import { disposalServiceToken } from './disposals.js';
import { entitlementServiceToken } from './entitlements.js';
import { masterDataServiceToken } from './master-data.js';
import { procurementServiceToken } from './procurement.js';
import { repairServiceToken } from './repairs.js';
import { stockServiceToken } from './stock.js';

/**
 * Uniform read access to every listable collection by name, for the
 * places that take a collection as data — exports and the AI tools. Each
 * call goes through the owning service, so record filters and cost-field
 * trimming apply exactly as on the pages.
 */
export const LISTABLE_COLLECTIONS: readonly [string, ...string[]] = [
  'devices',
  'stockItems',
  'entitlements',
  'purchaseOrders',
  'auditTasks',
  'disposals',
  ...MASTER_DATA_COLLECTIONS.map((collection) => collection.name),
];

export interface DomainAccess {
  list(
    collection: string,
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    collection: string,
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
}

export function createDomainAccess(container: ServiceContainer): DomainAccess {
  const masterData = container.resolve(masterDataServiceToken);
  const domain = (collection: string) => {
    switch (collection) {
      case 'devices':
        return container.resolve(deviceServiceToken);
      case 'stockItems':
        return container.resolve(stockServiceToken);
      case 'entitlements':
        return container.resolve(entitlementServiceToken);
      case 'purchaseOrders':
        return container.resolve(procurementServiceToken);
      case 'auditTasks':
        return container.resolve(auditServiceToken);
      case 'disposals':
        return container.resolve(disposalServiceToken);
      // Read by the assistant; the data routes do not list repairs.
      case 'repairs':
        return container.resolve(repairServiceToken);
      default:
        return undefined;
    }
  };
  return {
    list(collection, options, conditions) {
      const service = domain(collection);
      return service
        ? service.list(options, conditions)
        : masterData.list(collection, options, conditions);
    },
    get(collection, id, conditions) {
      const service = domain(collection);
      return service
        ? service.get(id, conditions)
        : masterData.get(collection, id, conditions);
    },
  };
}
