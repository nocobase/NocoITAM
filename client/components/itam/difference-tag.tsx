import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Where MDM and the register disagree, marked (2026-10-16): one tag for
 * every place a difference shows — the device page's MDM group, MDM 核对
 * and 待办 — in the theme's 注意 tone, or the destructive tag for a device
 * that should not be online at all (lost, disposed). Before, each place
 * coloured its own, and the device page alone had three.
 */
export function DifferenceTag({
  critical = false,
  className,
  children,
}: {
  readonly critical?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return critical ? (
    <Badge variant='destructive' className={className}>
      {children}
    </Badge>
  ) : (
    <Badge className={cn('bg-warning text-warning-foreground', className)}>
      {children}
    </Badge>
  );
}
