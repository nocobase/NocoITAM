import { CollapsibleText } from '@/components/itam/collapsible-text';
import type { SummaryItem } from '@/components/itam/detail-page';
import { DeviceDisposalSummary } from '@/components/itam/device-disposal-summary';
import { DeviceRepairSummary } from '@/components/itam/device-repair-summary';
import { DeviceRelation } from '@/components/itam/device-relation';
import { FieldLabel } from '@/components/itam/field-label';
import { OverdueBadge } from '@/components/itam/overdue-badge';
import { RecordApprover } from '@/components/itam/record-approver';
import {
  DeviceStatusBadge,
  AuditStatusBadge,
  DisposalStatusBadge,
  PurchaseOrderStatusBadge,
} from '@/components/itam/status-badge';
import { Badge } from '@/components/ui/badge';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { useDeviceDisposals } from '@/lib/itam/device-disposals';
import { deviceRelationLabel } from '@/lib/itam/devices';
import { DISPOSALS_PATH, REPAIRS_PATH } from '@/lib/itam/operations';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import { formatMoney, text } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * What a record's summary strip says, one entry per collection whose
 * detail page carries a strip. `items` may use hooks: a page calls only
 * its own collection's entry. The record drawer shows the detail page
 * itself, strip included.
 */
export interface RecordSummary {
  readonly items: (record: ItamRecord, t: Translate) => SummaryItem[];
}

function useDeviceSummary(record: ItamRecord, t: Translate): SummaryItem[] {
  const permissions = useCollectionPermissions('disposals', ['read']);
  // Who may put a wrong status right: by default the asset managers.
  const devicePermissions = useCollectionPermissions('devices', [
    'correctStatus',
  ]);
  const repairPermissions = useCollectionPermissions('repairs', ['read']);
  // The repair a device in repair is out on (2026-10-16), as a disposal
  // shows for one being disposed of.
  const inRepair = text(record.status) === 'inRepair';
  const repairs = useItamList(
    REPAIRS_PATH,
    {
      filter: { deviceId: text(record.id), result: 'inProgress' },
      page: 1,
      pageSize: 1,
    },
    { enabled: inRepair && Boolean(repairPermissions.read) },
  );
  const repair = inRepair ? repairs.data?.data[0] : undefined;
  const disposals = useDeviceDisposals(
    text(record.id),
    Boolean(permissions.read),
  );
  // The disposal that counts: an open one, else the executed one that took
  // the device out; rejected / withdrawn ones are history only.
  const disposal =
    disposals.data?.find((row) =>
      ['draft', 'pendingApproval', 'approved'].includes(text(row.status)),
    ) ?? disposals.data?.find((row) => row.status === 'executed');
  return [
    {
      key: 'status',
      // Why there is no editing it (2026-10-20): the operations move it,
      // and a wrong one is corrected by whoever may — or asked of them.
      label: (
        <FieldLabel
          label={t('fields.status')}
          hint={
            devicePermissions.correctStatus
              ? 'devices.statusHint'
              : 'devices.statusHintAsk'
          }
        />
      ),
      value: <DeviceStatusBadge status={text(record.status)} />,
    },
    ...(repair
      ? [
          {
            key: 'repair',
            label: t('devices.repairLabel'),
            value: <DeviceRepairSummary repair={repair} />,
          },
        ]
      : []),
    ...(disposal
      ? [
          {
            key: 'disposal',
            label: t('devices.disposalLabel'),
            value: <DeviceDisposalSummary disposal={disposal} />,
          },
        ]
      : []),
    // Who has the device, only when someone does (or it is reserved).
    ...(record.assigneeId || record.reservedForId
      ? [
          {
            key: 'assignee',
            label: deviceRelationLabel(record, t),
            value: <DeviceRelation device={record} />,
          },
        ]
      : []),
  ];
}

export const RECORD_SUMMARIES: Readonly<Record<string, RecordSummary>> = {
  devices: {
    items: useDeviceSummary,
  },
  disposals: {
    items: (record, t) => [
      {
        key: 'status',
        label: t('fields.status'),
        value: <DisposalStatusBadge status={record.status} />,
      },
      // Beside the status it belongs to, from the moment it is submitted:
      // who was asked while it waits, and who decided it afterwards.
      ...(text(record.status) === 'draft'
        ? []
        : [
            {
              key: 'approver',
              label: t('procurement.approver'),
              value: (
                <RecordApprover
                  path={DISPOSALS_PATH}
                  recordId={text(record.id)}
                />
              ),
            },
          ]),
      {
        key: 'deviceCount',
        label: t('fields.deviceCount'),
        value: text(record.deviceCount) || '0',
      },
      {
        key: 'bookValueTotal',
        label: t('fields.bookValueTotal'),
        value: formatMoney(record.bookValueTotal, text(record.currency)) || '—',
      },
    ],
  },
  repairs: {
    items: (record, t) => [
      {
        key: 'result',
        label: t('fields.repairResult'),
        value: (
          <Badge
            variant={record.result === 'inProgress' ? 'secondary' : 'outline'}
            className={
              record.result === 'inProgress'
                ? 'bg-warning text-warning-foreground'
                : undefined
            }
          >
            {t(`enums.repairResult.${text(record.result)}`, {
              defaultValue: text(record.result),
            })}
          </Badge>
        ),
      },
      // The cost reaches only readers with cost access; without it the
      // field is absent and so is the item.
      ...('cost' in record
        ? [
            {
              key: 'cost',
              label: t('fields.cost'),
              value: formatMoney(record.cost, text(record.currency)) || '—',
            },
          ]
        : []),
    ],
  },
  purchaseOrders: {
    items: (record, t) => [
      {
        key: 'status',
        label: t('fields.status'),
        // An order still waiting on goods past the date the vendor gave says
        // so beside its status (2026-10-05) — the 采购到货逾期 reminder it
        // replaces only ever said it on the workbench.
        value: (
          <span className='inline-flex items-center gap-1.5'>
            <PurchaseOrderStatusBadge status={record.status} />
            {['ordered', 'partiallyReceived'].includes(text(record.status)) ? (
              <OverdueBadge date={record.expectedAt} />
            ) : null}
          </span>
        ),
      },
      // Beside the status it belongs to: who was asked while it waits, and
      // who decided it afterwards. A draft has been asked of nobody — and a
      // withdrawn request puts it back to draft. The record does not carry
      // the name, the approval does, so the value fetches it where hooks are
      // allowed.
      ...(text(record.status) === 'draft'
        ? []
        : [
            {
              key: 'approver',
              label: t('procurement.approver'),
              value: (
                <RecordApprover
                  path={PURCHASE_ORDERS_PATH}
                  recordId={text(record.id)}
                />
              ),
            },
          ]),
      // Like a repair's cost: without cost access the estimate is absent
      // and so is the item.
      ...('estimatedTotal' in record
        ? [
            {
              key: 'estimatedTotal',
              label: t('fields.estimatedTotal'),
              value:
                formatMoney(record.estimatedTotal, text(record.currency)) ||
                '—',
            },
          ]
        : []),
      // Why it was cancelled belongs beside the status that says it was, not
      // among the purchase fields it never reached.
      ...(text(record.cancelReason)
        ? [
            {
              key: 'cancelReason',
              label: t('fields.cancelReason'),
              // Free text on a one-line strip: not a value to weigh like the
              // others, so it keeps the normal weight and folds tightly.
              value: (
                <CollapsibleText
                  text={text(record.cancelReason)}
                  className='font-normal'
                  chars={60}
                  lines={1}
                />
              ),
            },
          ]
        : []),
    ],
  },
  auditTasks: {
    items: (record, t) => [
      {
        key: 'status',
        label: t('fields.status'),
        value: <AuditStatusBadge status={record.status} />,
      },
      {
        key: 'progress',
        label: t('audits.countProgress'),
        value: `${text(record.countedCount) || 0} / ${text(record.expectedCount) || 0}`,
      },
      {
        key: 'differences',
        label: t('fields.differenceCount'),
        value: text(record.differenceCount) || '0',
      },
    ],
  },
};
