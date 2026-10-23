import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { STATUS_TONE, type DeviceStatus } from '@/lib/itam/devices';
import {
  AUDIT_STATUS_TONE,
  DISPOSAL_STATUS_TONE,
  REPAIR_RESULT_TONE,
} from '@/lib/itam/operations';
import { PO_STATUS_TONE } from '@/lib/itam/procurement';
import { Badge } from '@/components/ui/badge';

export function DeviceStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string') return null;
  const tone =
    STATUS_TONE[status as DeviceStatus] ?? 'bg-muted text-muted-foreground';
  return (
    <Badge variant='secondary' className={tone}>
      {t(`enums.deviceStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** A purchase order's status, toned the way a device's is. */
export function PurchaseOrderStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string' || !status) return null;
  return (
    <Badge
      variant='secondary'
      className={PO_STATUS_TONE[status] ?? 'bg-muted text-muted-foreground'}
    >
      {t(`enums.poStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** A repair's result, toned the way a disposal's status is (2026-10-23). */
export function RepairResultBadge({
  result,
}: {
  readonly result: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof result !== 'string' || !result) return null;
  return (
    <Badge
      variant='secondary'
      className={REPAIR_RESULT_TONE[result] ?? 'bg-muted text-muted-foreground'}
    >
      {t(`enums.repairResult.${result}`, { defaultValue: result })}
    </Badge>
  );
}

/** A disposal's status, toned the way a purchase order's is. */
export function DisposalStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string' || !status) return null;
  return (
    <Badge
      variant='secondary'
      className={
        DISPOSAL_STATUS_TONE[status] ?? 'bg-muted text-muted-foreground'
      }
    >
      {t(`enums.disposalStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const EMPLOYMENT_TONE: Readonly<Record<string, string>> = {
  // On the books in green, what is fine; a joiner yet to start in blue;
  // a leaver muted (2026-10-21).
  active: 'bg-success text-success-foreground',
  pending: 'bg-info text-info-foreground',
  left: 'bg-muted text-muted-foreground',
};

/** A person's 在职状态. */
export function EmploymentStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string' || !status) return null;
  return (
    <Badge
      variant='secondary'
      className={EMPLOYMENT_TONE[status] ?? 'bg-muted text-muted-foreground'}
    >
      {t(`enums.employmentStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const COMPLIANCE_TONE: Readonly<Record<string, string>> = {
  // 超量 in red, what is wrong; 闲置 amber, money idle; 合规 green
  // (2026-10-22: plain text, 超量 read as calmly as 合规).
  compliant: 'bg-success text-success-foreground',
  overAllocated: 'bg-destructive/10 text-destructive',
  idle: 'bg-warning text-warning-foreground',
};

/** An entitlement's 合规状态, worked out from its seats. */
export function ComplianceStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string' || !status) return null;
  return (
    <Badge
      variant='secondary'
      className={COMPLIANCE_TONE[status] ?? 'bg-muted text-muted-foreground'}
    >
      {t(`enums.complianceStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/** An audit task's status, toned the way a purchase order's is. */
export function AuditStatusBadge({
  status,
}: {
  readonly status: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof status !== 'string' || !status) return null;
  return (
    <Badge
      variant='secondary'
      className={AUDIT_STATUS_TONE[status] ?? 'bg-muted text-muted-foreground'}
    >
      {t(`enums.auditStatus.${status}`, { defaultValue: status })}
    </Badge>
  );
}

/**
 * Perpetual or subscription. Not a status but a classification, and the one
 * that decides which fields a record even has, so it reads as a tint rather
 * than a neutral outline: a bought licence in the calm blue
 * (the primary is near-black in some themes, which read as a plain grey
 * tag), a
 * subscription in the amber that marks what renews and expires.
 */
export function EntitlementKindBadge({
  kind,
}: {
  readonly kind: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (typeof kind !== 'string' || !kind) return null;
  return (
    <Badge
      variant='secondary'
      className={
        kind === 'subscription'
          ? 'bg-warning text-warning-foreground'
          : 'bg-info text-info-foreground'
      }
    >
      {t(`enums.entitlementKind.${kind}`, { defaultValue: kind })}
    </Badge>
  );
}
