import { useQuery } from '@tanstack/react-query';

import { useApi, useRelatedCounts, type ItamRecord } from './api.js';
import { DEVICES_PATH } from './device-api.js';
import { ENTITLEMENTS_PATH } from './entitlements.js';
import { STOCK_PATH, type StockKind } from './stock.js';

type HolderType = 'person' | 'location' | 'device';

/** What a holder has of the stock items, optionally of one kind. */
export function useStockHoldings(
  holderType: HolderType,
  holderId: string,
  kind?: StockKind,
) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', STOCK_PATH, 'holdings-of', holderType, holderId, kind],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${STOCK_PATH}/holdings-of/${holderType}/${holderId}`,
          query: kind ? { kind } : {},
        })
      ).data,
  });
}

/** The entitlement seats a person or device holds. */
export function useEntitlementSeats(
  holderType: 'person' | 'device',
  holderId: string,
) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', ENTITLEMENTS_PATH, 'seats-of', holderType, holderId],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${ENTITLEMENTS_PATH}/seats-of/${holderType}/${holderId}`,
        })
      ).data,
  });
}

/** How many devices are assigned to this device (a cabinet, a spare box). */
export function useDevicesHeldCount(deviceId: string): number | undefined {
  const [count] = useRelatedCounts([
    {
      path: DEVICES_PATH,
      query: { filter: { assigneeType: 'device', assigneeId: deviceId } },
    },
  ]);
  return count;
}

/**
 * Installed components, held seats and devices assigned here, for the
 * device's 关联资产 tab badge; undefined until all three are known.
 */
export function useDeviceRelatedCount(deviceId: string): number | undefined {
  const components = useStockHoldings('device', deviceId, 'component');
  const seats = useEntitlementSeats('device', deviceId);
  const devices = useDevicesHeldCount(deviceId);
  return components.data && seats.data && devices !== undefined
    ? components.data.length + seats.data.length + devices
    : undefined;
}
