import { useTranslation } from '@nocobase/i18n/client';
import { Cpu, KeyRound, MonitorSmartphone, Mouse, Printer } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { text } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

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
  className,
}: {
  readonly value: unknown;
  readonly label?: ReactNode;
  /** For a tag on a tinted band, which its own fill would disappear into. */
  readonly className?: string;
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
    // The five asset types are what this application is about, so their tag
    // carries a colour rather than the neutral fill every other tag has —
    // which also keeps it off the tinted bands it sits on. `--info`, because
    // the theme is monochrome apart from the four state colours and the
    // other three claim something an asset type does not: good, watch out,
    // wrong. Not the `outline` variant either: `styles.css` fills that one
    // from a two-attribute selector no single utility class can outrank.
    <Badge
      variant='secondary'
      className={cn('bg-info text-info-foreground', className)}
    >
      {Icon ? <Icon className='size-3' aria-hidden='true' /> : null}
      {label ?? t(`enums.appliesTo.${kind}`, { defaultValue: kind })}
    </Badge>
  );
}
