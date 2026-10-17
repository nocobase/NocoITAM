import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { DeviceDisposalsList } from '@/components/itam/device-disposals-list';
import { HistoryTimeline } from '@/components/itam/history-timeline';
import {
  EntitlementSeatsList,
  StockHoldingsList,
} from '@/components/itam/holdings-lists';
import {
  useDevicesHeldCount,
  useEntitlementSeats,
  useStockHoldings,
} from '@/lib/itam/holdings';
import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { TabSection } from '@/components/itam/tab-section';
import { RepairsList } from '@/components/itam/repairs-list';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { DEVICE_FIELDS } from '@/lib/itam/devices';
import { DevicePurchaseOrderList } from '@/components/itam/device-documents';
import {
  useItamRecord,
  useRelatedCounts,
  type ItamRecord,
} from '@/lib/itam/api';
import { useDeviceDisposals } from '@/lib/itam/device-disposals';
import { text } from '@/lib/itam/format';
import { REPAIRS_PATH } from '@/lib/itam/operations';
import { useCollectionPermissions } from '@/lib/itam/permissions';

export function DeviceHistoryTab(): ReactElement {
  const { id = '' } = useParams();
  const { keyLabels } = useOutletContext<{
    keyLabels: Readonly<Record<string, string>>;
  }>();
  return (
    <HistoryTimeline
      path={DEVICES_PATH}
      id={id}
      fields={DEVICE_FIELDS}
      keyLabels={keyLabels}
    />
  );
}

/** What the device carries: installed components, entitlement seats and devices assigned to it. */
export function DeviceRelatedTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const components = useStockHoldings('device', id, 'component');
  const seats = useEntitlementSeats('device', id);
  const devicesHeld = useDevicesHeldCount(id);
  // Each section heading shows its share of the tab's count.
  return (
    <div className='space-y-6'>
      {/* Devices assigned to this one (a cabinet, a spare box) come first,
          as on a person's holdings. */}
      <TabSection title={t('tabs.devices')} count={devicesHeld}>
        <DeviceListEmbed filter={{ assigneeType: 'device', assigneeId: id }} />
      </TabSection>
      <TabSection title={t('tabs.components')} count={components.data?.length}>
        <StockHoldingsList
          holderType='device'
          holderId={id}
          kind='component'
          takeBack
        />
      </TabSection>
      <TabSection title={t('entitlements.object')} count={seats.data?.length}>
        <EntitlementSeatsList holderType='device' holderId={id} />
      </TabSection>
    </div>
  );
}
export function DeviceAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='devices' ownerId={id} />;
}
/**
 * The documents raised around the device: the order it came in on, its
 * repairs and its disposals. Disposals need
 * their own read access.
 */
export function DeviceDocumentsTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const device = useItamRecord<ItamRecord>(DEVICES_PATH, id);
  const purchaseOrderId = text(device.data?.purchaseOrderId) || null;
  const disposalPermissions = useCollectionPermissions('disposals', ['read']);
  const [repairCount] = useRelatedCounts([
    { path: REPAIRS_PATH, query: { filter: { deviceId: id } } },
  ]);
  const disposals = useDeviceDisposals(id, Boolean(disposalPermissions.read));
  return (
    <div className='space-y-6'>
      <TabSection
        title={t('tabs.purchaseOrders')}
        count={device.data ? (purchaseOrderId ? 1 : 0) : undefined}
        empty={t('devices.noPurchaseOrder')}
      >
        <DevicePurchaseOrderList purchaseOrderId={purchaseOrderId} />
      </TabSection>
      <TabSection
        title={t('tabs.repairs')}
        count={repairCount}
        empty={t('devices.noRepairs')}
      >
        {/* The page header carries 完成维修 for the repair in progress. */}
        <RepairsList deviceId={id} completable={false} />
      </TabSection>
      {disposalPermissions.read ? (
        <TabSection
          title={t('tabs.disposals')}
          count={disposals.data?.length}
          empty={t('disposals.noneForDevice')}
        >
          <DeviceDisposalsList deviceId={id} />
        </TabSection>
      ) : null}
    </div>
  );
}
