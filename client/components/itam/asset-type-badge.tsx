import { useTranslation } from '@nocobase/i18n/client';
import { Cpu, KeyRound, MonitorSmartphone, Mouse, Printer } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { text } from '@/lib/itam/format';

/** The same five icons used by the asset navigation entries. */
const icons = {
  device: MonitorSmartphone,
  accessory: Mouse,
  consumable: Printer,
  component: Cpu,
  entitlement: KeyRound,
};

export function AssetTypeBadge({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const kind = text(value);
  // A purchase line states the entitlement's kind rather than "entitlement"
  // (`license` is what perpetual was called before the two merged), and they
  // all wear the entitlement's icon.
  const Icon =
    icons[
      (['license', 'perpetual', 'subscription'].includes(kind)
        ? 'entitlement'
        : kind) as keyof typeof icons
    ];
  if (!kind) return <span className='text-muted-foreground'>—</span>;
  return (
    <Badge variant='outline'>
      {Icon ? <Icon className='size-3' aria-hidden='true' /> : null}
      {label ?? t(`enums.appliesTo.${kind}`, { defaultValue: kind })}
    </Badge>
  );
}
