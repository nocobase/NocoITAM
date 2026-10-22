import type { HistoryEvent } from '@/components/itam/history-timeline';
import { formatMoney } from '@/lib/itam/format';

/** Localised summary from type + payload; the stored summary is the fallback. */
export function describeEvent(
  row: HistoryEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
  statusEnum: string,
  /** Substituted for the record the summary names, so it can be linked. */
  targetOverride?: { readonly slot: 'target' | 'from'; readonly mark: string },
): string {
  const payload = row.payload ?? {};
  const label = (key: string) =>
    typeof payload[key] === 'string' ? payload[key] : '';
  const status = (key: string) => {
    const value = payload[key];
    return typeof value === 'string'
      ? t(`enums.${statusEnum}.${value}`, { defaultValue: value })
      : '';
  };
  // Repair events: the method / result comes from the payload, or from the
  // system summary of an event written before the payload carried it.
  if (row.type === 'repairCreated') {
    const method =
      label('method') ||
      /^Repair record created \((\w+)\)$/.exec(row.summary)?.[1] ||
      /^(\w+): /.exec(row.summary)?.[1] ||
      '';
    return method
      ? t('history.summaries.repairCreated', {
          method: t(`enums.repairMethod.${method}`, { defaultValue: method }),
        })
      : row.summary;
  }
  if (row.type === 'repairCompleted') {
    const result =
      label('result') || /^Repair (\w+)$/.exec(row.summary)?.[1] || '';
    if (!result) return row.summary;
    const disposition = label('disposition');
    const summary = t('history.summaries.repairCompleted', {
      result: t(`enums.repairResult.${result}`, { defaultValue: result }),
    });
    // Where the device went is on events written since the disposition
    // became a choice of its own.
    return disposition
      ? `${summary}${t('history.quick.separator')}${t(
          `history.repairDispositions.${disposition}`,
        )}`
      : summary;
  }
  // A leave date that arrived: the scheduler marked the person as left.
  if (row.type === 'left' && payload.automatic === true)
    return t('history.summaries.leftOnLeaveDate', {
      defaultValue: row.summary,
      date: label('leaveDate'),
    });
  // The renewal date the scheduler rolled forward: two dates, no enum.
  if (row.type === 'renewalAdvanced')
    return t('history.summaries.renewalAdvanced', {
      defaultValue: row.summary,
      from: label('from'),
      to: label('to'),
    });
  // A department's 入职配置 changed (2026-10-22): which kit, and its items
  // added, removed or changed in number, by name.
  if (row.type === 'onboardingKitChanged') {
    const position = label('position');
    const kit = position
      ? t('departmentKits.positionKit', { position })
      : t('departmentKits.default');
    const entries = (key: string) =>
      Array.isArray(payload[key])
        ? (payload[key] as Record<string, unknown>[])
        : [];
    const items = (key: string) =>
      entries(key)
        .map((item) => `${String(item.label)} ×${String(item.quantity)}`)
        .join(t('history.summaries.kitItemsJoin'));
    const parts = [
      entries('added').length
        ? `${t('history.entry.added')} ${items('added')}`
        : '',
      entries('removed').length && payload.deleted !== true
        ? `${t('history.entry.removed')} ${items('removed')}`
        : '',
      entries('changed').length
        ? `${t('history.entry.changed')} ${entries('changed')
            .map(
              (item) =>
                `${String(item.label)} ×${String(item.from)} → ×${String(item.to)}`,
            )
            .join(t('history.summaries.kitItemsJoin'))}`
        : '',
    ].filter(Boolean);
    const head =
      payload.deleted === true
        ? t('history.summaries.kitRemoved', { kit })
        : payload.created === true
          ? t('history.summaries.kitSet', { kit })
          : kit;
    return parts.length
      ? t('history.summaries.kitChanges', {
          kit: head,
          changes: parts.join(t('history.summaries.kitPartsJoin')),
        })
      : head;
  }
  // Audit, receiving and disposal-list events: counts and a
  // name from the payload. An older event without the name keeps its
  // stored summary rather than reading half a sentence.
  const count = (key: string) =>
    typeof payload[key] === 'number' ? payload[key] : 0;
  switch (row.type) {
    case 'created':
      // A stock item created with opening stock says how much came in; a
      // disposal, how many devices it lists.
      if (typeof payload.quantity === 'number')
        return t('history.summaries.createdWithStock', {
          quantity: payload.quantity,
        });
      if (typeof payload.deviceCount === 'number')
        return t('history.summaries.createdWithDevices', {
          count: payload.deviceCount,
        });
      // An entitlement: how many seats it starts with, or that it counts none.
      if ('seatCount' in payload)
        return typeof payload.seatCount === 'number'
          ? t('history.summaries.createdWithSeats', {
              count: payload.seatCount,
            })
          : t('history.summaries.createdUnlimitedSeats');
      break;
    case 'disposalExecuted': {
      const proceeds = payload.proceeds;
      return t(
        proceeds === null || proceeds === undefined || proceeds === ''
          ? 'history.summaries.disposalExecuted'
          : 'history.summaries.disposalExecutedWithProceeds',
        {
          count: count('count'),
          amount: formatMoney(
            proceeds,
            typeof payload.currency === 'string' ? payload.currency : null,
          ),
        },
      );
    }
    case 'approvalRequested':
      // Requests made since an approver is required name them.
      if (label('targetLabel'))
        return t('history.summaries.approvalRequestedOf', {
          target: label('targetLabel'),
        });
      break;
    case 'devicesChanged':
      return t('history.summaries.devicesChanged', {
        count: Array.isArray(payload.deviceIds) ? payload.deviceIds.length : 0,
      });
    case 'counted':
      return t('history.summaries.counted', {
        count: count('count'),
        counted: count('counted'),
        expected: count('expected'),
      });
    case 'resolved':
      return t('history.summaries.resolved', {
        count: count('count'),
        left: count('differences'),
      });
    case 'recoveryPrepared':
      return t('history.summaries.recoveryPrepared', {
        devices: count('devices'),
        stock: count('stock'),
        seats: count('seats'),
      });
    case 'stockedIn':
      return t('history.summaries.stockedIn', { count: count('count') });
    // Device sync (2026-10-14): which platform record the device was tied
    // to, and why.
    case 'managedLinked':
    case 'managedUnlinked':
      return t(
        row.type === 'managedUnlinked'
          ? 'history.summaries.managedUnlinked'
          : // By hand (step 2), or by the serial on a pull.
            payload.manual === true
            ? 'history.summaries.managedLinkedManual'
            : 'history.summaries.managedLinked',
        {
          source: t(`deviceSync.sources.${label('source')}`, {
            defaultValue: label('source'),
          }),
          target: label('targetLabel'),
        },
      );
    // 忽略 on a difference the platforms showed (step 2), and taking it
    // back (2026-10-16).
    case 'managedUndismissed':
    case 'managedDismissed':
      return t(`history.summaries.${row.type}`, {
        check: t(`deviceSync.checks.kinds.${label('kind')}`, {
          defaultValue: label('kind'),
        }),
      });
    // 不需要纳管 and taking it back (2026-10-15).
    case 'managedExempted':
      return t('history.summaries.managedExempted', {
        reason: label('reason'),
      });
    case 'managedUnexempted':
      return t('history.summaries.managedUnexempted');
    case 'unregisteredFound':
      return t('history.summaries.unregisteredFound', {
        target: label('label'),
      });
    case 'audited':
      return label('targetLabel')
        ? t('history.summaries.audited', {
            target: label('targetLabel'),
            result: t(`enums.auditResult.${label('result')}`, {
              defaultValue: label('result'),
            }),
          })
        : row.summary;
    case 'received':
      return label('targetLabel')
        ? t(
            // A batch prepared from a delivery document names it.
            label('document')
              ? 'history.summaries.receivedFromDocument'
              : 'history.summaries.received',
            {
              quantity: count('quantity'),
              target: label('targetLabel'),
              document: label('document'),
            },
          )
        : row.summary;
    default:
      break;
  }
  // Older events lack the counterpart's name or the next status; the
  // template degrades to what the payload has.
  const from = label('previousTargetLabel');
  const next = status('nextStatus');
  const key =
    // A stock adjustment reads as a gain or a loss, with its reason.
    row.type === 'adjust' && typeof payload.quantity === 'number'
      ? payload.quantity < 0
        ? 'history.summaries.adjustRemoved'
        : 'history.summaries.adjustAdded'
      : // A stock return names the holder and the quantity; a device return
        // names where it came from and the next status.
        row.type === 'return' && typeof payload.quantity === 'number'
        ? 'history.summaries.stockReturn'
        : row.type === 'return'
          ? label('condition')
            ? 'history.summaries.returnWithCondition'
            : from && next
              ? 'history.summaries.return'
              : next
                ? 'history.summaries.returnStatusOnly'
                : from
                  ? 'history.summaries.returnFromOnly'
                  : 'history.summaries.returnBare'
          : row.type === 'transfer' && !from
            ? 'history.summaries.transferTo'
            : // A seat event on the holder's page names the entitlement; on
              // the entitlement's page it names the holder.
              (row.type === 'seatAssign' || row.type === 'seatReclaim') &&
                label('entitlementId')
              ? `history.summaries.${row.type}ed`
              : // A seat key event says whose seat it was when the holder is
                // known, and whether the key was set or cleared.
                row.type === 'productKey'
                ? `history.summaries.productKey${
                    payload.cleared === true
                      ? 'Cleared'
                      : payload.replaced === true
                        ? 'Replaced'
                        : 'Set'
                  }`
                : row.type === 'seatKey'
                  ? `history.summaries.seatKey${
                      payload.cleared === true ||
                      (payload.cleared === undefined &&
                        /cleared/i.test(row.summary))
                        ? 'Cleared'
                        : 'Set'
                    }${label('targetLabel') ? 'For' : ''}`
                  : // A decision reads with its comment when one was left.
                    (row.type === 'approvalApproved' ||
                        row.type === 'approvalRejected') &&
                      label('comment')
                    ? `history.summaries.${row.type}WithComment`
                    : ((row.type === 'linesChanged' && label('reason')
                          ? 'history.summaries.linesChangedWithReason'
                          : undefined) ??
                        // Seats gained or dropped outside an order say why, the
                        // way a status change does.
                        ((row.type === 'seatsAdded' ||
                          row.type === 'seatsRemoved') &&
                          label('notes')))
                      ? `history.summaries.${row.type}WithReason`
                      : // A device moved by a disposal names it.
                        row.type === 'statusChange' &&
                          label('disposalId') &&
                          label('targetLabel')
                        ? 'history.summaries.statusChangeByDisposal'
                        : row.type === 'statusChange' &&
                            label('auditTaskId') &&
                            label('targetLabel')
                          ? 'history.summaries.statusChangeByAudit'
                          : // A request approved without anybody deciding it
                            // says so, rather than reading as a decision.
                            row.type === 'statusChange' &&
                              label('approvalSkipped') === 'disabled'
                            ? 'history.summaries.statusChangeApprovalDisabled'
                            : row.type === 'statusChange' &&
                                (label('reason') || label('notes'))
                              ? 'history.summaries.statusChangeWithReason'
                              : row.type === 'unreserve' &&
                                  payload.expired === true
                                ? 'history.summaries.unreserveExpired'
                                : `history.summaries.${row.type}`;
  return t(key, {
    defaultValue: row.summary,
    count: Number(payload.count ?? 0),
    condition: label('condition'),
    target:
      targetOverride?.slot === 'target'
        ? targetOverride.mark
        : label('targetLabel'),
    from:
      targetOverride?.slot === 'from'
        ? targetOverride.mark
        : from || status('from'),
    to: status('to'),
    next: status('nextStatus'),
    date: label('expectedReturnDate') || label('reservedUntil'),
    reason:
      // An adjustment's reason is a code with an optional note.
      row.type === 'adjust'
        ? [
            label('reason')
              ? t(`enums.stockAdjustReason.${label('reason')}`, {
                  defaultValue: label('reason'),
                })
              : '',
            label('notes'),
          ]
            .filter(Boolean)
            .join(label('reason') && label('notes') ? '，' : '')
        : label('reason') || label('notes'),
    comment: label('comment'),
    quantity:
      typeof payload.quantity === 'number' ? Math.abs(payload.quantity) : '',
    name: label('filename'),
  });
}

/**
 * What a quick action did, from the names its event recorded; empty for an
 * event written before the payload carried them.
 */
function quickActionDetail(
  action: string,
  payload: Record<string, unknown>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const label = (key: string) =>
    typeof payload[key] === 'string' ? payload[key] : '';
  const enumLabel = (group: string, key: string) =>
    label(key)
      ? t(`enums.${group}.${label(key)}`, { defaultValue: label(key) })
      : '';
  const parts: string[] = [];
  switch (action) {
    case 'assignDevice':
    case 'assignLoaner':
    case 'takeBackLent':
      if (label('deviceLabel') && label('targetLabel'))
        parts.push(
          t(
            action === 'assignLoaner'
              ? 'history.quick.lent'
              : action === 'takeBackLent'
                ? 'history.quick.takenBackLent'
                : 'history.quick.assigned',
            {
              device: label('deviceLabel'),
              target: label('targetLabel'),
            },
          ),
        );
      break;
    case 'assignSeat':
      if (label('licenseLabel') && label('targetLabel'))
        parts.push(
          t('history.quick.seat', {
            license: label('licenseLabel'),
            target: label('targetLabel'),
          }),
        );
      break;
    case 'issueStock':
      if (label('itemLabel') && label('targetLabel'))
        parts.push(
          t('history.quick.issued', {
            item: label('itemLabel'),
            quantity:
              typeof payload.quantity === 'number' ? payload.quantity : '',
            target: label('targetLabel'),
          }),
        );
      break;
    case 'takeBackStock':
      if (label('itemLabel') && label('targetLabel'))
        parts.push(
          t('history.quick.takenBack', {
            item: label('itemLabel'),
            quantity:
              typeof payload.quantity === 'number' ? payload.quantity : '',
            target: label('targetLabel'),
          }),
        );
      break;
    case 'reclaimSeat':
      if (label('licenseLabel') && label('targetLabel'))
        parts.push(
          t('history.quick.seatReclaimed', {
            license: label('licenseLabel'),
            target: label('targetLabel'),
          }),
        );
      break;
    case 'createRepair':
      if (label('method')) parts.push(enumLabel('repairMethod', 'method'));
      if (label('vendorLabel'))
        parts.push(t('history.quick.vendor', { vendor: label('vendorLabel') }));
      break;
    case 'return':
      if (label('deviceLabel')) parts.push(label('deviceLabel'));
      if (label('nextStatus'))
        parts.push(
          t('history.quick.nextStatus', {
            status: enumLabel('deviceStatus', 'nextStatus'),
          }),
        );
      if (label('locationLabel'))
        parts.push(
          t('history.quick.location', { location: label('locationLabel') }),
        );
      if (label('condition'))
        parts.push(
          t('history.quick.condition', { condition: label('condition') }),
        );
      break;
    case 'transfer':
      if (label('deviceLabel') && label('targetLabel'))
        parts.push(
          t('history.quick.transferred', {
            device: label('deviceLabel'),
            target: label('targetLabel'),
          }),
        );
      break;
    case 'createDisposal':
      // The disposal number is the event's link.
      if (label('method')) parts.push(enumLabel('disposalMethod', 'method'));
      if (label('reason')) parts.push(enumLabel('disposalReason', 'reason'));
      if (typeof payload.submitted === 'boolean')
        parts.push(
          t(
            payload.submitted
              ? 'history.quick.submitted'
              : 'history.quick.savedDraft',
          ),
        );
      break;
    case 'createPurchaseOrder':
      // The order number is the event's link.
      if (typeof payload.quantity === 'number')
        parts.push(t('history.quick.quantity', { quantity: payload.quantity }));
      if (label('vendorLabel'))
        parts.push(t('history.quick.vendor', { vendor: label('vendorLabel') }));
      parts.push(
        t(
          payload.submitted === true
            ? 'history.quick.submitted'
            : 'history.quick.savedDraft',
        ),
      );
      break;
    default:
      break;
  }
  return parts.join(t('history.quick.separator'));
}

/** The detail text of a quick action that also links a record. */
export function quickActionLinkedDetail(
  row: HistoryEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const payload = row.payload ?? {};
  const action = typeof payload.action === 'string' ? payload.action : '';
  return row.type === 'quickAction' && action && quickActionLink(row)
    ? quickActionDetail(action, payload, t)
    : '';
}

/**
 * The record a quick action created, for the timeline to link: the purchase
 * order, disposal or repair by its number.
 */
export function quickActionLink(
  row: HistoryEvent,
): { readonly to: string; readonly label: string } | undefined {
  if (row.type !== 'quickAction') return undefined;
  const payload = row.payload ?? {};
  const label = (key: string) =>
    typeof payload[key] === 'string' ? payload[key] : '';
  if (label('purchaseOrderId') && label('orderNo'))
    return {
      to: `/procurement/${label('purchaseOrderId')}`,
      label: label('orderNo'),
    };
  if (label('disposalId') && label('disposalNo'))
    return {
      to: `/disposals/${label('disposalId')}`,
      label: label('disposalNo'),
    };
  if (label('repairId') && label('repairNo'))
    return { to: `/repairs/${label('repairId')}`, label: label('repairNo') };
  return undefined;
}

/** Split around the record a summary names, so the timeline can link it. */
const TARGET_MARK = '\u0000';

export function describeEventParts(
  row: HistoryEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
  statusEnum: string,
  slot: 'target' | 'from',
): {
  readonly before: string;
  readonly after: string;
  readonly linked: boolean;
} {
  const text = describeEvent(row, t, statusEnum, { slot, mark: TARGET_MARK });
  const index = text.indexOf(TARGET_MARK);
  return index < 0
    ? { before: text, after: '', linked: false }
    : {
        before: text.slice(0, index),
        after: text.slice(index + TARGET_MARK.length),
        linked: true,
      };
}

/**
 * The record an event's summary names: the holder it went to, the
 * entitlement whose seat it was, the order it came in on. The timeline
 * renders it as a link, so a name in the story opens the thing it names.
 */
export function eventTargetLink(row: HistoryEvent):
  | {
      readonly to: string;
      readonly label: string;
      readonly slot: 'target' | 'from';
    }
  | undefined {
  const payload = row.payload ?? {};
  const label = (key: string) =>
    typeof payload[key] === 'string' ? payload[key] : '';
  const holderRoute: Readonly<Record<string, string>> = {
    person: 'people',
    device: 'devices',
    location: 'locations',
  };
  // A return names the holder it came back from, where everything else
  // names where it went.
  const previous = holderRoute[label('previousTargetType')];
  if (previous && label('previousTargetId') && label('previousTargetLabel'))
    return {
      to: `/${previous}/${label('previousTargetId')}`,
      label: label('previousTargetLabel'),
      slot: 'from',
    };
  const name = label('targetLabel');
  if (!name) return undefined;
  // Named by the slot its writer used: a device's own holder, a seat's, or
  // a reservation's.
  const route =
    holderRoute[label('targetType')] ??
    holderRoute[label('holderType')] ??
    holderRoute[label('reservedForType')];
  const holderId =
    label('targetId') || label('holderId') || label('reservedForId');
  if (route && holderId)
    return { to: `/${route}/${holderId}`, label: name, slot: 'target' };
  const byKey: readonly (readonly [string, string])[] = [
    ['entitlementId', 'entitlements'],
    ['deviceId', 'devices'],
    ['personId', 'people'],
    ['purchaseOrderId', 'procurement'],
    ['disposalId', 'disposals'],
    ['auditTaskId', 'audits'],
  ];
  for (const [key, segment] of byKey)
    if (label(key))
      return { to: `/${segment}/${label(key)}`, label: name, slot: 'target' };
  // A stock item's route depends on its kind, which the event carries only
  // where the writer knew it.
  const stockRoute: Readonly<Record<string, string>> = {
    accessory: 'accessories',
    consumable: 'consumables',
    component: 'components',
  };
  const kind = stockRoute[label('stockKind')];
  if (kind && label('stockItemId'))
    return {
      to: `/${kind}/${label('stockItemId')}`,
      label: name,
      slot: 'target',
    };
  return undefined;
}
